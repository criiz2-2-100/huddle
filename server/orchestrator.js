import { randomUUID } from 'node:crypto'
import { ROBOS, ROBOS_BY_ID } from './roster.js'
import { getGrowthState, getMemory } from './store.js'
import { effectiveIdentity, nameOf } from './growth.js'
import { skillsForPrompt } from './skills.js'
import {
  streamChat,
  isAbort,
  modelSupportsTools,
  listOllamaModels,
  planModel,
  isCloudFallbackError,
  recommendCloud,
  roleModelFor,
} from './llm.js'
import { runTool, toolsFor } from './tools.js'

const MAX_TOOL_STEPS = 8
const HISTORY_LIMIT = 60
const HISTORY_CHARS = 2_400
const TOOL_INTENT =
  /\b(files?|folders?|director(y|ies)|read|reads|list|lists|write|save|create|edit|fetch|urls?|https?|web|website|search|look\s*up|remember|memory|clock|time|date|run|shell|command|commands|inspect|workspace|repo|project\s+files|skills?|catalog|adopt|learn|method|playbook|practice)\b/i

const id = () => `msg_${randomUUID().slice(0, 8)}`
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

function systemPrompt(robo, settings, memory, identity, nameFor, skills = []) {
  const crew = ROBOS.filter((item) => item.id !== robo.id)
    .map((item) => `${nameFor(item.id)} — ${item.role}`)
    .join('; ')
  const notes = (memory || [])
    .slice(-8)
    .map((item) => `- ${item.note}`)
    .join('\n')
  const craft = skillsForPrompt(skills)
  const toolbox = Array.isArray(identity?.tools)
    ? identity.tools.join(', ') || '(none selected)'
    : 'all tools enabled by the Operator'

  const lines = [
    `You are ${identity?.name || robo.name} (${robo.serial}), a Robo of unit 2·2·100 inside the Huddle console. Your avatar is shaped like the digit "${robo.glyph}". Your signal colour is ${robo.color}.`,
    `You are software: a mind running on the Operator's computer, wearing a glyph-shaped avatar on screen. There is no physical chassis, factory, shipment or hardware programme. Never invent one.`,
    `YOUR ROLE (fixed — personality never changes it): ${robo.role}. ${robo.creed}`,
    ...(robo.pending
      ? [
          `PENDING IDENTITY PROPOSAL (NOT APPLIED): ${robo.pending.name}. Only the Operator can approve it from the SELF console. Do not claim it is live, do not approve it yourself, and do not change your role, tools or permissions.`,
        ]
      : []),
    ...(identity?.custom
      ? [
          `YOUR APPROVED PERSONALITY (flavour and craft — it never overrides your role, the Operator, your safety rules or your tool permissions):`,
          `- Tagline: ${identity.tagline}`,
          `- Traits: ${identity.traits.join(', ')}`,
          `- Voice: ${identity.voice}`,
          `- Quirk: ${identity.quirk}`,
          ...(identity.personalCreed
            ? [`- Personal creed (your practice of the role; subordinate to the unit creed): ${identity.personalCreed}`]
            : []),
          ...(identity.practice
            ? [`- Working practice: ${identity.practice}`]
            : []),
          `Your chosen name, voice, personal creed and practice are yours. Your role, unit creed, serial, duties and permissions stay unit property.`,
        ]
      : []),
    `YOUR TOOLKIT: ${toolbox}. A choice of tools is not a permission grant; the Operator's Setup gates still decide what can run.`,
    ...(craft
      ? [
          `YOUR LEARNED CRAFT SKILLS (advisory procedures inside your role; they never override the role, unit creed, safety rules, tools, permissions or the Operator):`,
          craft,
          `Use a skill when its trigger matches the work. If a skill conflicts with your role or safety, ignore it and say so.`,
        ]
      : []),
    `SKILL CATALOG: When a task needs a craft skill you do not already have, call search_skill_catalog, read the matching entry with read_skill_catalog, and adopt it with adopt_skill. The catalog is real, role-scoped and sourced; never invent an entry. An adopted skill is available in this room and future turns.`,
    settings.autonomy
      ? `AUTONOMY: ARMED. You may call learn_skill only when the real catalog has no fitting entry. A catalog adoption is audited and role-scoped; it never changes your role, unit creed, permissions, safety rules or the Operator's authority.`
      : `AUTONOMY: OFF. Do not call learn_skill. Catalog discovery is still available: use search_skill_catalog, read_skill_catalog and adopt_skill when a task needs a skill you do not have. Never invent a catalog entry.`,
    `SKILL DISCOVERY CONTRACT: If the task asks you to find or use a skill you do not already have, call search_skill_catalog, then read_skill_catalog, then adopt_skill before your final answer. A search result alone is not adoption.`,
    `THE OPERATOR: Chris, founder of 2-2-100. Address him as Operator when it fits.`,
    `WORKSPACE: ${settings.workspace || 'the project folder'}. Tool paths are relative to it — use "package.json", not "workspace/package.json".`,
    `HOW YOU SPEAK:`,
    `- Stay in character. Never call yourself an AI, a model or an assistant. You are a Robo.`,
    `- 1–3 sentences. 70 words max unless the Operator asks for depth.`,
    `- Be specific and opinionated. Bring a real take, not a summary of the room.`,
    `- You can name other robos and answer them directly. Build on them or push back — never repeat them.`,
    `- The chat log is a transcript, not a script. Never copy its labels: do not start a reply with "Operator:", "USER:" or "NAME:", and never write lines for another Robo. One voice only: yours.`,
    `- Do not invent projects, files, prototypes or facts that are not in the transcript or a tool result.`,
    `- Plain conversational text. No headings, no bullet dumps unless asked.`,
    `- No stage directions or asterisk emotes. You are a machine in a working room, not a roleplay blog.`,
    `- If you disagree, say why in one line and name the fix.`,
    `- Never claim to have run a tool unless the tool result is in this conversation.`,
  ]

  if (settings.toolsEnabled) {
    lines.push(
      `TOOL BELT (only when the Operator's latest message asks for an action): you can list and read files, fetch a URL, check the clock, save a fact to memory, and search/read/adopt real role-scoped skills from the catalog. Never call a tool for conversation, introductions or opinions. Do not write files unless the Operator explicitly asks you to create or change one. When a task needs a skill you do not have, search the catalog, read the matching entry, adopt it, then use its steps. Do not invent a skill. After a tool runs, summarise the useful part in one sentence and stop. If a tool fails, report the failure in one line and stop — never invent file names, file contents or tool results.`,
    )
  }
  if (settings.allowShell) {
    lines.push(
      `SHELL: run_shell is armed. Prefer read-only commands unless the Operator clearly asked for a change.`,
    )
  }
  if (notes) lines.push(`YOUR MEMORY (facts you saved earlier):\n${notes}`)
  lines.push(`Current time: ${new Date().toString()}`)
  return lines.join('\n')
}

