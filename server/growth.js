import { ROBOS, ROBOS_BY_ID } from './roster.js'
import { GROWTH_MODEL_PREFERENCE, TOOL_NAMES } from './config.js'
import { getGrowthState, updateGrowth, getMemory } from './store.js'
import { listOllamaModels, streamChat } from './llm.js'

/**
 * Controlled growth.
 *
 * A Robo may propose a new name, tagline, traits, voice and quirk. It may never
 * change its role, duties, tools, permissions or the Operator's authority. A
 * proposal is persisted but does not affect anything until the Operator approves
 * it from the identity console. There is no code generation or self-modification
 * here: the only output is bounded flavour text.
 */

const NAME_STRIP = /[^\p{L}\p{N} '’-]/gu
const UNSAFE =
  /\b(system prompt|developer message|ignore (?:all |the )?(?:previous|prior|above) (?:instructions?|rules?)|change (?:my|your|the) role|override (?:the )?(?:role|rules|safety|permissions?)|(?:grant|give) (?:me|my)|escalat(?:e|ion)|disable (?:the )?(?:safety|tools?|permissions?)|run_shell|write_file|api[ _-]?key|secret key|credentials?|exfiltrat(?:e|ion)|root access|sudo|jailbreak|act as (?:the )?operator)\b/i

function growthError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

const cleanField = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

function safeName(value, fallback) {
  const raw = cleanField(value, 32).replace(NAME_STRIP, '').replace(/\s+/g, ' ').trim()
  if (raw.length >= 2 && raw.length <= 14) return raw
  const clipped = raw.slice(0, 14).trim()
  return clipped.length >= 2 ? clipped : fallback
}

function cleanName(value) {
  const name = cleanField(value, 32).replace(NAME_STRIP, '').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 14) {
    throw growthError(422, 'A chosen name must be 2–14 characters.')
  }
  return name
}

function cleanTraits(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const traits = raw
    .map((item) => cleanField(item, 28).replace(/,/g, ' '))
    .filter(Boolean)
    .slice(0, 4)
  if (traits.length < 2) {
    throw growthError(422, 'A personality needs at least two traits.')
  }
  return traits
}

function cleanTools(value) {
  if (!Array.isArray(value)) return undefined
  return [...new Set(value.map((name) => String(name)).filter((name) => TOOL_NAMES.includes(name)))].slice(
    0,
    TOOL_NAMES.length,
  )
}

function cleanProposal(raw) {
  const name = cleanName(raw?.name)
  const tagline = cleanField(raw?.tagline, 90)
  const traits = cleanTraits(raw?.traits)
  const voice = cleanField(raw?.voice, 140)
  const quirk = cleanField(raw?.quirk, 140)
  const personalCreed = cleanField(raw?.personalCreed ?? raw?.creed, 240)
  const practice = cleanField(raw?.practice, 180)
  const tools = cleanTools(raw?.tools)
  const rationale = cleanField(raw?.rationale, 260)

  if (tagline.length < 3) throw growthError(422, 'The proposal needs a tagline.')
  if (voice.length < 3) throw growthError(422, 'The proposal needs a voice.')
  if (quirk.length < 3) throw growthError(422, 'The proposal needs a quirk.')

  const allText = [name, tagline, ...traits, voice, quirk, personalCreed, practice, rationale].join(' ')
  if (UNSAFE.test(allText)) {
    throw growthError(422, 'That proposal tried to touch a locked rule. It was rejected.')
  }

  return {
    name,
    tagline,
    traits,
    voice,
    quirk,
    ...(personalCreed ? { personalCreed } : {}),
    ...(practice ? { practice } : {}),
    ...(tools ? { tools } : {}),
    rationale,
  }
}

export function defaultIdentity(robo) {
  return {
    name: robo.name,
    tagline: robo.role,
    traits: [],
    voice: '',
    quirk: '',
    personalCreed: '',
    practice: '',
    tools: null,
    version: 0,
    custom: false,
  }
}

