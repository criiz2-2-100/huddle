import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ROOT } from './config.js'

const CATALOG_FILE = path.join(ROOT, 'skill-packs', 'role-craft.json')
let cachedCatalog = null
let cachedMtime = 0

function cleanField(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function normalizeEntry(raw) {
  const id = cleanField(raw?.id, 80).toLowerCase()
  const roboId = cleanField(raw?.roboId, 24).toLowerCase()
  const role = cleanField(raw?.role, 40)
  const name = cleanField(raw?.name, 48)
  const summary = cleanField(raw?.summary, 180)
  const trigger = cleanField(raw?.trigger, 220)
  const invocation = cleanField(raw?.invocation, 220)
  const steps = Array.isArray(raw?.steps)
    ? raw.steps.map((step) => cleanField(step, 220)).filter(Boolean).slice(0, 5)
    : []
  const rationale = cleanField(raw?.rationale, 300)
  const source = cleanField(raw?.source, 300)
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((tag) => cleanField(tag, 28)).filter(Boolean).slice(0, 10)
    : []
  if (!id || !roboId || !role || !name || !summary || !trigger || steps.length < 2) return null
  return {
    id,
    roboId,
    role,
    name,
    summary,
    trigger,
    invocation,
    steps,
    rationale,
    source,
    tags,
    seed: Boolean(raw?.seed),
  }
}

export async function loadSkillCatalog() {
  const stat = await fs.stat(CATALOG_FILE)
  if (cachedCatalog && cachedMtime === stat.mtimeMs) return cachedCatalog
  const raw = JSON.parse(await fs.readFile(CATALOG_FILE, 'utf8'))
  const entries = (Array.isArray(raw?.entries) ? raw.entries : []).map(normalizeEntry).filter(Boolean)
  if (!entries.length) throw new Error('The skill catalog has no valid entries.')
  cachedCatalog = {
    pack: cleanField(raw?.pack, 80) || 'Huddle Role Craft',
    version: Number(raw?.version) || 1,
    description: cleanField(raw?.description, 300),
    source: cleanField(raw?.source, 200) || 'repo:skill-packs/role-craft.json',
    updatedAt: cleanField(raw?.updatedAt, 40),
    adoption: cleanField(raw?.adoption, 300),
    entries,
  }
  cachedMtime = stat.mtimeMs
  return cachedCatalog
}

export async function seedSkillEntries() {
  const catalog = await loadSkillCatalog()
  return catalog.entries.filter((entry) => entry.seed)
}

export async function readSkillCatalogEntry(id) {
  const catalog = await loadSkillCatalog()
  const wanted = String(id || '').trim().toLowerCase()
  if (!wanted) return null
  return catalog.entries.find((entry) => entry.id === wanted) || null
}

export async function searchSkillCatalog({ roboId, query = '', exclude = [], limit = 6 }) {
  const catalog = await loadSkillCatalog()
  const excluded = new Set(
    (Array.isArray(exclude) ? exclude : []).map((value) => String(value || '').toLowerCase()).filter(Boolean),
  )
  const tokens = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const entries = catalog.entries
    .filter((entry) => entry.roboId === roboId)
    .filter((entry) => !excluded.has(entry.id) && !excluded.has(entry.name.toLowerCase()))
    .filter((entry) => {
      if (!tokens.length) return true
      const haystack = `${entry.id} ${entry.name} ${entry.summary} ${entry.trigger} ${entry.tags.join(' ')}`
        .toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
    .slice(0, Math.min(Math.max(Number(limit) || 6, 1), 10))
  return { catalog, entries }
}
