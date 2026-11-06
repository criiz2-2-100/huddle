import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(SERVER_DIR, '..')
const dataDirOverride = process.env.HUDDLE_DATA
export const DATA_DIR = dataDirOverride ? path.resolve(dataDirOverride) : path.join(ROOT, 'data')
export const DIST_DIR = path.join(ROOT, 'web', 'dist')
export const PORT = Number(process.env.HUDDLE_PORT || 5110)
export const MAX_BODY_BYTES = 1_000_000

/** Models we reach for first when nobody has chosen one yet. All local. */
export const MODEL_PREFERENCE = [
  'llama3.2:latest',
  'llama3.2:3b',
  'llama3.1:latest',
  'gemma4:latest',
  'qwen3:8b',
  'mistral:latest',
]

/** Growth reflections prefer a local brain so self-review works offline. */
export const GROWTH_MODEL_PREFERENCE = [
  'gemma4:latest',
  'llama3.2:latest',
  'Distendo/zen-pro:latest',
  'qwen3.6:latest',
]

export const ROLE_MODEL_DEFAULTS = {
  deuce: 'gemma4:latest',
  uno: 'qwen3.6:latest',
  null: 'Distendo/zen-pro:latest',
  duet: 'gemma4:latest',
  ion: 'llama3.2:latest',
  zero: 'Distendo/zen-pro:latest',
}

/** Cloud specialists are recommendations for genuinely heavy work, never auto-switches. */
export const ROLE_CLOUD_MODELS = {
  deuce: 'nemotron-3-super:cloud',
  uno: 'kimi-k2.7-code:cloud',
  null: 'nemotron-3-super:cloud',
  duet: 'gemma4:31b-cloud',
  ion: 'gemma4:31b-cloud',
  zero: 'gemma4:31b-cloud',
}

export const TOOL_NAMES = [
  'list_files',
  'read_file',
  'search_skill_catalog',
  'read_skill_catalog',
  'adopt_skill',
  'write_file',
  'fetch_url',
  'current_time',
  'remember',
  'run_shell',
  'learn_skill',
]

export const DEFAULT_SETTINGS = {
  provider: 'ollama',
  ollamaUrl: process.env.HUDDLE_OLLAMA_URL || 'http://localhost:11434',
  openaiBaseUrl: 'https://openrouter.ai/api/v1',
  openaiKey: '',
  model: process.env.HUDDLE_MODEL || '',
  roboModels: ROLE_MODEL_DEFAULTS,
  active: ['deuce', 'uno', 'null'],
  maxSpeakers: 3,
  temperature: 0.85,
  toolsEnabled: true,
  allowWrite: false,
  allowShell: false,
  autonomy: false,
  workspace: ROOT,
  autoSpeak: false,
}
