/// <reference types="vite/client" />

interface Window {
  api: {
    rekordbox: {
      status: () => Promise<{
        connected: boolean
        dbPath: string | null
        trackCount: number
        error: string | null
        isRunning: boolean
      }>
      getTracks: () => Promise<import('./types').RekordboxTrack[]>
      getTags: () => Promise<import('./types').MyTag[]>
      getPlaylists: () => Promise<import('./types').RBPlaylist[]>
    }
    analysis: {
      getAll: () => Promise<import('./types').TrackAnalysis[]>
      getForTrack: (rekordboxId: string) => Promise<import('./types').TrackAnalysis | null>
      updateUserOverride: (rekordboxId: string, override: Record<string, unknown>) => Promise<{ success: boolean }>
    }
    audio: {
      resolvePath: (filePath: string) => Promise<{ exists: boolean; path: string | null }>
      fileExists: (filePath: string) => Promise<boolean>
    }
  }
}
