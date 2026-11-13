import http from 'node:http'
import path from 'node:path'
import { promises as fs, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PORT, DIST_DIR, MAX_BODY_BYTES } from './config.js'
import { ROBOS, ROBO_IDS } from './roster.js'
import { ROLE_LIBRARY, normalizeRoleAssignments, recommendRoles, withMissionRole } from './roles.js'
import {
  ensureDataDir,
  migrateLegacyRoomNames,
  getSettings,
  patchSettings,
  getRooms,
  getRoom,
  createRoom,
  saveRoom,
  deleteRoom,
  renameRoom,
  getMemory,
  clearMemory,
  getGrowthState,
} from './store.js'
import {
  reflectIdentity,
  approveIdentity,
  discardProposal,
  revertIdentity,
  rosterWithIdentities,
  nameOf,
  growthModelsForAll,
} from './growth.js'
import { listOllamaModels, listOpenAIModels, suggestModel } from './llm.js'
import { runChat } from './orchestrator.js'
import { AUTONOMY_LIMITS, runAutonomy, scheduleAutonomy } from './autonomy.js'
import { deleteSkill, ensureSeedSkills } from './skills.js'
import { getBossStatus, runBossReport } from './boss.js'
import {
  getRemoteStatus,
  isLoopbackRequest,
  rotateRemoteToken,
  setRemoteTarget,
  syncRemote,
} from './remote.js'

const runs = new Map()

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendText(res, status, value) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(value)
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function publicSettings(settings) {
  const { openaiKey, ...rest } = settings
  return { ...rest, hasKey: Boolean(openaiKey) }
}

function sanitizeSettings(patch) {
  const next = {}
  if (typeof patch.provider === 'string' && ['ollama', 'openai'].includes(patch.provider)) {
    next.provider = patch.provider
  }
  if (typeof patch.ollamaUrl === 'string') {
    next.ollamaUrl = patch.ollamaUrl.trim().slice(0, 300).replace(/\/+$/, '') || 'http://localhost:11434'
  }
  if (typeof patch.openaiBaseUrl === 'string') {
    next.openaiBaseUrl = patch.openaiBaseUrl.trim().slice(0, 300).replace(/\/+$/, '')
  }
  if (typeof patch.openaiKey === 'string' && patch.openaiKey.trim()) {
    next.openaiKey = patch.openaiKey.trim().slice(0, 400)
  }
  if (patch.clearKey === true) next.openaiKey = ''
  if (typeof patch.model === 'string') next.model = patch.model.trim().slice(0, 200)
  if (Array.isArray(patch.active)) {
    next.active = patch.active.filter((roboId) => ROBO_IDS.has(roboId))
  }
  if (patch.roles && typeof patch.roles === 'object' && !Array.isArray(patch.roles)) {
    next.roles = normalizeRoleAssignments(patch.roles)
  }
  if (patch.roboModels && typeof patch.roboModels === 'object' && !Array.isArray(patch.roboModels)) {
    const models = {}
    for (const [roboId, model] of Object.entries(patch.roboModels)) {
      if (!ROBO_IDS.has(roboId)) continue
      models[roboId] = typeof model === 'string' && model.trim() ? model.trim().slice(0, 200) : null
    }
    next.roboModels = models
  }
  if (patch.growthModels && typeof patch.growthModels === 'object' && !Array.isArray(patch.growthModels)) {
    const models = {}
    for (const slot of ['identity', 'skills']) {
      const value = patch.growthModels[slot]
      if (typeof value === 'string') models[slot] = value.trim().slice(0, 200)
      else if (value === null) models[slot] = ''
    }
    if (Object.keys(models).length) next.growthModels = models
  }
  if (
    patch.roboGrowthModels &&
    typeof patch.roboGrowthModels === 'object' &&
    !Array.isArray(patch.roboGrowthModels)
  ) {
    const overrides = {}
    for (const [roboId, entry] of Object.entries(patch.roboGrowthModels)) {
      if (!ROBO_IDS.has(roboId)) continue
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        overrides[roboId] = { identity: '', skills: '' }
        continue
      }
      const override = {}
      for (const slot of ['identity', 'skills']) {
        if (!Object.prototype.hasOwnProperty.call(entry, slot)) continue
        const value = entry[slot]
        if (typeof value === 'string') override[slot] = value.trim().slice(0, 200)
        else if (value === null) override[slot] = ''
      }
      if (Object.keys(override).length) overrides[roboId] = override
    }
    if (Object.keys(overrides).length) next.roboGrowthModels = overrides
  }
  if (patch.maxSpeakers !== undefined && Number.isFinite(Number(patch.maxSpeakers))) {
    next.maxSpeakers = Math.min(6, Math.max(1, Math.round(Number(patch.maxSpeakers))))
  }
  if (patch.temperature !== undefined && Number.isFinite(Number(patch.temperature))) {
    next.temperature = Math.min(1.5, Math.max(0, Number(patch.temperature)))
  }
  for (const key of ['toolsEnabled', 'allowWrite', 'allowShell', 'autoSpeak', 'autonomy', 'bossAuto', 'remoteAccess']) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
  }
  if (typeof patch.workspace === 'string' && patch.workspace.trim()) {
    next.workspace = path.resolve(patch.workspace.trim())
  }
  return next
}

