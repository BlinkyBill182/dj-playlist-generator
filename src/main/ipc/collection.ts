import { ipcMain } from 'electron'
import {
  getAllTracks,
  getConnectionStatus,
  getMyTags,
  getPlaylists
} from '../db/rekordbox'
import { getAllAnalysis, getAnalysisForTrack, updateUserOverride } from '../db/local'

export function setupCollectionHandlers(): void {
  ipcMain.handle('rekordbox:status', async () => {
    try {
      return await getConnectionStatus()
    } catch (err) {
      return { connected: false, dbPath: null, trackCount: 0, error: String(err), isRunning: false }
    }
  })

  ipcMain.handle('rekordbox:getTracks', async () => {
    return await getAllTracks()
  })

  ipcMain.handle('rekordbox:getTags', async () => {
    return await getMyTags()
  })

  ipcMain.handle('rekordbox:getPlaylists', async () => {
    return await getPlaylists()
  })

  ipcMain.handle('analysis:getAll', async () => {
    return getAllAnalysis()
  })

  ipcMain.handle('analysis:getForTrack', async (_event, rekordboxId: string) => {
    return getAnalysisForTrack(rekordboxId)
  })

  ipcMain.handle('analysis:updateUserOverride', async (_event, rekordboxId: string, override: Record<string, unknown>) => {
    updateUserOverride(rekordboxId, override)
    return { success: true }
  })
}
