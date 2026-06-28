import { ipcMain, protocol } from 'electron'
import { existsSync } from 'fs'

export function setupAudioHandlers(): void {
  // Resolve a track file path and return it for use with file:// protocol
  ipcMain.handle('audio:resolvePath', async (_event, filePath: string) => {
    if (!filePath) return { exists: false, path: null }
    const exists = existsSync(filePath)
    return { exists, path: exists ? filePath : null }
  })

  // Check if a file exists without returning its path
  ipcMain.handle('audio:fileExists', async (_event, filePath: string) => {
    if (!filePath) return false
    return existsSync(filePath)
  })
}

export function registerAudioProtocol(): void {
  // Register a safe local-file protocol so the renderer can load audio
  // via djapp://audio/<base64-encoded-path>
  protocol.handle('djapp', (request) => {
    const url = new URL(request.url)
    const encodedPath = url.pathname.replace(/^\/audio\//, '')
    const filePath = Buffer.from(decodeURIComponent(encodedPath), 'base64').toString('utf-8')

    if (!existsSync(filePath)) {
      return new Response('File not found', { status: 404 })
    }

    // Use net.fetch with file:// for range-request support (seeking)
    return new Response(null, {
      status: 301,
      headers: { Location: `file://${filePath}` }
    })
  })
}
