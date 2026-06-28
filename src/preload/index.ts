import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { QueueTrackInput } from '../main/sidecar'

// Typed API exposed to the renderer process via window.api
export interface ElectronAPI {
  rekordbox: {
    status: () => Promise<import('../main/db/rekordbox').RekordboxConnectionStatus>
    getTracks: () => Promise<import('../main/db/rekordbox').RekordboxTrack[]>
    getTags: () => Promise<import('../main/db/rekordbox').RekordboxMyTag[]>
    getPlaylists: () => Promise<import('../main/db/rekordbox').RekordboxPlaylist[]>
  }
  analysis: {
    getAll: () => Promise<import('../main/db/local').LocalTrackAnalysis[]>
    getForTrack: (rekordboxId: string) => Promise<import('../main/db/local').LocalTrackAnalysis | null>
    updateUserOverride: (rekordboxId: string, override: Record<string, unknown>) => Promise<{ success: boolean }>
  }
  sidecar: {
    health: () => Promise<any>
    queue: (tracks: QueueTrackInput[]) => Promise<{ queued: number; total_pending: number }>
    queueStatus: () => Promise<any>
    clearQueue: () => Promise<{ ok: boolean }>
  }
  audio: {
    resolvePath: (filePath: string) => Promise<{ exists: boolean; path: string | null }>
    fileExists: (filePath: string) => Promise<boolean>
  }
}

const api: ElectronAPI = {
  rekordbox: {
    status: () => ipcRenderer.invoke('rekordbox:status'),
    getTracks: () => ipcRenderer.invoke('rekordbox:getTracks'),
    getTags: () => ipcRenderer.invoke('rekordbox:getTags'),
    getPlaylists: () => ipcRenderer.invoke('rekordbox:getPlaylists'),
  },
  analysis: {
    getAll: () => ipcRenderer.invoke('analysis:getAll'),
    getForTrack: (id) => ipcRenderer.invoke('analysis:getForTrack', id),
    updateUserOverride: (id, override) => ipcRenderer.invoke('analysis:updateUserOverride', id, override),
  },
  sidecar: {
    health: () => ipcRenderer.invoke('sidecar:health'),
    queue: (tracks) => ipcRenderer.invoke('sidecar:queue', tracks),
    queueStatus: () => ipcRenderer.invoke('sidecar:queueStatus'),
    clearQueue: () => ipcRenderer.invoke('sidecar:clearQueue'),
  },
  audio: {
    resolvePath: (filePath) => ipcRenderer.invoke('audio:resolvePath', filePath),
    fileExists: (filePath) => ipcRenderer.invoke('audio:fileExists', filePath),
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (for non-isolated contexts in tests)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
