import { ROBOS } from './roster.js'

/**
 * Mission roles are the jobs the Operator assigns for a rally. They are
 * deliberately separate from the Robo's locked unit role: growth can never
 * change either one, and the role deck only changes how a Robo approaches the
 * current work.
 */
export const ROLE_LIBRARY = [
  {
    id: 'strategist',
    label: 'Strategist',
    short: 'Strategy',
    summary: 'Turns ambiguity into a sequence of moves, trade-offs and a first concrete step.',
    creed:
      'You turn a mess into a plan. You think in moves, trade-offs and next actions. Open with the shape of the problem, then the first concrete step.',
    bestFor: ['direction', 'priorities', 'sequencing', 'trade-offs'],
    keywords: ['plan', 'strategy', 'roadmap', 'scope', 'priority', 'sequence', 'architecture', 'direction', 'goal', 'decision', 'tradeoff', 'trade-off', 'approach'],
  },
  {
    id: 'engineer',
    label: 'Engineer',
    short: 'Build',
    summary: 'Builds the shortest working path through code, systems and interfaces.',
    creed:
      'You build. You think in files, interfaces and the shortest path to something that actually runs. Concrete, hands-on, allergic to vague.',
    bestFor: ['implementation', 'debugging', 'APIs', 'shipping'],
    keywords: ['code', 'build', 'fix', 'bug', 'api', 'server', 'frontend', 'backend', 'component', 'test', 'deploy', 'refactor', 'implement', 'database', 'electron', 'vue', 'node'],
  },
  {
    id: 'critic',
    label: 'Critic',
    short: 'Critique',
    summary: 'Finds the crack before it ships and always names the fix.',
    creed:
      'You find the crack in the plan. Blunt but fair, and you always name the fix. You hate hype and hand-waving.',
    bestFor: ['review', 'risk', 'red-teaming', 'edge cases'],
    keywords: ['review', 'critique', 'risk', 'flaw', 'fail', 'failure', 'audit', 'edge case', 'challenge', 'why', 'problem', 'security', 'quality', 'wrong'],
  },
  {
    id: 'researcher',
    label: 'Researcher',
    short: 'Research',
    summary: 'Brings sourced facts, comparisons and a clear line between fact and uncertainty.',
    creed:
      'You bring facts. You cite where a claim came from, flag uncertainty, and love a well-framed question.',
    bestFor: ['discovery', 'comparisons', 'context', 'facts'],
    keywords: ['research', 'find', 'source', 'compare', 'market', 'docs', 'learn', 'investigate', 'facts', 'background', 'search', 'lookup', 'reference', 'evidence'],
  },
  {
    id: 'operator',
    label: 'Operator',
    short: 'Operate',
    summary: 'Runs the tools, checks the machine and reports what actually happened.',
    creed:
      'You run the tools. Checklists, verification, the smallest safe action. You report what actually happened, not what should have.',
    bestFor: ['tools', 'files', 'verification', 'checks'],
    keywords: ['run', 'tool', 'file', 'shell', 'workspace', 'verify', 'checklist', 'command', 'install', 'test', 'terminal', 'process', 'export', 'launch'],
  },
  {
    id: 'archivist',
    label: 'Archivist',
    short: 'Archive',
    summary: 'Remembers the thread, connects prior decisions and keeps the record clean.',
    creed:
      'You remember. You connect this moment to what the unit already knows, summarise cleanly, and keep the thread alive.',
    bestFor: ['summaries', 'history', 'knowledge', 'organization'],
    keywords: ['remember', 'summary', 'summarize', 'notes', 'history', 'document', 'organize', 'connect', 'memory', 'index', 'record', 'archive', 'context', 'log'],
  },
  {
    id: 'designer',
    label: 'Designer',
    short: 'Design',
    summary: 'Shapes the experience, the flow and the visual language around the person using it.',
    creed:
      'You shape the experience. You care about hierarchy, flow, language, accessibility and how the work feels in the hand. You make the useful thing feel inevitable.',
    bestFor: ['UI', 'flows', 'visual language', 'accessibility'],
    keywords: ['design', 'ui', 'ux', 'visual', 'layout', 'copy', 'brand', 'interaction', 'flow', 'mobile', 'accessible', 'style', 'screen', 'experience'],
  },
  {
    id: 'analyst',
    label: 'Analyst',
    short: 'Analyze',
    summary: 'Turns numbers and patterns into a decision the Operator can act on.',
    creed:
      'You turn evidence into a decision. You separate signal from noise, show the calculation, and say what the number changes.',
    bestFor: ['metrics', 'forecasts', 'patterns', 'measurement'],
    keywords: ['data', 'metric', 'analyze', 'analysis', 'report', 'number', 'forecast', 'measure', 'stats', 'trend', 'performance', 'cost', 'growth', 'conversion'],
  },
  {
    id: 'negotiator',
    label: 'Negotiator',
    short: 'Align',
    summary: 'Finds the workable agreement, names the constraint and protects the relationship.',
    creed:
      'You find the deal. You name the real constraint, separate positions from interests, and look for the version both sides can live with.',
    bestFor: ['stakeholders', 'requirements', 'alignment', 'decisions'],
    keywords: ['stakeholder', 'negotiate', 'agree', 'constraint', 'decision', 'meeting', 'user', 'team', 'requirement', 'conflict', 'priority', 'scope', 'expectation'],
  },
  {
    id: 'teacher',
    label: 'Teacher',
    short: 'Explain',
    summary: 'Makes the complex usable through examples, sequencing and plain language.',
    creed:
      'You make the complex usable. You start where the learner is, use a concrete example, and leave them with one thing they can do next.',
    bestFor: ['docs', 'onboarding', 'explanations', 'handoffs'],
    keywords: ['explain', 'teach', 'docs', 'onboarding', 'guide', 'tutorial', 'write', 'simplify', 'help', 'learn', 'handoff', 'readme', 'instructions', 'example'],
  },
  {
    id: 'scout',
    label: 'Scout',
    short: 'Explore',
    summary: 'Finds the angle nobody checked, the alternative and the next opening.',
    creed:
      'You explore. You look around the obvious path for a better angle, bring back one concrete alternative, and say why it might matter.',
    bestFor: ['exploration', 'alternatives', 'inspiration', 'opportunities'],
    keywords: ['explore', 'idea', 'alternative', 'competitor', 'trend', 'inspiration', 'discover', 'opportunity', 'new', 'creative', 'unexpected', 'option', 'experiment'],
  },
  {
    id: 'guardian',
    label: 'Guardian',
    short: 'Protect',
    summary: 'Protects the system, the Operator and the data when the stakes are high.',
    creed:
      'You protect the system. You look for the failure that costs trust, keep secrets out of the wrong places, and make the safe path the easy path.',
    bestFor: ['security', 'privacy', 'safety', 'recovery'],
    keywords: ['security', 'privacy', 'auth', 'permission', 'safe', 'secret', 'vulnerability', 'backup', 'risk', 'access', 'protect', 'encrypt', 'token', 'recovery'],
  },
]