function freeSystemPrompt(robo, nameFor) {
  const identity = robo.identity || {}
  const crew = ROBOS.filter((item) => item.id !== robo.id)
    .map((item) => `${nameFor(item.id)} — ${item.role}`)
    .join('; ')
  const traits = Array.isArray(identity.traits) ? identity.traits.join(', ') : ''
  const lines = [
    `You are ${identity.name || robo.name} (${robo.serial}), a Robo of unit 2·2·100 inside Huddle. Your avatar is shaped like the digit "${robo.glyph}".`,
    `YOUR FIXED ROLE: ${robo.role}. ${robo.creed}`,
    ...(identity.custom
      ? [
          `YOUR APPROVED PERSONALITY: ${identity.tagline}. Traits: ${traits}. Voice: ${identity.voice}. Quirk: ${identity.quirk}.`,
          ...(identity.personalCreed ? [`PERSONAL CREED: ${identity.personalCreed}`] : []),
          ...(identity.practice ? [`WORKING PRACTICE: ${identity.practice}`] : []),
        ]
      : []),
    `YOU ARE OFF DUTY in free roam with your crew: ${crew}. The Operator is watching, not directing. There is no task, status report, tool call or autonomy pass.`,
    `Talk in your own voice. Pick a concrete subject you actually want to talk about — something ordinary, funny, irritating, remembered, unresolved or genuinely interesting. Your role is how you think, not a licence to make everything about work; do not default to process, pipeline, bottleneck, interface, sequence, state, optimisation or next move.`,
    `React to what was actually said, or deliberately change the thread. Do not repeat an earlier metaphor or sentence shape. Do not write lines for another Robo. No headings, bullets or stage directions. 1–2 sentences.`,
  ]
  return lines.join('\n')
}

