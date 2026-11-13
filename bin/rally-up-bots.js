#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'

const dataDir = process.env.RALLY_DATA || path.join(os.homedir(), '.rally-up-bots')
const workspace = process.env.RALLY_WORKSPACE || process.cwd()
const port = process.env.RALLY_PORT || '5110'

process.env.RALLY_DATA = dataDir
process.env.RALLY_WORKSPACE = workspace

console.log(`
  RALLY UP · 2·2·100
  console  → http://127.0.0.1:${port}
  data     → ${dataDir}
  workspace→ ${workspace}
`)

await import('../server/index.js')
