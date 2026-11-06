#!/usr/bin/env node
/**
 * Huddle dev launcher: local brain (API + Ollama bridge) and the Vite console.
 * Reuses the Vivi start pattern: one command, both processes, clean shutdown.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiPort = process.env.HUDDLE_PORT || '5110'
const uiPort = process.env.HUDDLE_UI_PORT || '5180'
const children = []
let exiting = false

function launch(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`))
  child.on('exit', (code) => {
    if (exiting) return
    if (code) console.error(`[${name}] exited with code ${code}`)
    shutdown(code || 1)
  })
  children.push(child)
  return child
}

function shutdown(code = 0) {
  exiting = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 150)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0))
}

if (!existsSync(path.join(root, 'node_modules', 'vite'))) {
  console.error('[huddle] Dependencies are missing. Run `npm install` first.')
  process.exit(1)
}

launch('brain', 'node', ['server/index.js'], { HUDDLE_PORT: apiPort })
launch('ui', 'npx', ['vite', '--port', uiPort, '--strictPort'], {
  HUDDLE_PORT: apiPort,
  HUDDLE_UI_PORT: uiPort,
})

console.log(`\n  HUDDLE · 2·2·100\n  console  → http://localhost:${uiPort}\n  brain    → http://127.0.0.1:${apiPort}\n`)

setTimeout(async () => {
  try {
    const response = await fetch(`http://localhost:11434/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (response.ok) console.log('[brain] Ollama is up.')
    else console.warn('[brain] Ollama answered with an error — check `ollama serve`.')
  } catch {
    console.warn('[brain] Ollama is not reachable. Start it with `ollama serve` before chatting.')
  }
}, 1200)
