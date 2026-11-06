import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA_DIR, DEFAULT_SETTINGS } from './config.js'

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json')
const GROWTH_FILE = path.join(DATA_DIR, 'growth.json')

/** One write at a time per file so two runs can't clobber each other. */
const locks = new Map()
function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve()
  const run = previous.catch(() => {}).then(fn)
  locks.set(key, run)
  return run
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(file, value, secret = false) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: secret ? 0o600 : 0o644 })
  await fs.rename(tmp, file)
  if (secret) await fs.chmod(file, 0o600).catch(() => {})
}

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function getSettings() {
  const saved = await readJson(SETTINGS_FILE, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    roboModels: { ...DEFAULT_SETTINGS.roboModels, ...(saved.roboModels || {}) },
  }
}

export function patchSettings(patch) {
  return withLock(SETTINGS_FILE, async () => {
    const saved = await readJson(SETTINGS_FILE, {})
    const next = {
      ...DEFAULT_SETTINGS,
      ...saved,
      ...patch,
      roboModels: {
        ...DEFAULT_SETTINGS.roboModels,
        ...(saved.roboModels || {}),
        ...(patch.roboModels || {}),
      },
    }
    await writeJson(SETTINGS_FILE, next, true)
    return next
  })
}

export async function getRooms() {
  const rooms = await readJson(ROOMS_FILE, [])
  return Array.isArray(rooms) ? rooms : []
}

export async function getRoom(id) {
  const rooms = await getRooms()
  return rooms.find((room) => room.id === id) || null
}

export function saveRoom(room) {
  return withLock(ROOMS_FILE, async () => {
    const rooms = await readJson(ROOMS_FILE, [])
    const next = Array.isArray(rooms) ? rooms : []
    const index = next.findIndex((item) => item.id === room.id)
    room.updatedAt = Date.now()
    if (index >= 0) next[index] = room
    else next.unshift(room)
    await writeJson(ROOMS_FILE, next, true)
    return room
  })
}

export function createRoom(name) {
  return withLock(ROOMS_FILE, async () => {
    const rooms = await readJson(ROOMS_FILE, [])
    const next = Array.isArray(rooms) ? rooms : []
    const room = {
      id: `room_${randomUUID().slice(0, 8)}`,
      name: (name || '').trim().slice(0, 60) || `Huddle ${next.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    }
    next.unshift(room)
    await writeJson(ROOMS_FILE, next, true)
    return room
  })
}

export function deleteRoom(id) {
  return withLock(ROOMS_FILE, async () => {
    const rooms = await readJson(ROOMS_FILE, [])
    const next = (Array.isArray(rooms) ? rooms : []).filter((room) => room.id !== id)
    await writeJson(ROOMS_FILE, next, true)
    return next
  })
}

export function renameRoom(id, name) {
  return withLock(ROOMS_FILE, async () => {
    const rooms = await readJson(ROOMS_FILE, [])
    const next = Array.isArray(rooms) ? rooms : []
    const room = next.find((item) => item.id === id)
    if (!room) return null
    room.name = (name || '').trim().slice(0, 60) || room.name
    room.updatedAt = Date.now()
    await writeJson(ROOMS_FILE, next, true)
    return room
  })
}

export async function getMemory() {
  const memory = await readJson(MEMORY_FILE, {})
  return memory && typeof memory === 'object' ? memory : {}
}

export function addMemory(roboId, note) {
  return withLock(MEMORY_FILE, async () => {
    const memory = await readJson(MEMORY_FILE, {})
    const all = memory && typeof memory === 'object' ? memory : {}
    const list = Array.isArray(all[roboId]) ? all[roboId] : []
    const clean = String(note || '').trim().slice(0, 500)
    if (!clean) return all
    if (!list.some((item) => item.note === clean)) {
      list.push({ note: clean, ts: Date.now() })
    }
    all[roboId] = list.slice(-40)
    await writeJson(MEMORY_FILE, all, true)
    return all
  })
}

export function clearMemory(roboId) {
  return withLock(MEMORY_FILE, async () => {
    const memory = await readJson(MEMORY_FILE, {})
    const all = memory && typeof memory === 'object' ? memory : {}
    if (roboId) delete all[roboId]
    else for (const key of Object.keys(all)) delete all[key]
    await writeJson(MEMORY_FILE, all, true)
    return all
  })
}

/* ------------------------------------------------------------------ */
/* Controlled growth                                                   */
/* ------------------------------------------------------------------ */

function emptyGrowth() {
  return {
    identities: {},
    proposals: {},
    history: {},
    skills: {},
    autonomyLog: [],
    autonomy: { lastIdentityAt: {}, lastSkillAt: {} },
  }
}

function normalizeGrowth(saved = {}) {
  const autonomy = saved.autonomy && typeof saved.autonomy === 'object' ? saved.autonomy : {}
  return {
    ...emptyGrowth(),
    ...saved,
    identities: saved.identities && typeof saved.identities === 'object' ? saved.identities : {},
    proposals: saved.proposals && typeof saved.proposals === 'object' ? saved.proposals : {},
    history: saved.history && typeof saved.history === 'object' ? saved.history : {},
    skills: saved.skills && typeof saved.skills === 'object' ? saved.skills : {},
    autonomyLog: Array.isArray(saved.autonomyLog) ? saved.autonomyLog.slice(-120) : [],
    autonomy: {
      lastIdentityAt:
        autonomy.lastIdentityAt && typeof autonomy.lastIdentityAt === 'object'
          ? autonomy.lastIdentityAt
          : {},
      lastSkillAt:
        autonomy.lastSkillAt && typeof autonomy.lastSkillAt === 'object'
          ? autonomy.lastSkillAt
          : {},
    },
  }
}

export async function getGrowthState() {
  return normalizeGrowth(await readJson(GROWTH_FILE, {}))
}

/** Read-modify-write the growth file under the same lock as the other stores. */
export function updateGrowth(mutator) {
  return withLock(GROWTH_FILE, async () => {
    const state = normalizeGrowth(await readJson(GROWTH_FILE, {}))
    await mutator(state)
    await writeJson(GROWTH_FILE, state, true)
    return state
  })
}