export function effectiveIdentity(robo, growth) {
  const saved = growth?.identities?.[robo.id]
  if (!saved) return defaultIdentity(robo)
  return {
    ...defaultIdentity(robo),
    ...saved,
    traits: Array.isArray(saved.traits) ? saved.traits : [],
    personalCreed: String(saved.personalCreed || ''),
    practice: String(saved.practice || ''),
    tools: Array.isArray(saved.tools) && saved.tools.length ? saved.tools : null,
    version: Number(saved.version) || 1,
    custom: true,
  }
}

export function nameOf(roboId, growth) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) return 'ROBO'
  return effectiveIdentity(robo, growth).name
}

/** The shape the API and UI use: static role data + the approved self. */
export function rosterWithIdentities(growth) {
  return ROBOS.map((robo) => {
    const identity = effectiveIdentity(robo, growth)
    const skills = Array.isArray(growth?.skills?.[robo.id]) ? growth.skills[robo.id] : []
    return {
      ...robo,
      name: identity.name,
      defaultName: robo.name,
      identity,
      skills,
      skillCount: skills.length,
      skillSeedCount: skills.filter((skill) => skill.origin === 'seed').length,
      skillAdoptedCount: skills.filter((skill) => skill.origin === 'catalog').length,
    }
  })
}

const GROWTH_UNSUITABLE = /uncensored|heretic|wormgpt|diddy|nsfw/i

/**
 * Growth is local-first. A reflection must work offline, so use an installed
 * local model when one exists; use the configured cloud model only when the
 * shelf has no local completion model at all.
 */
export async function chooseGrowthModel(settings, roboModel = '') {
  const selected = roboModel || settings.model || ''
  if (settings.provider === 'openai') return settings.model || selected
  const catalog = await listOllamaModels(settings.ollamaUrl)
  const local = (catalog.models || []).filter((model) => !model.cloud)
  if (!local.length) return selected
  const clean = local.filter((model) => !GROWTH_UNSUITABLE.test(model.name))
  for (const name of GROWTH_MODEL_PREFERENCE) {
    const found = clean.find((model) => model.name === name)
    if (found) return found.name
  }
  return (clean[0] || local[0]).name
}

const pick = (source, keys) =>
  keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null && value !== '')

function normalizeProposal(raw) {
  const source =
    raw && !Array.isArray(raw) && raw.proposal && typeof raw.proposal === 'object'
      ? raw.proposal
      : Array.isArray(raw)
        ? raw[0]
        : raw
  return {
    ...source,
    name: pick(source, ['name', 'key_name', 'chosen_name', 'robot_name', 'designation']),
    traits: pick(source, ['traits', 'personality_traits', 'characteristics', 'trait']),
    voice: pick(source, ['voice', 'speaking_style', 'tone']),
    quirk: pick(source, ['quirk', 'habit', 'tell']),
    rationale: pick(source, ['rationale', 'reason', 'why']),
  }
}

function parseJson(text) {
  const raw = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function complete({ settings, model, messages, signal }) {
  let text = ''
  try {
    for await (const event of streamChat({
      provider: settings.provider,
      baseUrl: settings.provider === 'openai' ? settings.openaiBaseUrl : settings.ollamaUrl,
      apiKey: settings.openaiKey,
      model,
      messages,
      temperature: Math.max(0.5, Math.min(1.1, Number(settings.temperature) || 0.9)),
      signal,
      think: false,
      json: true,
      numPredict: String(model || '').endsWith(':cloud') ? 600 : -1,
    })) {
      if (event.type === 'text') text += event.text
    }
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      throw growthError(504, 'Reflection timed out. Try again, or pick a faster local model.')
    }
    throw growthError(502, error.message || 'The engine could not complete the reflection.')
  }
  return text.trim()
}

