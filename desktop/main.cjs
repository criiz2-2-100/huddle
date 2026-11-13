const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')

app.setName('Rally Up Bots')

let mainWindow = null
let activePort = null

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => (port ? resolve(port) : reject(new Error('Could not allocate a local port.'))))
    })
  })
}

async function waitForServer(port) {
  let lastError = null
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) return
      lastError = new Error(`Health check returned ${response.status}.`)
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }
  throw new Error(`Rally Up Bots' local server did not become ready. ${lastError?.message || ''}`.trim())
}

function createWindow(port) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: 'Rally Up Bots',
    backgroundColor: '#03070b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const origin = `http://127.0.0.1:${port}`

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })
  window.loadURL(origin)
  mainWindow = window
}

async function migrateLegacyData(targetDir) {
  if (process.env.RALLY_DATA) return
  try {
    await fs.access(targetDir)
    return
  } catch {
    /* new install */
  }
  const legacyDir = path.join(app.getPath('appData'), 'Huddle', 'data')
  try {
    await fs.access(legacyDir)
  } catch {
    return
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(legacyDir, targetDir, { recursive: true })
  console.log(`[rally] migrated previous local data to ${targetDir}`)
}

async function start() {
  const requestedPort = Number(process.env.RALLY_PORT)
  const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await getFreePort()
  activePort = port

  const dataDir = process.env.RALLY_DATA || path.join(app.getPath('userData'), 'data')
  let workspace = process.env.RALLY_WORKSPACE || path.join(os.homedir(), 'Rally Up Bots')

  await migrateLegacyData(dataDir)
  await fs.mkdir(dataDir, { recursive: true })
  try {
    await fs.mkdir(workspace, { recursive: true })
  } catch {
    workspace = app.getPath('userData')
    await fs.mkdir(workspace, { recursive: true })
  }

  process.env.RALLY_PORT = String(port)
  process.env.RALLY_DATA = dataDir
  process.env.RALLY_WORKSPACE = workspace

  console.log(`[rally] console: http://127.0.0.1:${port}`)
  console.log(`[rally] data: ${dataDir}`)
  console.log(`[rally] workspace: ${workspace}`)

  await import(pathToFileURL(path.join(app.getAppPath(), 'server', 'index.js')).href)
  await waitForServer(port)

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    )
  }

  createWindow(port)
}

function fail(error) {
  console.error(error)
  dialog.showErrorBox('Rally Up Bots could not start', error?.stack || error?.message || String(error))
  app.quit()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(start).catch(fail)

  app.on('activate', () => {
    if (!mainWindow && activePort) createWindow(activePort)
  })

  app.on('window-all-closed', () => app.quit())
}
