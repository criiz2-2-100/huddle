import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { addMemory, getGrowthState } from './store.js'
import { adoptCatalogSkill, learnSkill } from './skills.js'
import { readSkillCatalogEntry, searchSkillCatalog } from './skillCatalog.js'

const MAX_READ = 20_000
const MAX_WRITE = 200_000
const MAX_FETCH = 120_000
const MAX_TOOL_RESULT = 8_000
const BLOCKED = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.freebuff(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /^data(\/|$)/,
  /^server\/data(\/|$)/,
]

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List files and folders inside the Huddle workspace. Use a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative folder path. Defaults to the workspace root.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file inside the workspace. Paths are relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or overwrite a text file inside the workspace. Only use when the Operator asks for a change.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          content: { type: 'string', description: 'Full file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a public web page or JSON document and return readable text.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http:// or https:// URL.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'current_time',
      description: 'Get the current date and time on the Operator’s machine.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save one durable fact about the Operator or the project to your own memory.',
      parameters: {
        type: 'object',
        properties: {
          note: { type: 'string', description: 'One short sentence worth remembering.' },
        },
        required: ['note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description:
        'Run a shell command in the workspace. Only available when the Operator has armed the shell.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_skill_catalog',
      description:
        'Search the local role-scoped skill pack for craft skills you do not already have. Returns entry ids, names, summaries and sources. Use read_skill_catalog before adopting.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What kind of skill you need, e.g. migration safety.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill_catalog',
      description:
        'Read one full skill pack entry after searching. Shows the exact procedure, source and how to invoke it. This does not adopt it.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Catalog entry id from search_skill_catalog.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adopt_skill',
      description:
        'Adopt one role-scoped catalog entry so its procedure is available now and in future turns. Only catalog ids are accepted; this cannot change role, tools, permissions, safety or identity.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Catalog entry id from read_skill_catalog.' },
          reason: { type: 'string', description: 'Why this skill fits the current task.' },
        },
        required: ['id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'learn_skill',
      description:
        'Save one reusable, role-scoped craft skill you discovered while working. Only available when autonomy is armed. This never changes your role, tools, permissions or safety rules.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short skill name.' },
          trigger: { type: 'string', description: 'When this skill should be used.' },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Two to five concrete steps.',
          },
          rationale: { type: 'string', description: 'Why this improves the role.' },
          source: { type: 'string', description: 'Optional http(s) source URL, or work.' },
        },
        required: ['name', 'trigger', 'steps', 'rationale'],
      },
    },
  },
]

const CATALOG_TOOLS = new Set(['search_skill_catalog', 'read_skill_catalog', 'adopt_skill'])

export function toolsFor(settings, loadout = null) {
  const selected = Array.isArray(loadout) && loadout.length ? new Set(loadout) : null
  return TOOL_DEFS.filter((tool) => {
    const name = tool.function.name
    if (CATALOG_TOOLS.has(name)) return Boolean(settings.toolsEnabled)
    if (selected && !selected.has(name)) return false
    if (name === 'run_shell') return Boolean(settings.allowShell)
    if (name === 'write_file') return Boolean(settings.allowWrite)
    if (name === 'learn_skill') return Boolean(settings.toolsEnabled && settings.autonomy)
    return true
  })
}

function workspaceOf(settings) {
  return path.resolve(settings.workspace || process.cwd())
}

function resolveInside(root, rawPath) {
  let input = String(rawPath || '.').trim() || '.'
  input = input.replace(/^\.\//, '')
  // Models often prefix the workspace name; it is already the root.
  const baseName = path.basename(root)
  if (input === 'workspace') input = '.'
  else if (input.startsWith('workspace/')) input = input.slice('workspace/'.length)
  else if (baseName && input === baseName) input = '.'
  else if (baseName && input.startsWith(`${baseName}/`)) input = input.slice(baseName.length + 1)
  const target = path.resolve(root, input)
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes the workspace.')
  }
  const normalized = rel.split(path.sep).join('/')
  if (normalized && BLOCKED.some((rx) => rx.test(normalized))) {
    throw new Error('That path is off-limits to robos (secrets, data and dependencies).')
  }
  return { target, rel: normalized || '.' }
}

