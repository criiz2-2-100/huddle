import { MODEL_PREFERENCE, ROLE_CLOUD_MODELS, ROLE_MODEL_DEFAULTS } from './config.js'

const cleanBase = (url) => String(url || '').trim().replace(/\/+$/, '')

export class LlmError extends Error {
  constructor(message, { status, body } = {}) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.body = body
  }
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export function isAbort(error, signal) {
  return error?.name === 'AbortError' || Boolean(signal?.aborted)
}

/* ------------------------------------------------------------------ */
/* Model discovery                                                     */
/* ------------------------------------------------------------------ */

let cache = { baseUrl: '', models: [] }

export async function listOllamaModels(baseUrl) {
  const base = cleanBase(baseUrl)
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) {
      return { ok: false, models: [], error: `Ollama answered HTTP ${response.status} at ${base}` }
    }
    const data = await response.json()
    const models = (data.models || [])
      .map((model) => {
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : []
        const name = String(model.name || '')
        return {
          name,
          cloud: Boolean(model.remote_host) || name.endsWith(':cloud'),
          size: Number(model.size) || 0,
          family: model.details?.family || '',
          params: model.details?.parameter_size || '',
          context: Number(model.details?.context_length) || 0,
          capabilities,
          tools: capabilities.includes('tools'),
          completion: capabilities.length === 0 || capabilities.includes('completion'),
        }
      })
      .filter((model) => model.name && model.completion)
    cache = { baseUrl: base, models }
    return { ok: true, models, version: data.version || '' }
  } catch {
    cache = { baseUrl: base, models: [] }
    return { ok: false, models: [], error: `Ollama is not reachable at ${base}` }
  }
}

export function roleModelFor(settings, roboId) {
  const overrides = settings?.roboModels || {}
  if (Object.prototype.hasOwnProperty.call(overrides, roboId)) {
    // An explicit null is the Operator's "use the unit default" choice.
    return overrides[roboId] || settings?.model || ''
  }
  return ROLE_MODEL_DEFAULTS[roboId] || settings?.model || ''
}

const BIG_TASK_WORDS =
  /\b(architecture|architect|refactor|migration|migrate|codebase|entire|whole|end-to-end|deep|debug|root cause|audit|design|specification|implement|benchmark|compare|research|investigate|multi-step|large|complex)\b/gi

/** A local-first heuristic, deliberately conservative: suggestion only, never a switch. */
export function recommendCloud({ text, settings, roboIds }) {
  const clean = String(text || '')
  const hits = clean.match(BIG_TASK_WORDS) || []
  const big = clean.length >= 900 || hits.length >= 2 || (hits.length >= 1 && clean.length >= 420)
  if (!big) return null
  const suggestions = (roboIds || [])
    .map((roboId) => ({
      roboId,
      local: roleModelFor(settings, roboId),
      cloud: ROLE_CLOUD_MODELS[roboId] || '',
    }))
    .filter((item) => item.cloud && item.cloud !== item.local)
  if (!suggestions.length) return null
  return { reason: 'This request is large enough to benefit from a cloud specialist.', suggestions }
}

export function suggestModel(models) {
  const names = new Set(models.map((model) => model.name))
  for (const name of MODEL_PREFERENCE) if (names.has(name)) return name
  const local = models.find((model) => !model.cloud)
  return (local || models[0])?.name || ''
}

/** A local model to take over when a selected cloud model cannot run. */
export function pickLocalFallback(models, selected) {
  const local = (models || []).filter((model) => !model.cloud && model.name !== selected)
  for (const name of MODEL_PREFERENCE) {
    const found = local.find((model) => model.name === name)
    if (found) return found.name
  }
  return local[0]?.name || ''
}

/**
 * Decide which model a turn should try. Cloud models stay primary while they
 * work; a local fallback is attached so the dispatcher can recover if the
 * cloud call fails. Missing models are replaced before the turn starts.
 */
export function planModel(selected, catalog) {
  const models = catalog?.models || []
  const fallback = pickLocalFallback(models, selected)
  if (!selected) return { primary: fallback, fallback: '', reason: fallback ? 'default' : 'none' }
  if (!models.length) return { primary: selected, fallback: '', reason: '' }
  const found = models.find((model) => model.name === selected)
  if (!found) {
    return {
      primary: fallback || selected,
      fallback: '',
      reason: fallback ? 'missing' : 'none',
    }
  }
  return {
    primary: selected,
    fallback: found.cloud ? fallback : '',
    reason: found.cloud && fallback ? 'cloud' : '',
  }
}