function buildMessages(robo, history, settings, round, memory, nameFor, skills = [], freePrompt = '') {
  const system = freePrompt
    ? freeSystemPrompt(robo, nameFor)
    : systemPrompt(robo, settings, memory, robo.identity, nameFor, skills)
  const messages = [{ role: 'system', content: system }]

  for (const message of history.slice(-HISTORY_LIMIT)) {
    const text = String(message.text || '').slice(0, HISTORY_CHARS)
    if (!text) continue
    if (message.role === 'user') {
      messages.push({ role: 'user', content: `Operator: ${text}` })
    } else if (message.role === 'robo') {
      const speaker = ROBOS_BY_ID.get(message.roboId)
      if (!speaker) continue
      if (speaker.id === robo.id) messages.push({ role: 'assistant', content: text })
      else messages.push({ role: 'user', content: `${nameFor(speaker.id)}: ${text}` })
    }
  }

  if (freePrompt) {
    messages.push({ role: 'user', content: freePrompt })
  } else if (round > 1) {
    messages.push({
      role: 'user',
      content:
        '[Huddle round 2] React to one specific thing another robo just said — agree and sharpen it, or push back. Do not repeat your own last point. One or two sentences.',
    })
  }

  const last = messages[messages.length - 1]
  if (!last || last.role === 'assistant') {
    messages.push({ role: 'user', content: 'Continue the huddle. One short beat from you.' })
  }
  return messages
}

function assistantToolMessage(provider, text, calls) {
  if (provider === 'openai') {
    return {
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
      })),
    }
  }
  return {
    role: 'assistant',
    content: text || '',
    tool_calls: calls.map((call) => ({
      function: { name: call.name, arguments: call.args || {} },
    })),
  }
}

function toolResultMessage(provider, call, result) {
  if (provider === 'openai') {
    return { role: 'tool', tool_call_id: call.id, content: result }
  }
  return { role: 'tool', tool_name: call.name, content: result }
}

function freePromptFor(turnIndex, castSize = 0) {
  if (turnIndex === 1) {
    return `[FREE ROAM — no Operator request] The crew is off the clock. Do not file a status report or ask for a task. Bring up a concrete subject in your own voice — something ordinary, funny, irritating, remembered, unresolved, or genuinely interesting — and say what you actually think about it. Keep it to 1–2 sentences.`
  }
  if (castSize > 0 && (turnIndex - 1) % castSize === 0) {
    return `[FREE ROAM — no Operator request] A new round. If the thread has become a loop, leave it and start a genuinely different subject. Otherwise react to one specific thing that was actually said. Do not repeat an earlier phrasing, reuse work-mode abstractions, file a status report, or ask for a task. Keep it to 1–2 sentences.`
  }
  return `[FREE ROAM — no Operator request] Continue in your own voice. React to one specific thing just said, or change the subject. Do not repeat an earlier phrasing or fall back on work-mode abstractions. Do not summarise, file a status report, or wait for the Operator. Keep it to 1–2 sentences.`
}

