import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getBossState, saveBossReport, getGrowthState, getRooms, getSettings } from './store.js'
import { chooseGrowthModel, nameOf } from './growth.js'
import { ROBOS_BY_ID } from './roster.js'
import { roleFor } from './roles.js'
import { streamChat } from './llm.js'

const REPORT_LIMIT = 14
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MODEL_TIMEOUT_MS = 120_000
let runningPromise = null

function dayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clean(value, max = 260) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function cleanList(value, max = 6, itemMax = 260) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item, itemMax))
    .filter(Boolean)
    .slice(0, max)
}

function cleanImprovement(raw) {
  if (typeof raw === 'string') {
    return { priority: 'medium', title: clean(raw, 100), why: '', action: '' }
  }
  if (!raw || typeof raw !== 'object') return null
  const priority = ['high', 'medium', 'low'].includes(raw.priority) ? raw.priority : 'medium'
  const title = clean(raw.title, 110)
  if (!title) return null
  return {
    priority,
    title,
    why: clean(raw.why, 260),
    action: clean(raw.action, 260),
  }
}

function normalizeImprovements(value, fallback) {
  const list = (Array.isArray(value) ? value : [])
    .map(cleanImprovement)
    .filter(Boolean)
    .slice(0, 6)
  return list.length ? list : fallback
}

function parseJson(text) {
  const source = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch {
    return null
  }
}