/** A failed cloud call is recoverable; a missing local model is not. */
export function isCloudFallbackError(error) {
  const status = Number(error?.status)
  if ([401, 403, 404, 429].includes(status) || status >= 500) return true
  return /cloud|signin|not installed|not found|does not support|unavailable|offline/i.test(
    String(error?.message || ''),
  )
}

/** true / false when we know, undefined when we haven't seen the model list. */
export function modelSupportsTools(baseUrl, model) {
  if (cache.baseUrl !== cleanBase(baseUrl)) return undefined
  const found = cache.models.find((item) => item.name === model)
  if (!found) return undefined
  if (found.capabilities.length === 0) return undefined
  return found.capabilities.includes('tools')
}

export async function listOpenAIModels(baseUrl, apiKey) {
  const base = cleanBase(baseUrl)
  if (!apiKey) return { ok: false, models: [], error: 'Add an API key in Setup to list online models.' }
  try {
    const response = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return { ok: false, models: [], error: `Provider answered HTTP ${response.status}` }
    }
    const data = await response.json()
    const models = (data.data || [])
      .map((model) => ({
        name: String(model.id || ''),
        cloud: true,
        size: 0,
        family: '',
        params: '',
        context: Number(model.context_length) || 0,
        capabilities: [],
        tools: true,
        completion: true,
      }))
      .filter((model) => model.name)
      .sort((a, b) => a.name.localeCompare(b.name))
    return { ok: true, models }
  } catch {
    return { ok: false, models: [], error: `Cannot reach ${base}` }
  }
}

/* ------------------------------------------------------------------ */
/* Streaming chat                                                      */
/* ------------------------------------------------------------------ */

/**
 * Yield { type: 'text' | 'thinking' | 'tool_calls' } from either Ollama's
 * native /api/chat or an OpenAI-compatible /chat/completions endpoint.
 */
export async function* streamChat(options) {
  if (options.provider === 'openai') {
    yield* streamOpenAI(options)
    return
  }
  yield* streamOllama(options)
}

