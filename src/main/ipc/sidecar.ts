import { ipcMain } from 'electron'
import {
  startSidecar,
  getSidecarHealth,
  queueTracksForAnalysis,
  getQueueStatus,
  clearQueue,
  type QueueTrackInput,
} from '../sidecar'

export function setupSidecarHandlers(): void {
  // Check if sidecar is alive + get library stats
  ipcMain.handle('sidecar:health', async () => {
    try {
      return await getSidecarHealth()
    } catch {
      return null
    }
  })

  // Queue a batch of tracks for analysis
  // payload: { tracks: Array<{ rekordboxId, filePath, title, artist }> }
  ipcMain.handle('sidecar:queue', async (_event, tracks: QueueTrackInput[]) => {
    // Ensure sidecar is running first
    await startSidecar()
    return await queueTracksForAnalysis(tracks)
  })

  // Get current queue progress
  ipcMain.handle('sidecar:queueStatus', async () => {
    try {
      return await getQueueStatus()
    } catch {
      return null
    }
  })

  // Cancel pending items (doesn't kill in-progress)
  ipcMain.handle('sidecar:clearQueue', async () => {
    await clearQueue()
    return { ok: true }
  })
}