async function workspaceOutline(settings) {
  const root = path.resolve(settings.workspace || process.cwd())
  const blocked = new Set(['node_modules', '.git', '.freebuff', 'data', 'release', '.desktop-build', 'dist'])
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => !blocked.has(entry.name) && !entry.name.startsWith('.'))
      .slice(0, 24)
      .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`)
  } catch {
    return []
  }
}

function pendingProposals(growth) {
  return Object.entries(growth?.proposals || {}).filter(([, value]) => Boolean(value))
}

function countSkills(growth) {
  return Object.values(growth?.skills || {}).reduce(
    (total, list) => total + (Array.isArray(list) ? list.length : 0),
    0,
  )
}

function countCustomIdentities(growth) {
  return Object.values(growth?.identities || {}).filter((identity) => identity?.custom).length
}

async function collectContext(settings, growth, rooms) {
  const now = Date.now()
  const active = Array.isArray(settings.active) ? settings.active : []
  const messages = rooms.flatMap((room) => (Array.isArray(room.messages) ? room.messages : []))
  const recentMessages = messages.filter((message) => Number(message.ts) >= now - WEEK_MS)
  const pending = pendingProposals(growth)
  const skills = countSkills(growth)
  const customIdentities = countCustomIdentities(growth)
  const workspace = await workspaceOutline(settings)
  const activeNames = active
    .map((id) => {
      const robo = ROBOS_BY_ID.get(id)
      if (!robo) return id
      const role = roleFor(settings.roles, id)
      return `${nameOf(id, growth)} (${role.label})`
    })
    .join(', ')

  const recentLines = []
  const orderedRooms = [...rooms].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4)
  for (const room of orderedRooms) {
    const recent = (Array.isArray(room.messages) ? room.messages : [])
      .filter((message) => clean(message.text, 3000))
      .slice(-8)
    if (!recent.length) continue
    recentLines.push(`Room: ${clean(room.name, 80)}`)
    for (const message of recent) {
      const text = clean(message.text, 260)
      if (!text) continue
      if (message.role === 'user') recentLines.push(`Operator: ${text}`)
      else if (message.role === 'robo') recentLines.push(`${nameOf(message.roboId, growth)}: ${text}`)
      else if (!message.free) recentLines.push(`Unit: ${text}`)
    }
  }

  return {
    stats: {
      rooms: rooms.length,
      messages: messages.length,
      messagesThisWeek: recentMessages.length,
      active: active.length,
      skills,
      customIdentities,
      pending: pending.length,
      emptyRooms: rooms.filter((room) => !room.messages?.length).length,
      workspaceItems: workspace.length,
      linked: Boolean(settings.model),
      model: settings.model || '',
      provider: settings.provider || 'ollama',
    },
    activeNames: activeNames || 'nobody',
    pending: pending.map(([id, proposal]) => `${nameOf(id, growth)}: ${clean(proposal.name, 80)}`),
    workspace,
    recent: recentLines.join('\n').slice(0, 6000),
  }
}

function fallbackReport(context) {
  const { stats } = context
  const activeLabel = context.activeNames
  const headline =
    stats.pending > 0
      ? `${stats.pending} decision${stats.pending === 1 ? '' : 's'} waiting at the table.`
      : stats.messagesThisWeek === 0
        ? 'The room is quiet. Give the crew a real brief.'
        : 'The unit is moving. Keep the next move small.'
  const summary =
    `${stats.rooms} saved ${stats.rooms === 1 ? 'rally' : 'rallies'} · ` +
    `${stats.messagesThisWeek} ${stats.messagesThisWeek === 1 ? 'line' : 'lines'} this week · ` +
    `${activeLabel} on deck. ` +
    (stats.linked ? `${stats.model || 'The engine'} is linked.` : 'The engine is offline; this review is local.')

  const wins = []
  if (stats.messagesThisWeek) wins.push(`${stats.messagesThisWeek} recent lines show the crew is still working the thread.`)
  if (stats.customIdentities) wins.push(`${stats.customIdentities} approved ${stats.customIdentities === 1 ? 'identity is' : 'identities are'} carrying the unit forward.`)
  if (stats.skills) wins.push(`${stats.skills} craft ${stats.skills === 1 ? 'skill is' : 'skills are'} available to the crew.`)
  if (stats.workspaceItems) wins.push(`The workspace has ${stats.workspaceItems} visible top-level items to work with.`)
  if (!wins.length) wins.push('The console is clean and ready for a first real mission.')

  const risks = []
  if (stats.pending) risks.push(`${stats.pending} identity ${stats.pending === 1 ? 'proposal is' : 'proposals are'} waiting for an Operator decision.`)
  if (!stats.linked) risks.push('No model is linked right now; replies and deeper reviews will be limited.')
  if (!stats.messagesThisWeek) risks.push('There is no recent work in the transcript, so the crew lacks current context.')
  if (!stats.skills) risks.push('The skill shelf is empty; role craft has not been seeded yet.')
  if (stats.emptyRooms > Math.max(2, stats.rooms / 2)) risks.push('Most saved rooms are empty; the archive may be noisy.')
  if (!risks.length) risks.push('No immediate operational risk is visible from the current signals.')

  const improvements = []
  if (stats.pending) {
    improvements.push({
      priority: 'high',
      title: 'Close the open identity decision',
      why: 'A pending proposal is blocking the crew from settling into its current shape.',
      action: 'Open SELF and approve, edit or discard the proposal before the next rally.',
    })
  }
  if (!stats.linked) {
    improvements.push({
      priority: 'high',
      title: 'Bring the engine back online',
      why: 'The Boss and the crew cannot use the model shelf while the provider is unreachable.',
      action: 'Open SETUP → ENGINE, start Ollama or add a key, then run the review again.',
    })
  }
  if (!stats.messagesThisWeek) {
    improvements.push({
      priority: 'medium',
      title: 'Give the crew a concrete brief',
      why: 'A specific mission creates better role fit and a more useful daily report than an empty room.',
      action: 'Send one small, real task to the active crew and review the result.',
    })
  }
  improvements.push({
    priority: 'medium',
    title: 'Fit mission roles before the next brief',
    why: `The active crew is ${activeLabel}; a role deck pass makes the split of work explicit.`,
    action: 'Open the role deck and use AUTO-FIT on the next mission brief.',
  })
  if (!stats.skills) {
    improvements.push({
      priority: 'low',
      title: 'Seed the craft shelf',
      why: 'Role-scoped skills give each Robo a repeatable procedure instead of improvising every task.',
      action: 'Let a Robo search and adopt a fitting skill from the catalog on its next task.',
    })
  }

  return {
    headline,
    summary,
    wins: wins.slice(0, 5),
    risks: risks.slice(0, 5),
    improvements: normalizeImprovements(improvements, []),
    nextMoves: [
      stats.pending ? 'Resolve the pending identity proposal.' : 'Run one small real mission with the active crew.',
      stats.linked ? 'Ask the crew for one concrete next move, then verify it.' : 'Restore the engine connection.',
      'Keep the next review short enough to act on today.',
    ],
  }
}

async function askBoss(context, settings) {
  const model = await chooseGrowthModel(settings)
  if (!model) return null
  const stats = context.stats
  const prompt = [
    'OPERATIONS SNAPSHOT',
    `Active crew: ${context.activeNames}`,
    `Saved rallies: ${stats.rooms}; messages: ${stats.messages}; this week: ${stats.messagesThisWeek}`,
    `Craft skills: ${stats.skills}; custom identities: ${stats.customIdentities}; pending proposals: ${stats.pending}`,
    `Workspace top level: ${context.workspace.length ? context.workspace.join(', ') : '(empty or unavailable)'}`,
    `Engine: ${stats.provider} / ${stats.model || 'none'} / ${stats.linked ? 'linked' : 'offline'}`,
    context.pending.length ? `Pending: ${context.pending.join(' | ')}` : 'Pending: none',
    context.recent ? `RECENT TRANSCRIPT (trimmed):\n${context.recent}` : 'RECENT TRANSCRIPT: empty',
    '',
    'Return a JSON object with exactly: headline (one line), summary (2–3 sentences), wins (up to 5 short strings), risks (up to 5 short strings), improvements (up to 5 objects with priority high|medium|low, title, why, action), nextMoves (up to 4 short strings).',
    'Be specific to this unit and this week. Name the next action, not a category. Do not invent files, users, revenue, or completed work. Do not suggest changing permissions, safety, the unit role, or the Operator’s authority.',
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
  let text = ''
  try {
    for await (const event of streamChat({
      provider: settings.provider,
      baseUrl:
        settings.provider === 'openai'
          ? settings.openaiBaseUrl
          : settings.ollamaUrl,
      apiKey: settings.openaiKey,
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are BOSS, the operations lead for unit 2·2·100 inside Rally Up Bots. You review the crew and give the Operator a direct daily report. You are advisory only: never approve an identity proposal, change a role, grant a permission, run a tool, or claim work was done. Prefer small, concrete improvements over generic advice. Return only valid JSON, no prose and no code fences.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.35,
      numPredict: 1800,
      signal: controller.signal,
    })) {
      if (event.type === 'text') text += event.text
    }
  } finally {
    clearTimeout(timer)
  }
  return parseJson(text)
}

function makeReport({ raw, context, settings, model }) {
  const fallback = fallbackReport(context)
  const parsed = raw && typeof raw === 'object' ? raw : {}
  const improvements = normalizeImprovements(parsed.improvements, fallback.improvements)
  const nextMoves = cleanList(parsed.nextMoves, 4, 220)
  const generatedAt = Date.now()
  return {
    id: `boss_${randomUUID().slice(0, 8)}`,
    generatedAt,
    day: dayKey(new Date(generatedAt)),
    source: raw ? 'model' : 'offline',
    model: model || '',
    headline: clean(parsed.headline, 140) || fallback.headline,
    summary: clean(parsed.summary, 700) || fallback.summary,
    wins: cleanList(parsed.wins, 5).length ? cleanList(parsed.wins, 5) : fallback.wins,
    risks: cleanList(parsed.risks, 5).length ? cleanList(parsed.risks, 5) : fallback.risks,
    improvements,
    nextMoves: nextMoves.length ? nextMoves : fallback.nextMoves,
    stats: context.stats,
  }
}

async function generateReport(force = false) {
  const [settings, growth, rooms, state] = await Promise.all([
    getSettings(),
    getGrowthState(),
    getRooms(),
    getBossState(),
  ])
  const latest = state.reports?.[0] || null
  if (!force && latest?.day === dayKey()) {
    return { report: latest, due: false, cached: true, running: false }
  }

  const context = await collectContext(settings, growth, rooms)
  let raw = null
  let model = ''
  try {
    model = await chooseGrowthModel(settings)
    if (model) raw = await askBoss(context, settings)
  } catch {
    raw = null
  }
  const report = makeReport({ raw, context, settings, model })
  const saved = await saveBossReport(report)
  return {
    report: saved.reports[0],
    due: false,
    cached: false,
    running: false,
    history: saved.reports.slice(0, REPORT_LIMIT),
  }
}

export async function getBossStatus() {
  const [settings, state] = await Promise.all([getSettings(), getBossState()])
  const report = state.reports?.[0] || null
  return {
    report,
    due: !report || report.day !== dayKey(),
    auto: Boolean(settings.bossAuto),
    running: Boolean(runningPromise),
    history: state.reports.slice(0, REPORT_LIMIT),
  }
}

export function runBossReport({ force = false } = {}) {
  if (runningPromise) return runningPromise
  runningPromise = generateReport(force).finally(() => {
    runningPromise = null
  })
  return runningPromise
}