async function* streamOllama({
  baseUrl,
  model,
  messages,
  tools,
  temperature,
  signal,
  think,
  json,
  numPredict,
  repeatPenalty,
  frequencyPenalty,
  presencePenalty,
}) {
  const base = cleanBase(baseUrl)
  // Ollama rejects a negative max_tokens with HTTP 400, including the old
  // "unlimited" convention. Use a generous positive ceiling for local models
  // (enough for long JSON replies) and the existing bounded cloud ceiling.
  const offline = !String(model || '').endsWith(':cloud')
  const requestedBudget = Number(numPredict)
  const budget = Number.isFinite(requestedBudget) && requestedBudget > 0
    ? requestedBudget
    : offline
      ? 8192
      : 900
  const url = `${base}/api/chat`
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        tools: tools?.length ? tools : undefined,
        think,
        format: json ? 'json' : undefined,
        keep_alive: '20m',
        options: {
          temperature: Math.max(0, Math.min(1.5, Number(temperature) || 0.85)),
          top_p: 0.92,
          num_predict: Math.max(1, Math.floor(budget)),
          ...(Number.isFinite(Number(repeatPenalty))
            ? { repeat_penalty: Number(repeatPenalty) }
            : {}),
          ...(Number.isFinite(Number(frequencyPenalty))
            ? { frequency_penalty: Number(frequencyPenalty) }
            : {}),
          ...(Number.isFinite(Number(presencePenalty))
            ? { presence_penalty: Number(presencePenalty) }
            : {}),
        },
      }),
      signal,
    })
  } catch (error) {
    if (isAbort(error, signal)) throw abortError()
    throw new LlmError(`Cannot reach Ollama at ${base}. Start it with \`ollama serve\`.`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new LlmError(ollamaMessage(response.status, body, model, base), {
      status: response.status,
      body,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const calls = []

  const handleLine = (line) => {
    if (!line) return null
    let data
    try {
      data = JSON.parse(line)
    } catch {
      return null
    }
    if (data.error) throw new LlmError(String(data.error))
    return data
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      const data = handleLine(line)
      if (!data) continue
      const message = data.message || {}
      if (message.thinking) yield { type: 'thinking', text: message.thinking }
      if (message.content) yield { type: 'text', text: message.content }
      if (Array.isArray(message.tool_calls)) {
        calls.push(...normalizeOllamaCalls(message.tool_calls))
      }
      if (data.done) {
        if (calls.length) yield { type: 'tool_calls', calls }
        return
      }
    }
  }

  if (buffer.trim()) {
    const data = handleLine(buffer.trim())
    if (data?.message?.content) yield { type: 'text', text: data.message.content }
  }
  if (calls.length) yield { type: 'tool_calls', calls }
}

function ollamaMessage(status, body, model, base) {
  if (status === 404) {
    return `Model \`${model}\` is not installed. Run \`ollama pull ${model}\` and try again.`
  }
  if (status === 401 || status === 403) {
    return `Ollama rejected the request at ${base}. Cloud models need \`ollama signin\` first.`
  }
  const snippet = String(body || '').replace(/\s+/g, ' ').slice(0, 240)
  return `Ollama error ${status}${snippet ? `: ${snippet}` : ''}`
}

function normalizeOllamaCalls(raw) {
  return raw.map((call, index) => {
    const fn = call.function || call
    let args = fn.arguments ?? {}
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch {
        args = { raw: args }
      }
    }
    return {
      id: call.id || `call_${Date.now().toString(36)}_${index}`,
      name: String(fn.name || 'unknown'),
      args: args && typeof args === 'object' ? args : {},
    }
  })
}

async function* streamOpenAI({
  baseUrl,
  apiKey,
  model,
  messages,
  tools,
  temperature,
  frequencyPenalty,
  presencePenalty,
  signal,
}) {
  const base = cleanBase(baseUrl)
  if (!apiKey) throw new LlmError('No API key saved for the online provider. Open Setup → Engine.')
  let response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: Math.max(0, Math.min(1.5, Number(temperature) || 0.85)),
        frequency_penalty: Number.isFinite(Number(frequencyPenalty))
          ? Number(frequencyPenalty)
          : undefined,
        presence_penalty: Number.isFinite(Number(presencePenalty))
          ? Number(presencePenalty)
          : undefined,
        tools: tools?.length ? tools : undefined,
      }),
      signal,
    })
  } catch (error) {
    if (isAbort(error, signal)) throw abortError()
    throw new LlmError(`Cannot reach ${base}. Check the base URL and your connection.`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const snippet = String(body).replace(/\s+/g, ' ').slice(0, 240)
    throw new LlmError(`Provider error ${response.status}${snippet ? `: ${snippet}` : ''}`, {
      status: response.status,
      body,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  const pending = new Map()

  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, '')
      buffer = buffer.slice(index + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      if (payload === '[DONE]') {
        finished = true
        break
      }
      let data
      try {
        data = JSON.parse(payload)
      } catch {
        continue
      }
      if (data.error) {
        throw new LlmError(data.error.message || JSON.stringify(data.error))
      }
      const choice = data.choices?.[0]
      if (!choice) continue
      const delta = choice.delta || {}
      if (delta.content) yield { type: 'text', text: delta.content }
      for (const call of delta.tool_calls || []) {
        const idx = Number.isFinite(call.index) ? call.index : 0
        const entry = pending.get(idx) || { id: '', name: '', args: '' }
        if (call.id) entry.id = call.id
        if (call.function?.name) entry.name += call.function.name
        if (call.function?.arguments) entry.args += call.function.arguments
        pending.set(idx, entry)
      }
      if (choice.finish_reason === 'tool_calls') {
        // keep reading until [DONE]; arguments often finish in the same chunk
      }
    }
  }

  if (pending.size) {
    const calls = [...pending.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, entry]) => {
        let args = {}
        try {
          args = entry.args ? JSON.parse(entry.args) : {}
        } catch {
          args = { raw: entry.args }
        }
        return { id: entry.id || `call_${index}`, name: entry.name || 'unknown', args }
      })
      .filter((call) => call.name !== 'unknown')
    if (calls.length) yield { type: 'tool_calls', calls }
  }
}
