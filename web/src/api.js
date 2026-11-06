const BASE = '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    })
  } catch {
    throw new Error('The Huddle brain is unreachable. Is the server running?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `${path} failed (${response.status})`)
  return data
}

export const getHealth = () => request('/health')
export const getModels = () => request('/models')
export const getRoster = () => request('/roster')
export const getSettings = () => request('/settings')

export function saveSettings(patch) {
  return request('/settings', { method: 'PUT', body: JSON.stringify(patch) })
}

export const getRooms = () => request('/rooms')

export function createRoom(name) {
  return request('/rooms', { method: 'POST', body: JSON.stringify({ name }) })
}

export const getRoom = (id) => request(`/rooms/${id}`)

export function renameRoom(id, name) {
  return request(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export function removeRoom(id) {
  return request(`/rooms/${id}`, { method: 'DELETE' })
}

export const getMemory = () => request('/memory')
export const getGrowth = () => request('/growth')

export function reflectRobo(id, roomId) {
  return request(`/growth/${id}/reflect`, {
    method: 'POST',
    body: JSON.stringify({ roomId: roomId || '' }),
  })
}

export function approveRobo(id, proposal) {
  return request(`/growth/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(proposal),
  })
}

export function discardRobo(id) {
  return request(`/growth/${id}/discard`, { method: 'POST' })
}

export function revertRobo(id) {
  return request(`/growth/${id}/revert`, { method: 'POST' })
}

export function runAutonomyNow(id, roomId) {
  return request('/autonomy/run', {
    method: 'POST',
    body: JSON.stringify({ roboId: id, roomId: roomId || '' }),
  })
}

export function forgetSkill(roboId, skillId) {
  return request(`/skills/${roboId}/${skillId}`, { method: 'DELETE' })
}

export function clearMemory(roboId) {
  return request(roboId ? `/memory/${roboId}` : '/memory', { method: 'DELETE' })
}

export function exportUrl(roomId) {
  return `${BASE}/export/${roomId}`
}

export function abortRun(runId) {
  return request('/abort', { method: 'POST', body: JSON.stringify({ runId }) }).catch(() => {})
}

/** POST a huddle and dispatch each NDJSON event as it arrives. */
export async function streamHuddle(payload, { signal, onEvent }) {
  let response
  try {
    response = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('The Huddle brain is unreachable. Is the server running?')
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Huddle failed (${response.status})`)
  }
  if (!response.body) throw new Error('This browser cannot stream responses.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line))
      } catch {
        /* ignore malformed line */
      }
    }
  }

  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()))
    } catch {
      /* ignore */
    }
  }
}
