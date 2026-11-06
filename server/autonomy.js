import { ROBOS_BY_ID } from './roster.js'
import { getGrowthState, updateGrowth } from './store.js'
import { approveIdentity, discardProposal, reflectIdentity } from './growth.js'
import { MAX_SKILLS, addSkill, reflectSkill } from './skills.js'

/**
 * Operator-armed autonomy.
 *
 * The Operator turns autonomy on. After a huddle, one speaking Robo may run one
 * local reflection: it can apply a bounded personal identity/practice update and
 * one role-scoped skill. It can never change the unit role, unit creed, serial,
 * tools permissions, safety rules or the Operator's authority. Cooldowns and
 * hard caps prevent runaway self-modification.
 */

export const AUTONOMY_LIMITS = {
  identityCooldownMs: 6 * 60 * 60 * 1000,
  skillCooldownMs: 2 * 60 * 60 * 1000,
  skillsPerDay: 2,
  maxSkills: MAX_SKILLS,
}

const running = new Set()

function autonomyError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function logEntry(roboId, kind, title, summary, model = '', extra = {}) {
  return {
    id: `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    roboId,
    kind,
    title,
    summary,
    model,
    auto: true,
    ...extra,
  }
}

async function appendLog(entry) {
  await updateGrowth((state) => {
    state.autonomyLog = [...(state.autonomyLog || []), entry].slice(-120)
  })
}

/**
 * Run one autonomy cycle for a Robo. Called by the Operator's Run Now button and
 * by the post-huddle scheduler. Local model calls have no app token/time budget.
 */
export async function runAutonomy({ roboId, room, settings, reason = 'work' }) {
  const robo = ROBOS_BY_ID.get(roboId)
  if (!robo) throw autonomyError(404, 'Unknown Robo.')
  if (!settings?.autonomy) {
    throw autonomyError(403, 'Autonomy is off. Arm it in SELF first.')
  }
  if (running.has(roboId)) {
    throw autonomyError(409, `${robo.name} is already in an autonomy cycle.`)
  }

  running.add(roboId)
  const result = {
    roboId,
    identity: { status: 'skipped' },
    skill: { status: 'skipped' },
  }

  try {
    let growth = await getGrowthState()
    const now = Date.now()
    const pending = growth.proposals?.[roboId]
    const lastIdentity = Number(growth.autonomy?.lastIdentityAt?.[roboId]) || 0

    if (pending) {
      result.identity = { status: 'skipped', reason: 'Operator review is already pending.' }
    } else if (now - lastIdentity < AUTONOMY_LIMITS.identityCooldownMs) {
      result.identity = { status: 'skipped', reason: 'Identity cooldown is active.' }
    } else {
      try {
        const reflected = await reflectIdentity({ roboId, room, settings })
        const applied = await approveIdentity(
          roboId,
          {},
          { auto: true },
        )
        await updateGrowth((state) => {
          state.autonomy.lastIdentityAt = {
            ...(state.autonomy.lastIdentityAt || {}),
            [roboId]: Date.now(),
          }
          state.autonomyLog = [
            ...(state.autonomyLog || []),
            logEntry(
              roboId,
              'identity',
              applied.identity.name,
              applied.identity.practice || applied.identity.personalCreed || reflected.proposal.tagline,
              reflected.proposal.model || '',
            ),
          ].slice(-120)
        })
        result.identity = {
          status: 'applied',
          name: applied.identity.name,
          personalCreed: applied.identity.personalCreed || '',
          practice: applied.identity.practice || '',
          tools: applied.identity.tools || null,
        }
      } catch (error) {
        await discardProposal(roboId).catch(() => {})
        await appendLog(
          logEntry(roboId, 'identity-error', 'Identity reflection failed', error.message),
        ).catch(() => {})
        result.identity = { status: 'error', error: error.message }
      }
    }

    growth = await getGrowthState()
    const skills = Array.isArray(growth.skills?.[roboId]) ? growth.skills[roboId] : []
    const lastSkill = Number(growth.autonomy?.lastSkillAt?.[roboId]) || 0
    const recentSkills = skills.filter(
      (skill) => Date.now() - Number(skill.createdAt || 0) < 24 * 60 * 60 * 1000,
    ).length

    if (skills.length >= MAX_SKILLS) {
      result.skill = { status: 'skipped', reason: 'The skill shelf is full.' }
    } else if (Date.now() - lastSkill < AUTONOMY_LIMITS.skillCooldownMs) {
      result.skill = { status: 'skipped', reason: 'Skill cooldown is active.' }
    } else if (recentSkills >= AUTONOMY_LIMITS.skillsPerDay) {
      result.skill = { status: 'skipped', reason: 'Daily skill cap reached.' }
    } else {
      try {
        const reflected = await reflectSkill({ roboId, room, settings, reason })
        const skill = await addSkill({
          roboId,
          fields: reflected.skill,
          model: reflected.model,
          auto: true,
        })
        await updateGrowth((state) => {
          state.autonomy.lastSkillAt = {
            ...(state.autonomy.lastSkillAt || {}),
            [roboId]: Date.now(),
          }
        })
        result.skill = { status: 'applied', name: skill.name, steps: skill.steps }
      } catch (error) {
        await appendLog(
          logEntry(roboId, 'skill-error', 'Skill reflection failed', error.message),
        ).catch(() => {})
        result.skill = { status: 'error', error: error.message }
      }
    }

    return { ...result, growth: await getGrowthState() }
  } finally {
    running.delete(roboId)
  }
}

/**
 * Fire-and-forget after a huddle. One Robo per huddle keeps local work bounded
 * while every speaking Robo gets a turn across successive huddles.
 */
export function scheduleAutonomy({ room, settings, roboIds }) {
  if (!settings?.autonomy) return ''
  const roboId = [...new Set(roboIds || [])].find((id) => ROBOS_BY_ID.has(id))
  if (!roboId) return ''
  const timer = setTimeout(() => {
    runAutonomy({ roboId, room, settings, reason: 'a completed huddle' }).catch((error) => {
      if (Number(error.status) !== 409) console.error('[huddle] autonomy failed:', error.message)
    })
  }, 350)
  timer.unref?.()
  return roboId
}
