import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupCollectionHandlers } from './ipc/collection'
import { setupAudioHandlers } from './ipc/audio'
import { getLocalDb, closeLocalDb } from './db/local'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'djapp',
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true,
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f17',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webSecurity: false,  // Allow file:// access for audio in dev
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.djplaylist.generator')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize local DB (runs migrations)
  try {
    getLocalDb()
  } catch (err) {
    console.error('Failed to initialize local DB:', err)
  }

  // Register IPC handlers
  setupCollectionHandlers()
  setupAudioHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeLocalDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