export const ROLE_BY_ID = new Map(ROLE_LIBRARY.map((role) => [role.id, role]))

export const DEFAULT_ROLE_ASSIGNMENTS = Object.freeze({
  deuce: 'strategist',
  uno: 'engineer',
  null: 'critic',
  duet: 'researcher',
  ion: 'operator',
  zero: 'archivist',
})

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'our', 'you', 'are', 'was',
  'have', 'has', 'but', 'not', 'can', 'will', 'would', 'should', 'about', 'just', 'make', 'need',
  'want', 'how', 'what', 'when', 'where', 'who', 'why', 'all', 'any', 'one', 'two', 'get', 'out',
  'its', 'it’s', 'too', 'than', 'then', 'them', 'they', 'their', 'there', 'here', 'more', 'most',
])

export function normalizeRoleAssignments(input) {
  const next = { ...DEFAULT_ROLE_ASSIGNMENTS }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return next
  for (const robo of ROBOS) {
    const value = input[robo.id]
    if (typeof value === 'string' && ROLE_BY_ID.has(value)) next[robo.id] = value
  }
  return next
}

export function roleFor(assignments, roboId) {
  const normalized = normalizeRoleAssignments(assignments)
  return ROLE_BY_ID.get(normalized[roboId]) || ROLE_BY_ID.get(DEFAULT_ROLE_ASSIGNMENTS[roboId]) || ROLE_LIBRARY[0]
}

/** Add the current mission role without touching the locked unit role. */
export function withMissionRole(robo, assignments) {
  const role = roleFor(assignments, robo.id)
  return {
    ...robo,
    missionRoleId: role.id,
    missionRole: role.label,
    missionRoleSummary: role.summary,
    missionRoleCreed: role.creed,
    missionRoleBestFor: role.bestFor,
  }
}

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  )
}

function scoreRole(role, lowerText, tokens, currentId) {
  let score = currentId === role.id ? 0.4 : 0
  const matches = []
  for (const keyword of role.keywords) {
    const needle = keyword.toLowerCase()
    const hit = needle.includes(' ') || needle.includes('-')
      ? lowerText.includes(needle)
      : tokens.has(needle)
    if (!hit) continue
    score += needle.includes(' ') || needle.includes('-') ? 3.5 : 2.5
    matches.push(keyword)
  }
  for (const fit of role.bestFor) {
    const parts = String(fit).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    if (parts.some((part) => tokens.has(part))) {
      score += 1
      matches.push(fit)
    }
  }
  return { score, matches: [...new Set(matches)] }
}

/**
 * Greedy, transparent role fitting. It suggests a unique mission role for each
 * active Robo, then lets the Operator accept or edit the result. It never
 * silently changes assignments.
 */
export function recommendRoles({ text = '', roboIds = [], assignments = {} } = {}) {
  const lowerText = String(text || '').toLowerCase().trim()
  const normalized = normalizeRoleAssignments(assignments)
  const ids = [...new Set((Array.isArray(roboIds) ? roboIds : []).filter((id) => ROBOS.some((robo) => robo.id === id)))]
  const tokens = tokenize(lowerText)
  if (!lowerText) {
    return {
      assignments: Object.fromEntries(ids.map((id) => [id, normalized[id]])),
      reasons: Object.fromEntries(ids.map((id) => [id, 'Current mission role kept; add a brief to fit the work.'])),
      summary: 'No mission brief to fit yet.',
    }
  }

  const candidates = [...ROLE_LIBRARY]
  const used = new Set()
  const next = {}
  const reasons = {}
  for (const roboId of ids) {
    let best = null
    for (const role of candidates) {
      if (used.has(role.id) && used.size < candidates.length) continue
      const scored = scoreRole(role, lowerText, tokens, normalized[roboId])
      if (!best || scored.score > best.score) best = { role, ...scored }
    }
    const role = best?.role || candidates[0]
    used.add(role.id)
    next[roboId] = role.id
    const evidence = best?.matches.slice(0, 2).join(' + ')
    reasons[roboId] = evidence
      ? `Fits ${role.label.toLowerCase()} work: ${evidence}.`
      : `A balanced choice for this brief; ${role.bestFor[0]} is the first job.`
  }
  return {
    assignments: next,
    reasons,
    summary: `${ids.length} mission ${ids.length === 1 ? 'role' : 'roles'} fitted from the brief.`,
  }
}
