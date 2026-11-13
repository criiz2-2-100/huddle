import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { DATA_DIR } from './config.js'

const STATE_FILE = path.join(DATA_DIR, 'remote.json')
const REMOTE_PORT = Number(process.env.RALLY_REMOTE_PORT || 5111)
const COOKIE_NAME = 'rally_remote'
const COOKIE_AGE = 60 * 60 * 24 * 30

const state = {
  server: null,
  token: '',
  tokenCreatedAt: 0,
  targetPort: 0,
  error: '',
}

function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export function isLoopbackRequest(req) {
  if (req.headers?.['x-rally-remote'] === '1') return false
  return loopback(req.socket?.remoteAddress || '')
}

export function getLanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return '127.0.0.1'
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  if (!a.length || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function parseCookies(header) {
  const cookies = {}
  for (const piece of String(header || '').split(';')) {
    const index = piece.indexOf('=')
    if (index < 1) continue
    cookies[piece.slice(0, index).trim()] = decodeURIComponent(piece.slice(index + 1).trim())
  }
  return cookies
}

async function ensureToken() {
  if (state.token) return state.token
  try {
    const saved = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'))
    if (typeof saved.token === 'string' && saved.token.length >= 24) {
      state.token = saved.token
      state.tokenCreatedAt = Number(saved.createdAt) || 0
      return state.token
    }
  } catch {
    /* generate the first token */
  }
  const token = randomBytes(24).toString('base64url')
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify({ token, createdAt: Date.now() }), {
    mode: 0o600,
  })
  state.token = token
  state.tokenCreatedAt = Date.now()
  return token
}

export function getRemoteStatus({ includeToken = false } = {}) {
  const enabled = Boolean(state.server)
  const host = getLanAddress()
  const token = includeToken ? state.token : ''
  return {
    enabled,
    running: enabled,
    port: REMOTE_PORT,
    host,
    lan: host !== '127.0.0.1',
    url: enabled && token ? `http://${host}:${REMOTE_PORT}/?key=${encodeURIComponent(token)}` : '',
    tokenCreatedAt: state.tokenCreatedAt,
    error: state.error,
  }
}

function unauthorized(req, res) {
  const json = String(req.url || '').startsWith('/api')
  if (json) {
    res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: 'This phone link is missing its access key.' }))
    return
  }
  res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rally Up Bots</title><body style="background:#05070c;color:#dbe9fb;font-family:system-ui;padding:32px;line-height:1.5"><h1 style="font-size:20px">Rally Up Bots</h1><p>This remote link needs its access key. Open the latest phone link from SETUP on the computer that runs the console.</p></body>`)
}

function proxy(req, res, pathname) {
  if (!state.targetPort) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('The local console is not ready yet.')
    return
  }
  const headers = { ...req.headers, host: `127.0.0.1:${state.targetPort}`, 'x-rally-remote': '1' }
  delete headers.cookie
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: state.targetPort,
      path: pathname,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (res.headersSent) return res.end()
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('The local console did not answer.')
  })
  req.pipe(upstream)
}

const remoteServer = http.createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url || '/', `http://${getLanAddress()}:${REMOTE_PORT}`)
  } catch {
    res.writeHead(400)
    return res.end('Bad request')
  }
  const key = url.searchParams.get('key') || ''
  const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME] || ''
  const authorized = safeEqual(key, state.token) || safeEqual(cookie, state.token)
  if (!authorized) return unauthorized(req, res)

  if (safeEqual(key, state.token)) {
    url.searchParams.delete('key')
    const location = `${url.pathname}${url.search}`
    res.writeHead(302, {
      location,
      'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(state.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_AGE}`,
      'cache-control': 'no-store',
    })
    return res.end()
  }

  proxy(req, res, `${url.pathname}${url.search}`)
})

async function listen() {
  if (state.server) return getRemoteStatus({ includeToken: true })
  await ensureToken()
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      remoteServer.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      remoteServer.off('error', onError)
      resolve()
    }
    remoteServer.once('error', onError)
    remoteServer.once('listening', onListening)
    remoteServer.listen(REMOTE_PORT, '0.0.0.0')
  })
  state.server = remoteServer
  state.error = ''
  return getRemoteStatus({ includeToken: true })
}

async function close() {
  if (!state.server) return
  await new Promise((resolve) => state.server.close(() => resolve()))
  state.server = null
}

export function setRemoteTarget(targetPort) {
  state.targetPort = Number(targetPort) || 0
}

export async function syncRemote(settings) {
  if (!settings?.remoteAccess) {
    await close()
    state.error = ''
    return getRemoteStatus({ includeToken: true })
  }
  try {
    await listen()
  } catch (error) {
    state.server = null
    state.error = `Could not open the phone link on port ${REMOTE_PORT}: ${error.message}`
  }
  return getRemoteStatus({ includeToken: true })
}

export async function rotateRemoteToken() {
  const token = randomBytes(24).toString('base64url')
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify({ token, createdAt: Date.now() }), {
    mode: 0o600,
  })
  state.token = token
  state.tokenCreatedAt = Date.now()
  return getRemoteStatus({ includeToken: true })
}