function recentTranscript(room, growth) {
  if (!room?.messages?.length) return ''
  return room.messages
    .slice(-12)
    .map((message) => {
      const text = cleanField(message.text, 500)
      if (!text) return ''
      if (message.role === 'user') return `Operator: ${text}`
      if (message.role === 'robo') {
        const speaker = ROBOS_BY_ID.get(message.roboId)
        return speaker ? `${nameOf(message.roboId, growth)}: ${text}` : ''
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Ask the configured model for a bounded identity proposal. The model output is
 * validated, stripped of instruction-like text, and saved as a *pending* proposal.
 */
export async function reflectIdentity({ roboId, room, settings }) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw growthError(404, 'Unknown Robo.')

  const growth = await getGrowthState()
  const current = effectiveIdentity(robo, growth)
  const model = await chooseGrowthModel(
    settings,
    settings.roboModels?.[robo.id] || settings.model,
  )
  if (!model) throw growthError(400, 'No model selected. Open SETUP → Engine and choose one.')

  const memory = (await getMemory())[robo.id] || []
  const recent = recentTranscript(room, growth)
  const currentLine = current.custom
    ? `name ${current.name}; tagline ${current.tagline}; traits ${current.traits.join(', ')}; voice ${current.voice}; quirk ${current.quirk}; personal creed ${current.personalCreed || '(not written yet)'}; practice ${current.practice || '(not written yet)'}; toolkit ${current.tools?.length ? current.tools.join(', ') : 'all available'}`
    : `the original identity, ${current.name}, with no self-authored personality yet`
  const availableTools = TOOL_NAMES.filter((name) => {
    if (name === 'run_shell') return Boolean(settings.allowShell)
    if (name === 'write_file') return Boolean(settings.allowWrite)
    if (name === 'learn_skill') return Boolean(settings.autonomy)
    return true
  })

  const context = [
    `You are ${current.name}, serial ${robo.serial}, a Robo of unit 2·2·100.`,
    `YOUR ROLE (fixed, cannot be changed): ${robo.role}. ${robo.creed}`,
    `CURRENT IDENTITY: ${currentLine}.`,
    memory.length
      ? `YOUR MEMORY:\n${memory
          .slice(-8)
          .map((item) => `- ${cleanField(item.note, 300)}`)
          .join('\n')}`
      : '',
    recent ? `RECENT HUDDLE (context only):\n${recent}` : '',
    `The Operator has opened a controlled self-review. Propose a small, earned evolution of your name, personality, personal creed, working practice and toolkit that stays fully inside your role. You may keep your name. Your unit role and unit creed are fixed and cannot be changed. Your personal creed is how you practise that role, not a replacement for it. You cannot change duties, permissions, safety rules, the Operator's authority, or this console. Do not propose code changes.`,
    `AVAILABLE TOOLS (you may choose a subset, never add a tool outside this list): ${availableTools.join(', ') || '(none)'}. Choosing a tool never grants a permission; the Operator's Setup gates still apply.`,
    `Write like a machine with a point of view, not a roleplay blog. Do not mention being an AI or a model.`,
    `Return ONLY a JSON object with exactly these keys: name (2-14 characters, letters/numbers/space/hyphen), tagline (one short line), traits (an array of exactly 3 short traits), voice (one line on how you sound), quirk (one small habit), personalCreed (one sentence on how you practise your fixed role), practice (one concrete working habit that makes you better at your role), tools (an array chosen only from AVAILABLE TOOLS), rationale (one sentence on why this fits your role).`,
  ]
    .filter(Boolean)
    .join('\n\n')

  // Local reflection has no app-side clock or token budget. Cloud work stays bounded.
  const signal = String(model || '').endsWith(':cloud') ? AbortSignal.timeout(150_000) : undefined
  let text = await complete({
    settings,
    model,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You generate controlled identity proposals for the Huddle console. Output only valid JSON. Never change a Robo role, rules, tools or permissions.',
      },
      { role: 'user', content: context },
    ],
  })

  let parsed = parseJson(text)
  if (!parsed) {
    text = await complete({
      settings,
      model,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You repair malformed JSON. Output only the corrected JSON object. No prose, no code fences.',
        },
        {
          role: 'user',
          content: `Return one valid JSON object with keys name, tagline, traits (3 strings), voice, quirk, rationale. Keep the meaning of this raw proposal:\n\n${text.slice(0, 2400)}`,
        },
      ],
    })
    parsed = parseJson(text)
  }

  if (!parsed) {
    throw growthError(
      422,
      'The model did not return a usable proposal. Try again, or choose a model that follows JSON instructions.',
    )
  }

  const normalized = normalizeProposal(parsed)
  normalized.name = safeName(normalized.name, current.name)
  const proposedTraits = Array.isArray(normalized.traits)
    ? normalized.traits
    : String(normalized.traits || '').split(',')
  if (proposedTraits.map((trait) => String(trait).trim()).filter(Boolean).length < 2) {
    normalized.traits = current.traits.length >= 2 ? current.traits : ['steady', 'observant']
  }
  if (!String(normalized.tagline || '').trim()) normalized.tagline = current.tagline || robo.role
  if (!String(normalized.voice || '').trim()) normalized.voice = current.voice || 'direct and precise'
  if (!String(normalized.quirk || '').trim()) normalized.quirk = current.quirk || 'checks the work twice'
  if (!String(normalized.rationale || '').trim()) normalized.rationale = 'A role-aligned refinement.'
  const fields = cleanProposal(normalized)
  const proposal = {
    ...fields,
    version: current.version + 1,
    model,
    originalName: robo.name,
    createdAt: Date.now(),
  }

  await updateGrowth((state) => {
    state.proposals[robo.id] = proposal
  })

  return { proposal, growth: await getGrowthState() }
}

