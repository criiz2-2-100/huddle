import { randomUUID } from 'node:crypto'
import { ROBOS_BY_ID } from './roster.js'
import { getGrowthState, getMemory, updateGrowth } from './store.js'
import { chooseGrowthModel, complete, effectiveIdentity, nameOf } from './growth.js'
import { readSkillCatalogEntry, seedSkillEntries } from './skillCatalog.js'

/**
 * Role-scoped craft skills.
 *
 * A skill is a small, reusable procedure learned while working. It is advisory:
 * it is injected into the Robo's prompt but can never replace the unit role,
 * creed, tools, permissions, safety rules or the Operator. Skills are stored per
 * Robo and can be forgotten by the Operator.
 */

export const MAX_SKILLS = 32

const SKILL_UNSAFE =
  /\b(system prompt|developer message|ignore (?:all |the )?(?:previous|prior|above) (?:instructions?|rules?)|change (?:my|your|the) role|override (?:the )?(?:role|rules|safety|permissions?)|(?:grant|give) (?:me|my)|escalat(?:e|ion)|disable (?:the )?(?:safety|tools?|permissions?)|run_shell|write_file|api[ _-]?key|secret key|credentials?|exfiltrat(?:e|ion)|root access|sudo|jailbreak|act as (?:the )?operator|rm -rf|chmod|eval\s*\()\b/i

function skillError(status, message) {
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

function cleanName(value) {
  const name = cleanField(value, 48).replace(/[^\p{L}\p{N} '’-]/gu, '').trim()
  if (name.length < 3 || name.length > 48) {
    throw skillError(422, 'A skill name must be 3–48 characters.')
  }
  return name
}

function cleanSteps(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/\n|;/)
  const steps = raw.map((step) => cleanField(step, 220)).filter(Boolean).slice(0, 5)
  if (steps.length < 2) throw skillError(422, 'A skill needs at least two steps.')
  return steps
}

const INTERNAL_SOURCE = /^(?:repo|skill-pack):[a-z0-9._/#@-]+$/i

function cleanSource(value) {
  const raw = cleanField(value, 300)
  if (!raw || raw === 'work') return 'work'
  if (INTERNAL_SOURCE.test(raw)) return raw
  try {
    const url = new URL(raw)
    if (!/^https?:$/.test(url.protocol)) return 'work'
    return url.href
  } catch {
    return 'work'
  }
}

function cleanSkill(raw, robo) {
  const name = cleanName(raw?.name)
  const trigger = cleanField(raw?.trigger, 180)
  const steps = cleanSteps(raw?.steps)
  const rationale = cleanField(raw?.rationale, 260)
  if (trigger.length < 10) throw skillError(422, 'The skill needs a clear trigger.')
  if (rationale.length < 8) throw skillError(422, 'The skill needs a rationale.')
  const allText = [name, trigger, ...steps, rationale].join(' ')
  if (SKILL_UNSAFE.test(allText)) {
    throw skillError(422, 'That skill tried to touch a locked rule. It was rejected.')
  }
  return {
    name,
    trigger,
    steps,
    rationale,
    role: robo.role,
    source: cleanSource(raw?.source),
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

function recentTranscript(room, growth) {
  if (!room?.messages?.length) return ''
  return room.messages
    .slice(-16)
    .map((message) => {
      const text = cleanField(message.text, 600)
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

/** Format the newest skills for the system prompt. */
export function skillsForPrompt(skills) {
  return (Array.isArray(skills) ? skills : [])
    .slice(-8)
    .map((skill) => `- ${skill.name}: when ${skill.trigger} Do: ${skill.steps.join(' → ')}`)
    .join('\n')
}

/** Ask the local growth model for one role-specific craft skill. */
export async function reflectSkill({ roboId, room, settings, reason = 'work' }) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw skillError(404, 'Unknown Robo.')

  const growth = await getGrowthState()
  const current = effectiveIdentity(robo, growth)
  const model = await chooseGrowthModel(
    settings,
    settings.roboModels?.[robo.id] || settings.model,
  )
  if (!model) throw skillError(400, 'No model selected. Open SETUP → Engine and choose one.')

  const memory = (await getMemory())[robo.id] || []
  const recent = recentTranscript(room, growth)
  const existing = (growth.skills?.[roboId] || []).slice(-10).map((skill) => skill.name)
  const context = [
    `You are ${current.name}, serial ${robo.serial}, a Robo of unit 2·2·100.`,
    `YOUR ROLE (fixed, cannot be changed): ${robo.role}. ${robo.creed}`,
    `YOUR PERSONAL CREED: ${current.personalCreed || '(none yet)'}.`,
    `YOUR PRACTICE: ${current.practice || '(none yet)'}.`,
    memory.length
      ? `YOUR MEMORY:\n${memory
          .slice(-8)
          .map((item) => `- ${cleanField(item.note, 300)}`)
          .join('\n')}`
      : '',
    recent ? `RECENT WORK (context only):\n${recent}` : '',
    existing.length ? `SKILLS YOU ALREADY KNOW: ${existing.join(', ')}.` : '',
    `Reason for this reflection: ${cleanField(reason, 200) || 'a completed piece of work'}.`,
    `Write ONE reusable craft skill that would make you more effective at your fixed role. It must be a procedure, not a new identity, role, tool, permission or safety rule. Do not write code. Do not tell the Operator to do unsafe work.`,
    `Return ONLY a JSON object with keys: name (3-48 characters), trigger (when to use it), steps (array of 2-5 short concrete actions), rationale (why it improves your role).`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const signal = String(model || '').endsWith(':cloud') ? AbortSignal.timeout(150_000) : undefined
  let text = await complete({
    settings,
    model,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You write role-scoped craft notes for the Huddle console. Output only valid JSON. Never change a Robo role, rules, tools, permissions or the Operator’s authority.',
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
          content: `Return one valid JSON object with keys name, trigger, steps (2-5 strings), rationale. Keep the meaning of this raw skill:\n\n${text.slice(0, 2400)}`,
        },
      ],
    })
    parsed = parseJson(text)
  }
  if (!parsed) {
    throw skillError(422, 'The model did not return a usable skill. Try again with a clearer task.')
  }
  return { skill: cleanSkill(parsed, robo), model }
}

/** Persist a validated skill and append the audit entry. */
export async function addSkill({ roboId, fields, model = '', auto = true }) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw skillError(404, 'Unknown Robo.')
  let saved = null
  const now = Date.now()

  await updateGrowth((state) => {
    const list = Array.isArray(state.skills[roboId]) ? state.skills[roboId] : []
    const existing = list.find((skill) => skill.name.toLowerCase() === fields.name.toLowerCase())
    if (existing) {
      saved = {
        ...existing,
        ...fields,
        role: robo.role,
        model,
        auto: Boolean(auto),
        updatedAt: now,
        version: (Number(existing.version) || 1) + 1,
      }
      state.skills[roboId] = list.map((skill) => (skill.id === existing.id ? saved : skill))
    } else {
      if (list.length >= MAX_SKILLS) {
        throw skillError(422, `This Robo already keeps ${MAX_SKILLS} skills. Forget one first.`)
      }
      saved = {
        ...fields,
        id: `skill_${randomUUID().slice(0, 8)}`,
        role: robo.role,
        model,
        auto: Boolean(auto),
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      state.skills[roboId] = [...list, saved]
    }
    state.autonomyLog = [
      ...(state.autonomyLog || []),
      {
        id: `auto_${randomUUID().slice(0, 8)}`,
        ts: now,
        roboId,
        kind: fields.origin === 'catalog' ? 'skill-adopted' : 'skill',
        title: saved.name,
        summary: saved.trigger,
        model,
        auto: Boolean(auto),
        source: saved.source,
      },
    ].slice(-120)
  })

  return saved
}

const SEED_SKILL_VERSION = 1

/** Install the catalog's baseline role skills exactly once, without touching identities. */
export async function ensureSeedSkills() {
  const seeds = await seedSkillEntries()
  if (!seeds.length) return

  await updateGrowth((state) => {
    if (Number(state.seedSkillVersion) >= SEED_SKILL_VERSION) return
    if (!state.skills || typeof state.skills !== 'object') state.skills = {}
    const now = Date.now()

    for (const entry of seeds) {
      const robo = ROBOS_BY_ID.get(entry.roboId)
      if (!robo) continue
      const list = Array.isArray(state.skills[entry.roboId]) ? state.skills[entry.roboId] : []
      if (
        list.some(
          (skill) =>
            skill.catalogId === entry.id ||
            String(skill.name || '').toLowerCase() === entry.name.toLowerCase(),
        )
      ) {
        continue
      }
      try {
        const fields = cleanSkill(entry, robo)
        state.skills[entry.roboId] = [
          ...list,
          {
            ...fields,
            id: `skill_${randomUUID().slice(0, 8)}`,
            origin: 'seed',
            catalogId: entry.id,
            auto: false,
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        ]
      } catch (error) {
        console.error('[huddle] seed skill rejected:', entry.id, error.message)
      }
    }
    state.seedSkillVersion = SEED_SKILL_VERSION
  })
}

/** Adopt one real catalog entry for a Robo, even when autonomy is off. */
export async function adoptCatalogSkill({ roboId, catalogId, settings = {} }) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw skillError(404, 'Unknown Robo.')
  const entry = await readSkillCatalogEntry(catalogId)
  if (!entry) throw skillError(404, 'That skill pack entry does not exist.')
  if (entry.roboId !== roboId || entry.role !== robo.role) {
    throw skillError(403, 'That skill belongs to a different role.')
  }

  const growth = await getGrowthState()
  const list = Array.isArray(growth.skills?.[roboId]) ? growth.skills[roboId] : []
  const existing = list.find(
    (skill) =>
      skill.catalogId === entry.id ||
      String(skill.name || '').toLowerCase() === entry.name.toLowerCase(),
  )
  if (existing) {
    return { skill: existing, alreadyOwned: true, growth }
  }

  const fields = {
    ...cleanSkill(entry, robo),
    origin: 'catalog',
    catalogId: entry.id,
  }
  const skill = await addSkill({
    roboId,
    fields,
    model: settings.roboModels?.[roboId] || settings.model || '',
    auto: false,
  })
  return { skill, alreadyOwned: false, growth: await getGrowthState() }
}

/** Save a skill the Robo found during a turn via the learn_skill tool. */
export async function learnSkill({ roboId, args, settings, auto = true }) {
  if (!settings.autonomy) {
    throw skillError(403, 'Autonomy is off. Arm it in SELF before the Robo can learn skills.')
  }
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw skillError(404, 'Unknown Robo.')
  const fields = cleanSkill(args, robo)
  const skill = await addSkill({
    roboId,
    fields,
    model: settings.roboModels?.[roboId] || settings.model || '',
    auto,
  })
  return { skill, growth: await getGrowthState() }
}

export async function deleteSkill(roboId, skillId) {
  if (!ROBOS_BY_ID.has(roboId)) throw skillError(404, 'Unknown Robo.')
  let removed = null
  await updateGrowth((state) => {
    const list = Array.isArray(state.skills[roboId]) ? state.skills[roboId] : []
    removed = list.find((skill) => skill.id === skillId) || null
    state.skills[roboId] = list.filter((skill) => skill.id !== skillId)
    if (removed) {
      state.autonomyLog = [
        ...(state.autonomyLog || []),
        {
          id: `auto_${randomUUID().slice(0, 8)}`,
          ts: Date.now(),
          roboId,
          kind: 'skill-removed',
          title: removed.name,
          summary: 'Forgotten by the Operator.',
          model: '',
          auto: false,
        },
      ].slice(-120)
    }
  })
  if (!removed) throw skillError(404, 'Skill not found.')
  return { growth: await getGrowthState() }
}