function clip(text, limit = MAX_TOOL_RESULT) {
  const value = String(text ?? '')
  return value.length > limit ? `${value.slice(0, limit)}\n… [truncated]` : value
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function runTool(name, args = {}, context = {}) {
  const settings = context.settings || {}
  const root = workspaceOf(settings)
  try {
    if (name === 'list_files') {
      const { target, rel } = resolveInside(root, args.path)
      const entries = await fs.readdir(target, { withFileTypes: true })
      const rows = []
      for (const entry of entries.slice(0, 200)) {
        if (BLOCKED.some((rx) => rx.test(`${rel === '.' ? '' : `${rel}/`}${entry.name}`))) continue
        if (entry.isDirectory()) {
          rows.push(`d  ${entry.name}/`)
        } else {
          const stat = await fs.stat(path.join(target, entry.name)).catch(() => null)
          rows.push(`f  ${entry.name}${stat ? `  (${humanSize(stat.size)})` : ''}`)
        }
      }
      rows.sort((a, b) => {
        const directoryFirst = Number(b.startsWith('d')) - Number(a.startsWith('d'))
        return directoryFirst || a.localeCompare(b)
      })
      const body = rows.length ? rows.join('\n') : '(empty folder)'
      return {
        ok: true,
        label: `list ${rel}`,
        result: `${rel}:\n${body}\n\n${entries.length > 200 ? '(showing first 200 entries)' : ''}`.trim(),
      }
    }

    if (name === 'read_file') {
      const { target, rel } = resolveInside(root, args.path)
      let stat
      try {
        stat = await fs.stat(target)
      } catch (error) {
        if (error.code === 'ENOENT') {
          const top = await fs.readdir(root).catch(() => [])
          throw new Error(
            `${rel} was not found. The workspace root contains: ${top.slice(0, 25).join(', ')}. Paths are relative to the root, e.g. "package.json".`,
          )
        }
        throw error
      }
      if (stat.isDirectory()) throw new Error(`${rel} is a folder, not a file.`)
      if (stat.size > 2_000_000) throw new Error(`${rel} is too large to read (2 MB limit).`)
      const text = await fs.readFile(target, 'utf8')
      return { ok: true, label: `read ${rel}`, result: clip(text, MAX_READ) }
    }

    if (name === 'write_file') {
      if (!settings.allowWrite) throw new Error('Writing is switched off in Setup.')
      const { target, rel } = resolveInside(root, args.path)
      const content = String(args.content ?? '')
      if (content.length > MAX_WRITE) throw new Error('File is too large to write (200 KB limit).')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, 'utf8')
      return {
        ok: true,
        label: `write ${rel}`,
        result: `Wrote ${content.length} characters to ${rel}.`,
      }
    }

    if (name === 'fetch_url') {
      const raw = String(args.url || '').trim()
      const url = new URL(raw)
      if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https URLs are allowed.')
      const response = await fetch(url, {
        headers: { 'user-agent': 'Huddle/0.1 (personal local agent)' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url.hostname}`)
      const type = response.headers.get('content-type') || ''
      const rawText = (await response.text()).slice(0, MAX_FETCH)
      const text = /html|xml/i.test(type) ? htmlToText(rawText) : rawText
      return {
        ok: true,
        label: `fetch ${url.hostname}`,
        result: clip(`${url.href}\n\n${text || '(no readable text)'}`, 8_000),
      }
    }

    if (name === 'current_time') {
      const now = new Date()
      return {
        ok: true,
        label: 'clock',
        result: `${now.toString()}\nISO: ${now.toISOString()}`,
      }
    }

    if (name === 'remember') {
      const note = String(args.note || '').trim()
      if (!note) throw new Error('Nothing to remember.')
      if (!context.roboId) throw new Error('No robo identity attached.')
      await addMemory(context.roboId, note)
      return { ok: true, label: 'memory', result: `Saved to memory: ${clip(note, 300)}` }
    }

    if (name === 'search_skill_catalog') {
      if (!context.roboId) throw new Error('No robo identity attached.')
      const query = String(args.query || '').trim()
      const growth = await getGrowthState()
      const owned = (growth.skills?.[context.roboId] || []).flatMap((skill) => [
        skill.catalogId,
        skill.name,
      ])
      const { catalog, entries } = await searchSkillCatalog({
        roboId: context.roboId,
        query,
        exclude: owned,
      })
      if (!entries.length) {
        return {
          ok: true,
          label: `catalog ${query || 'all'}`,
          result: `No unadopted ${context.roboId} entries matched "${query || 'all'}" in ${catalog.pack}. Try a broader query.`,
        }
      }
      return {
        ok: true,
        label: `catalog ${query || 'all'}`,
        result: [
          `${catalog.pack} v${catalog.version} · ${catalog.source}`,
          ...entries.map(
            (entry) =>
              `- ${entry.id} · ${entry.name}\n  ${entry.summary}\n  source: ${entry.source}\n  tags: ${entry.tags.join(', ') || 'none'}`,
          ),
          'NEXT REQUIRED: call read_skill_catalog with one of these ids before answering; a search result is not an adopted skill.',
        ].join('\n'),
      }
    }

    if (name === 'read_skill_catalog') {
      if (!context.roboId) throw new Error('No robo identity attached.')
      const entry = await readSkillCatalogEntry(args.id)
      if (!entry || entry.roboId !== context.roboId) {
        throw new Error('That catalog entry does not exist for this role.')
      }
      const growth = await getGrowthState()
      const owned = (growth.skills?.[context.roboId] || []).some(
        (skill) =>
          skill.catalogId === entry.id ||
          String(skill.name || '').toLowerCase() === entry.name.toLowerCase(),
      )
      return {
        ok: true,
        label: `read ${entry.id}`,
        result: [
          `${entry.name} · ${entry.role}`,
          `Summary: ${entry.summary}`,
          `When: ${entry.trigger}`,
          `Invoke: ${entry.invocation || 'Follow the steps during the task.'}`,
          `Steps:\n${entry.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
          `Why: ${entry.rationale}`,
          `Source: ${entry.source}`,
          `Status: ${owned ? 'already available' : 'not yet adopted'}`,
          owned
            ? 'This skill is already on your shelf; use its steps.'
            : `NEXT REQUIRED: call adopt_skill with id "${entry.id}" and a reason before answering.`,
        ]
          .filter(Boolean)
          .join('\n'),
      }
    }

    if (name === 'adopt_skill') {
      if (!context.roboId) throw new Error('No robo identity attached.')
      const saved = await adoptCatalogSkill({
        roboId: context.roboId,
        catalogId: args.id,
        settings,
      })
      if (saved.alreadyOwned) {
        return {
          ok: true,
          label: `already ${saved.skill.name}`,
          result: `Already available to this Robo: ${saved.skill.name}. No duplicate was created.`,
        }
      }
      return {
        ok: true,
        label: `adopt ${saved.skill.name}`,
        result: [
          `ADOPTED: ${saved.skill.name}`,
          `When: ${saved.skill.trigger}`,
          `Steps:\n${saved.skill.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
          `Source: ${saved.skill.source}`,
          'This skill is now available in this session and future turns. Use it now if the task calls for it.',
        ].join('\n'),
        adoptedSkill: saved.skill,
      }
    }

    if (name === 'learn_skill') {
      if (!settings.autonomy) throw new Error('Autonomy is off. Arm it in SELF first.')
      if (!context.roboId) throw new Error('No robo identity attached.')
      const saved = await learnSkill({ roboId: context.roboId, args, settings, auto: true })
      return {
        ok: true,
        label: `learn ${saved.skill.name}`,
        result: `Learned skill: ${saved.skill.name}. When: ${saved.skill.trigger} Steps: ${saved.skill.steps.join('; ')}`,
      }
    }

    if (name === 'run_shell') {
      if (!settings.allowShell) throw new Error('The shell is not armed. Enable it in Setup.')
      const command = String(args.command || '').trim()
      if (!command) throw new Error('No command given.')
      if (command.length > 600) throw new Error('Command is too long.')
      const output = await new Promise((resolve) => {
        execFile(
          process.platform === 'win32' ? 'cmd' : 'bash',
          process.platform === 'win32' ? ['/c', command] : ['-lc', command],
          { cwd: root, timeout: 20_000, maxBuffer: 400_000 },
          (error, stdout, stderr) => {
            resolve(
              [
                error ? `exit: ${error.code || error.signal || 'error'}` : 'exit: 0',
                stdout ? `stdout:\n${stdout}` : '',
                stderr ? `stderr:\n${stderr}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            )
          },
        )
      })
      return { ok: true, label: `shell ${clip(command, 40)}`, result: clip(output, 6_000) }
    }

    return { ok: false, label: name, result: `Unknown tool: ${name}` }
  } catch (error) {
    return { ok: false, label: name, result: `Tool error: ${error.message}` }
  }
}