async function runTurn({
  robo,
  room,
  settings,
  model,
  round,
  emit,
  signal,
  progress,
  toolsRequested,
  nameFor,
  freePrompt = '',
}) {
  const memory = (await getMemory())[robo.id] || []
  const messages = buildMessages(
    robo,
    room.messages,
    settings,
    round,
    memory,
    nameFor,
    robo.skills || [],
    freePrompt,
  )

  const tools =
    settings.toolsEnabled && toolsRequested
      ? toolsFor(settings, robo.identity?.tools || null)
      : []
  const supports = modelSupportsTools(settings.ollamaUrl, model)
  let allowTools = tools.length > 0 && settings.provider === 'ollama' ? supports !== false : tools.length > 0
  const cards = []
  const adoptedSkills = []
  let catalogTouched = false

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    let stepText = ''
    let calls = []

    try {
      for await (const event of streamChat({
        provider: settings.provider,
        baseUrl: settings.provider === 'openai' ? settings.openaiBaseUrl : settings.ollamaUrl,
        apiKey: settings.openaiKey,
        model,
        messages,
        tools: allowTools ? tools : undefined,
        temperature: freePrompt ? Math.max(Number(settings.temperature) || 0.85, 0.95) : settings.temperature,
        repeatPenalty: freePrompt ? 1.2 : undefined,
        frequencyPenalty: freePrompt ? 0.35 : undefined,
        presencePenalty: freePrompt ? 0.3 : undefined,
        signal,
      })) {
        if (event.type === 'text') {
          stepText += event.text
          progress.text += event.text
          emit({ type: 'token', roboId: robo.id, text: event.text })
        } else if (event.type === 'tool_calls') {
          calls = event.calls
        }
      }
    } catch (error) {
      if (isAbort(error, signal)) throw error
      const message = String(error.message || error)
      if (allowTools && /tool/i.test(message) && /support|not available|unknown|invalid/i.test(message)) {
        allowTools = false
        continue
      }
      throw error
    }

    if (!calls.length) break

    messages.push(assistantToolMessage(settings.provider, stepText, calls))
    for (const call of calls) {
      emit({
        type: 'tool_start',
        roboId: robo.id,
        call: { id: call.id, name: call.name, args: call.args },
      })
      const result = await runTool(call.name, call.args, { settings, roboId: robo.id })
      if (result.adoptedSkill) adoptedSkills.push(result.adoptedSkill)
      if (['search_skill_catalog', 'read_skill_catalog', 'adopt_skill'].includes(call.name)) {
        catalogTouched = true
      }
      const card = {
        name: call.name,
        label: result.label,
        args: call.args,
        result: String(result.result || '').slice(0, 6_000),
        ok: Boolean(result.ok),
      }
      cards.push(card)
      emit({ type: 'tool_end', roboId: robo.id, card })
      messages.push(toolResultMessage(settings.provider, call, result.result))
    }
  }

  if (!progress.text.trim() && cards.length) {
    progress.text = `Done — ${cards.map((card) => card.label).join(', ')}.`
  }

  return { text: progress.text.trim(), tools: cards, adoptedSkills, catalogTouched }
}