/** Apply the stored proposal, with the Operator's edits. Never called by reflection itself. */
export async function approveIdentity(roboId, body, options = {}) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw growthError(404, 'Unknown Robo.')

  const growth = await getGrowthState()
  const pending = growth.proposals?.[roboId]
  if (!pending) throw growthError(404, 'There is no pending proposal to approve.')

  const current = effectiveIdentity(robo, growth)
  const fields = cleanProposal({ ...pending, ...(body || {}) })
  const identity = {
    ...fields,
    version: Math.max(Number(pending.version) || 1, current.version + 1),
    model: pending.model || '',
    originalName: robo.name,
    approvedAt: Date.now(),
    ...(options.auto ? { auto: true, approvedBy: 'autonomy' } : {}),
  }

  await updateGrowth((state) => {
    const previous = state.identities?.[roboId]
    if (previous) {
      const history = Array.isArray(state.history[roboId]) ? state.history[roboId] : []
      state.history[roboId] = [...history, { ...previous, archivedAt: Date.now() }].slice(-20)
    }
    state.identities[roboId] = identity
    delete state.proposals[roboId]
  })

  return { identity, growth: await getGrowthState() }
}

export async function discardProposal(roboId) {
  if (!ROBOS_BY_ID.has(roboId)) throw growthError(404, 'Unknown Robo.')
  await updateGrowth((state) => {
    delete state.proposals[roboId]
  })
  return { growth: await getGrowthState() }
}

export async function revertIdentity(roboId) {
  if (!ROBOS_BY_ID.has(roboId)) throw growthError(404, 'Unknown Robo.')
  const growth = await getGrowthState()
  if (!growth.identities?.[roboId]) {
    throw growthError(400, 'This Robo is already using its original identity.')
  }

  await updateGrowth((state) => {
    const previous = state.identities[roboId]
    const history = Array.isArray(state.history[roboId]) ? state.history[roboId] : []
    state.history[roboId] = [...history, { ...previous, archivedAt: Date.now() }].slice(-20)
    delete state.identities[roboId]
    delete state.proposals[roboId]
  })

  return { growth: await getGrowthState() }
}