function roomSummary(room, growth) {
  const last = [...room.messages].reverse().find((message) => message.text)
  const speaker = last?.role === 'robo' ? nameOf(last.roboId, growth) : 'YOU'
  return {
    id: room.id,
    name: room.name,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    count: room.messages.length,
    preview: last ? `${speaker}: ${String(last.text).replace(/\s+/g, ' ').slice(0, 120)}` : '',
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

async function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return sendText(res, 405, 'Method not allowed')
  const indexFile = path.join(DIST_DIR, 'index.html')
  if (!existsSync(indexFile)) {
    return sendText(
      res,
      503,
      'The Rally Up Bots UI is not built yet.\n\nDev:   npm run dev\nBuild: npm run build && npm start\n',
    )
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let file = path.resolve(DIST_DIR, relative)
  if (!file.startsWith(`${DIST_DIR}${path.sep}`) && file !== indexFile) {
    return sendText(res, 403, 'Forbidden')
  }
  try {
    const stat = await fs.stat(file)
    if (stat.isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = indexFile
  }

  try {
    const data = await fs.readFile(file)
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control': file === indexFile ? 'no-store' : 'public, max-age=3600',
    })
    res.end(req.method === 'HEAD' ? undefined : data)
  } catch {
    sendText(res, 404, 'Not found')
  }
}

const server = http.createServer(async (req, res) => {
  let pathname = '/'
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return sendText(res, 400, 'Bad request')
  }

  try {
    if (!pathname.startsWith('/api')) {
      await serveStatic(req, res, pathname)
      return
    }

    /* ---------------------------------------------------------------- */
    /* Health and models                                                 */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/health' && req.method === 'GET') {
      const settings = await getSettings()
      const probe =
        settings.provider === 'openai'
          ? { ok: Boolean(settings.openaiKey), models: [], error: settings.openaiKey ? '' : 'No API key' }
          : await listOllamaModels(settings.ollamaUrl)
      return sendJson(res, 200, {
        ok: true,
        provider: settings.provider,
        linked: probe.ok,
        count: probe.models?.length || 0,
        error: probe.error || '',
        model: settings.model,
        hasKey: Boolean(settings.openaiKey),
        workspace: settings.workspace,
        local: isLoopbackRequest(req),
      })
    }

    if (pathname === '/api/models' && req.method === 'GET') {
      const settings = await getSettings()
      if (settings.provider === 'openai') {
        const result = await listOpenAIModels(settings.openaiBaseUrl, settings.openaiKey)
        return sendJson(res, 200, {
          provider: 'openai',
          linked: result.ok,
          models: result.models,
          suggested: result.models[0]?.name || '',
          error: result.error || '',
        })
      }
      const result = await listOllamaModels(settings.ollamaUrl)
      return sendJson(res, 200, {
        provider: 'ollama',
        linked: result.ok,
        models: result.models,
        suggested: suggestModel(result.models),
        error: result.error || '',
      })
    }

    if (pathname === '/api/roster' && req.method === 'GET') {
      const [growth, settings] = await Promise.all([getGrowthState(), getSettings()])
      return sendJson(res, 200, {
        robos: rosterWithIdentities(growth).map((robo) => withMissionRole(robo, settings.roles)),
      })
    }

    if (pathname === '/api/roles' && req.method === 'GET') {
      const settings = await getSettings()
      return sendJson(res, 200, {
        roles: ROLE_LIBRARY,
        assignments: settings.roles,
        defaults: normalizeRoleAssignments({}),
      })
    }

    if (pathname === '/api/roles/recommend' && req.method === 'POST') {
      const body = await readBody(req)
      const settings = await getSettings()
      const roboIds = Array.isArray(body.roboIds) && body.roboIds.length ? body.roboIds : settings.active
      return sendJson(
        res,
        200,
        recommendRoles({
          text: String(body.text || '').slice(0, 5000),
          roboIds,
          assignments: settings.roles,
        }),
      )
    }

    /* ---------------------------------------------------------------- */
    /* Controlled growth                                                 */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/growth' && req.method === 'GET') {
      const settings = await getSettings()
      const growth = await getGrowthState()
      const { global: models, robos } = await growthModelsForAll(settings)
      return sendJson(res, 200, {
        ...growth,
        model: models.identity,
        models,
        robos,
        autonomy: Boolean(settings.autonomy),
        limits: AUTONOMY_LIMITS,
      })
    }

    if (pathname === '/api/boss' && req.method === 'GET') {
      return sendJson(res, 200, await getBossStatus())
    }

    if (pathname === '/api/boss/run' && req.method === 'POST') {
      const body = await readBody(req)
      return sendJson(res, 200, await runBossReport({ force: body.force === true }))
    }

    if (pathname === '/api/autonomy/run' && req.method === 'POST') {
      const body = await readBody(req)
      const settings = await getSettings()
      if (!settings.autonomy) {
        return sendJson(res, 403, { error: 'Autonomy is off. Arm it in SELF first.' })
      }
      const roboId = String(body.roboId || settings.active?.[0] || '')
      const room = body.roomId ? await getRoom(String(body.roomId)) : null
      return sendJson(
        res,
        200,
        await runAutonomy({ roboId, room, settings, reason: body.reason || 'operator request' }),
      )
    }

    const skillMatch = pathname.match(/^\/api\/skills\/([\w-]+)\/([\w-]+)$/)
    if (skillMatch && req.method === 'DELETE') {
      if (!ROBO_IDS.has(skillMatch[1])) return sendJson(res, 404, { error: 'Unknown Robo.' })
      return sendJson(res, 200, await deleteSkill(skillMatch[1], skillMatch[2]))
    }

    const growthMatch = pathname.match(/^\/api\/growth\/([\w-]+)\/(reflect|approve|discard|revert)$/)
    if (growthMatch && req.method === 'POST') {
      const roboId = growthMatch[1]
      if (!ROBO_IDS.has(roboId)) return sendJson(res, 404, { error: 'Unknown Robo.' })
      const action = growthMatch[2]

      if (action === 'reflect') {
        const body = await readBody(req)
        const room = body.roomId ? await getRoom(String(body.roomId)) : null
        const settings = await getSettings()
        return sendJson(res, 200, await reflectIdentity({ roboId, room, settings }))
      }
      if (action === 'approve') {
        const body = await readBody(req)
        return sendJson(res, 200, await approveIdentity(roboId, body))
      }
      if (action === 'discard') {
        return sendJson(res, 200, await discardProposal(roboId))
      }
      return sendJson(res, 200, await revertIdentity(roboId))
    }

    /* ---------------------------------------------------------------- */
    /* Settings                                                          */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/settings' && req.method === 'GET') {
      return sendJson(res, 200, publicSettings(await getSettings()))
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await readBody(req)
      if (body.remoteAccess !== undefined && !isLoopbackRequest(req)) {
        return sendJson(res, 403, { error: 'The phone link can only be changed on the host machine.' })
      }
      const settings = await patchSettings(sanitizeSettings(body))
      if (body.remoteAccess !== undefined) await syncRemote(settings)
      return sendJson(res, 200, publicSettings(settings))
    }

    if (pathname === '/api/remote' && req.method === 'GET') {
      if (!isLoopbackRequest(req)) {
        return sendJson(res, 403, { error: 'Phone-link settings are available only on the host machine.' })
      }
      return sendJson(res, 200, getRemoteStatus({ includeToken: true }))
    }

    if (pathname === '/api/remote/rotate' && req.method === 'POST') {
      if (!isLoopbackRequest(req)) {
        return sendJson(res, 403, { error: 'Phone-link settings are available only on the host machine.' })
      }
      return sendJson(res, 200, await rotateRemoteToken())
    }

    /* ---------------------------------------------------------------- */
    /* Rooms                                                             */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/rooms' && req.method === 'GET') {
      const rooms = await getRooms()
      const growth = await getGrowthState()
      return sendJson(res, 200, {
        rooms: rooms
          .map((room) => roomSummary(room, growth))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      })
    }

    if (pathname === '/api/rooms' && req.method === 'POST') {
      const body = await readBody(req)
      return sendJson(res, 201, await createRoom(body.name))
    }

    const roomMatch = pathname.match(/^\/api\/rooms\/([\w-]+)$/)
    if (roomMatch && req.method === 'GET') {
      const room = await getRoom(roomMatch[1])
      if (!room) return sendJson(res, 404, { error: 'Room not found' })
      return sendJson(res, 200, room)
    }

    if (roomMatch && req.method === 'PATCH') {
      const body = await readBody(req)
      const room = await renameRoom(roomMatch[1], body.name)
      if (!room) return sendJson(res, 404, { error: 'Room not found' })
      return sendJson(res, 200, roomSummary(room))
    }

    if (roomMatch && req.method === 'DELETE') {
      await deleteRoom(roomMatch[1])
      return sendJson(res, 200, { ok: true })
    }

    /* ---------------------------------------------------------------- */
    /* Memory                                                            */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/memory' && req.method === 'GET') {
      return sendJson(res, 200, { memory: await getMemory() })
    }

    const memoryMatch = pathname.match(/^\/api\/memory\/([\w-]+)$/)
    if (memoryMatch && req.method === 'DELETE') {
      return sendJson(res, 200, { memory: await clearMemory(memoryMatch[1]) })
    }
    if (pathname === '/api/memory' && req.method === 'DELETE') {
      return sendJson(res, 200, { memory: await clearMemory() })
    }

    /* ---------------------------------------------------------------- */
    /* Export                                                            */
    /* ---------------------------------------------------------------- */

    const exportMatch = pathname.match(/^\/api\/export\/([\w-]+)$/)
    if (exportMatch && req.method === 'GET') {
      const room = await getRoom(exportMatch[1])
      if (!room) return sendJson(res, 404, { error: 'Room not found' })
      const body = JSON.stringify(
        { app: 'Rally Up Bots', unit: '2·2·100', exportedAt: new Date().toISOString(), room },
        null,
        2,
      )
      const filename = `${String(room.name || 'rally').replace(/[^\w-]+/g, '-').toLowerCase()}.json`
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      })
      return res.end(body)
    }

    /* ---------------------------------------------------------------- */
    /* The rally                                                         */
    /* ---------------------------------------------------------------- */

    if (pathname === '/api/chat' && req.method === 'POST') {
      const body = await readBody(req)
      const room = await getRoom(String(body.roomId || ''))
      if (!room) return sendJson(res, 404, { error: 'Room not found' })
      const mode =
        body.mode === 'debate'
          ? 'debate'
          : body.mode === 'solo'
            ? 'solo'
            : body.mode === 'free'
              ? 'free'
              : 'rally'
      const text = String(body.text || '').trim()
      if (!text && mode !== 'free') return sendJson(res, 400, { error: 'Say something first.' })

      const settings = await getSettings()
      const runId = `run_${randomUUID().slice(0, 8)}`
      const controller = new AbortController()
      runs.set(runId, controller)

      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      res.flushHeaders?.()

      let finished = false
      const emit = (event) => {
        if (finished) return
        try {
          res.write(`${JSON.stringify(event)}\n`)
        } catch {
          finished = true
        }
      }
      res.on('close', () => {
        if (!finished) controller.abort()
      })

      emit({ type: 'run', runId })

      try {
        const result = await runChat({
          room,
          settings,
          text,
          targets: Array.isArray(body.targets) ? body.targets : [],
          mode,
          emit,
          signal: controller.signal,
          save: () => saveRoom(room),
        })
        // Catalog discovery is the turn's skill-growth event. Do not queue a
        // second autonomy pass that could alter identity in the same rally.
        if (
          settings.autonomy &&
          mode !== 'free' &&
          result?.spokenIds?.length &&
          !result?.adoptedSkills?.length &&
          !result?.catalogTouched
        ) {
          const queued = scheduleAutonomy({
            room,
            settings,
            roboIds: result.spokenIds,
          })
          if (queued) emit({ type: 'autonomy_queued', roboId: queued })
        }
        emit({ type: 'done', runId })
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
          emit({ type: 'aborted', runId })
        } else {
          emit({ type: 'error', message: error.message })
          await saveRoom(room)
        }
      } finally {
        finished = true
        runs.delete(runId)
        res.end()
      }
      return
    }

    if (pathname === '/api/abort' && req.method === 'POST') {
      const body = await readBody(req)
      const controller = runs.get(String(body.runId || ''))
      if (controller) controller.abort()
      return sendJson(res, 200, { ok: Boolean(controller) })
    }

    sendJson(res, 404, { error: 'Unknown API route' })
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end()
      } catch {
        /* socket already gone */
      }
      return
    }
    sendJson(res, Number(error.status) || 500, { error: error.message || 'Server error' })
  }
})

server.requestTimeout = 0
server.headersTimeout = 60_000

await ensureDataDir()
setRemoteTarget(PORT)
await migrateLegacyRoomNames().catch((error) => {
  console.error('[rally] room name migration failed:', error.message)
})
await ensureSeedSkills().catch((error) => {
  console.error('[rally] skill seed failed:', error.message)
})
server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[rally] brain listening on http://127.0.0.1:${PORT}`)
  const settings = await getSettings().catch(() => null)
  if (settings?.remoteAccess) {
    const remote = await syncRemote(settings)
    if (remote.error) console.error(`[rally] ${remote.error}`)
    else console.log(`[rally] phone link listening on http://${remote.host}:${remote.port}`)
  }
})

process.on('unhandledRejection', (error) => {
  console.error('[rally] unhandled rejection:', error)
})