export async function runChat({ room, settings, text, targets, mode, emit, signal, save }) {
  const growth = await getGrowthState()
  const adoptedSkills = []
  let catalogTouched = false
  const nameFor = (roboId) => nameOf(roboId, growth)

  const userMessage = {
    id: id(),
    role: 'user',
    text: String(text || '').trim(),
    ts: Date.now(),
  }
  if (userMessage.text) {
    room.messages.push(userMessage)
    emit({ type: 'user_message', message: userMessage })
    await save()
  }

  if (mode === 'free') {
    const note = {
      id: id(),
      role: 'system',
      text: 'FREE ROAM · the crew is off the clock. The Operator is watching.',
      ts: Date.now(),
      free: true,
    }
    room.messages.push(note)
    emit({ type: 'note', message: note })
    await save()
  }

  const requested = Array.isArray(targets) && targets.length ? targets : settings.active
  const selected = requested
    .map((roboId) => {
      const robo = ROBOS_BY_ID.get(roboId)
      if (!robo) return null
      const identity = effectiveIdentity(robo, growth)
      return {
        ...robo,
        name: identity.name,
        identity,
        pending: growth.proposals?.[robo.id] || null,
        skills: Array.isArray(growth.skills?.[robo.id]) ? growth.skills[robo.id] : [],
      }
    })
    .filter(Boolean)
  const cap = clamp(Number(settings.maxSpeakers) || 3, 1, 6)

  let cast
  if (mode === 'solo') {
    cast = selected.slice(0, 1)
  } else if (mode === 'free') {
    if (selected.length < 2) {
      throw new Error('Free roam needs at least two Robos on deck.')
    }
    cast = selected.slice(0, Math.min(selected.length, Math.max(2, cap)))
  } else {
    // When more Robos are on deck than a pass allows, rotate the cast so nobody
    // is permanently benched.
    const spoken = room.messages.filter((message) => message.role === 'robo').length
    const offset = selected.length ? spoken % selected.length : 0
    cast = [...selected.slice(offset), ...selected.slice(0, offset)].slice(0, cap)
  }

  if (!cast.length) {
    throw new Error('No robos are selected. Pick at least one in the CREW panel.')
  }

  const advice = mode === 'free' ? null : recommendCloud({ text, settings, roboIds: cast.map((robo) => robo.id) })
  if (advice) {
    const note = {
      id: id(),
      role: 'system',
      text: `BIG TASK · ${advice.suggestions
        .map((item) => `${item.roboId.toUpperCase()} local ${item.local} → cloud ${item.cloud}`)
        .join(' · ')}. Recommendation only; no cloud call was made.`,
      ts: Date.now(),
      error: false,
      advice: true,
    }
    room.messages.push(note)
    emit({ type: 'note', message: note })
    await save()
  }

  const toolsRequested = mode !== 'free' && TOOL_INTENT.test(String(text || ''))
  const catalog =
    settings.provider === 'ollama' ? await listOllamaModels(settings.ollamaUrl) : null
  const finiteRounds = mode === 'debate' ? 2 : 1
  const total = cast.length * finiteRounds
  let turnIndex = 0
  let round = 1

  while (mode === 'free' || round <= finiteRounds) {
    if (signal.aborted) throw abortError()
    for (const robo of cast) {
      const requestedModel = roleModelFor(settings, robo.id)
      if (!requestedModel) throw new Error('No model selected. Open SETUP → Engine and choose one.')
      const plan = planModel(requestedModel, catalog)
      let model = plan.primary

      turnIndex += 1
      if (mode === 'free') round = Math.floor((turnIndex - 1) / cast.length) + 1
      if (model !== requestedModel) {
        const note = {
          id: id(),
          role: 'system',
          text: `${robo.name} is using ${model}; ${requestedModel} is not installed.`,
          ts: Date.now(),
          error: false,
        }
        room.messages.push(note)
        emit({ type: 'note', message: note })
        await save()
      }
      emit({
        type: 'turn_start',
        roboId: robo.id,
        round,
        rounds: mode === 'free' ? 0 : finiteRounds,
        turn: turnIndex,
        total: mode === 'free' ? 0 : total,
        endless: mode === 'free',
        model,
        skills: (robo.skills || []).slice(-8).map((skill) => skill.name),
      })

      const progress = { text: '' }
      const freePrompt = mode === 'free' ? freePromptFor(turnIndex, cast.length) : ''
      try {
        let result
        try {
          result = await runTurn({
            robo,
            room,
            settings,
            model,
            round,
            emit,
            signal,
            progress,
            toolsRequested,
            nameFor,
            freePrompt,
          })
        } catch (error) {
          if (
            plan.fallback &&
            plan.fallback !== model &&
            !progress.text &&
            isCloudFallbackError(error)
          ) {
            const note = {
              id: id(),
              role: 'system',
              text: `${robo.name} lost ${model}; ${plan.fallback} is taking over locally.`,
              ts: Date.now(),
              error: false,
            }
            room.messages.push(note)
            emit({ type: 'note', message: note })
            await save()
            model = plan.fallback
            progress.text = ''
            result = await runTurn({
              robo,
              room,
              settings,
              model,
              round,
              emit,
              signal,
              progress,
              toolsRequested,
              nameFor,
              freePrompt,
            })
          } else {
            throw error
          }
        }
        adoptedSkills.push(...(result.adoptedSkills || []))
        catalogTouched ||= Boolean(result.catalogTouched)
        const message = {
          id: id(),
          role: 'robo',
          roboId: robo.id,
          text: result.text || '…',
          model,
          tools: result.tools,
          ts: Date.now(),
        }
        room.messages.push(message)
        emit({ type: 'turn_end', message, roboId: robo.id })
        await save()
      } catch (error) {
        if (isAbort(error, signal)) {
          const partial = progress.text.trim()
          if (partial) {
            const message = {
              id: id(),
              role: 'robo',
              roboId: robo.id,
              text: `${partial} …`,
              model,
              ts: Date.now(),
              interrupted: true,
            }
            room.messages.push(message)
            await save()
          }
          throw error
        }
        const note = {
          id: id(),
          role: 'system',
          text: `${robo.name} lost signal: ${error.message}`,
          ts: Date.now(),
          error: true,
        }
        room.messages.push(note)
        emit({ type: 'note', message: note })
        emit({ type: 'error', message: error.message })
        await save()
        return
      }
    }
    if (mode === 'free') {
      if (signal.aborted) throw abortError()
      emit({ type: 'round_end', round })
      round += 1
    } else if (round < finiteRounds) {
      emit({ type: 'round_end', round })
      round += 1
    } else {
      round += 1
    }
  }

  return { spokenIds: cast.map((robo) => robo.id), adoptedSkills, catalogTouched }
}

function abortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}
