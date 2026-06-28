import { create } from 'zustand'
import type {
  Track,
  RekordboxTrack,
  TrackAnalysis,
  CollectionFilters,
  SortField,
  SortDirection,
  ConnectionStatus,
  MyTag,
  AnalysisProgress,
} from '../types'

interface CollectionState {
  // Data
  tracks: Track[]
  analysisMap: Map<string, TrackAnalysis>
  tags: MyTag[]
  connectionStatus: ConnectionStatus | null

  // Loading
  isLoadingTracks: boolean
  isLoadingAnalysis: boolean
  loadError: string | null

  // Analysis queue progress
  analysisProgress: AnalysisProgress | null
  isAnalyzing: boolean

  // Filters & sort
  filters: CollectionFilters
  sortField: SortField
  sortDirection: SortDirection

  // Selected track (for detail panel / player)
  selectedTrackId: string | null

  // Actions
  loadCollection: () => Promise<void>
  loadAnalysis: () => Promise<void>
  checkConnection: () => Promise<void>
  setFilters: (filters: Partial<CollectionFilters>) => void
  setSort: (field: SortField, direction?: SortDirection) => void
  selectTrack: (id: string | null) => void
  getFilteredTracks: () => Track[]
  analyzeAll: () => Promise<void>
  stopAnalysis: () => Promise<void>
  handleAnalysisProgress: (progress: AnalysisProgress) => void
  handleAnalysisComplete: () => void
}

const defaultFilters: CollectionFilters = {
  search: '',
  genre: '',
  mood: '',
  minBpm: null,
  maxBpm: null,
  analysisStatus: 'all',
  minEnergy: null,
  maxEnergy: null,
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  analysisMap: new Map(),
  tags: [],
  connectionStatus: null,

  isLoadingTracks: false,
  isLoadingAnalysis: false,
  loadError: null,

  analysisProgress: null,
  isAnalyzing: false,

  filters: defaultFilters,
  sortField: 'artist',
  sortDirection: 'asc',
  selectedTrackId: null,

  checkConnection: async () => {
    try {
      const status = await window.api.rekordbox.status()
      set({ connectionStatus: status })
    } catch (err) {
      set({
        connectionStatus: {
          connected: false,
          dbPath: null,
          trackCount: 0,
          error: String(err),
          isRunning: false,
        }
      })
    }
  },

  loadCollection: async () => {
    set({ isLoadingTracks: true, loadError: null })
    try {
      const [rawTracks, analysisList, tags] = await Promise.all([
        window.api.rekordbox.getTracks(),
        window.api.analysis.getAll(),
        window.api.rekordbox.getTags(),
      ])

      const analysisMap = new Map<string, TrackAnalysis>()
      for (const a of analysisList) {
        analysisMap.set(a.rekordboxId, a)
      }

      const tracks: Track[] = rawTracks.map((rt: RekordboxTrack) => ({
        ...rt,
        analysis: analysisMap.get(rt.id) ?? null,
        analysisStatus: analysisMap.has(rt.id) ? 'analyzed' : 'none',
      }))

      set({ tracks, analysisMap, tags, isLoadingTracks: false })
    } catch (err) {
      set({ loadError: String(err), isLoadingTracks: false })
    }
  },

  loadAnalysis: async () => {
    set({ isLoadingAnalysis: true })
    try {
      const analysisList = await window.api.analysis.getAll()
      const analysisMap = new Map<string, TrackAnalysis>()
      for (const a of analysisList) {
        analysisMap.set(a.rekordboxId, a)
      }

      // Update tracks — preserve 'analyzing' status for tracks still in queue
      const updatedTracks = get().tracks.map((t) => {
        if (analysisMap.has(t.id)) {
          return { ...t, analysis: analysisMap.get(t.id)!, analysisStatus: 'analyzed' as const }
        }
        // keep 'analyzing' if it was set, otherwise 'none'
        const keep = t.analysisStatus === 'analyzing' ? 'analyzing' as const : 'none' as const
        return { ...t, analysis: null, analysisStatus: keep }
      })

      set({ tracks: updatedTracks, analysisMap, isLoadingAnalysis: false })
    } catch (err) {
      set({ isLoadingAnalysis: false })
    }
  },

  setFilters: (partial) => {
    set((state) => ({ filters: { ...state.filters, ...partial } }))
  },

  setSort: (field, direction) => {
    set((state) => ({
      sortField: field,
      sortDirection: direction ?? (state.sortField === field && state.sortDirection === 'asc' ? 'desc' : 'asc'),
    }))
  },

  selectTrack: (id) => set({ selectedTrackId: id }),

  analyzeAll: async () => {
    const { tracks, analysisMap } = get()
    const unanalyzed = tracks.filter(
      (t) => !analysisMap.has(t.id) && t.filePath
    )
    if (unanalyzed.length === 0) return

    // Optimistically mark all queued tracks as 'analyzing'
    const unanalyzedIds = new Set(unanalyzed.map((t) => t.id))
    set({
      isAnalyzing: true,
      tracks: tracks.map((t) =>
        unanalyzedIds.has(t.id) ? { ...t, analysisStatus: 'analyzing' as const } : t
      ),
    })

    try {
      await window.api.sidecar.queue(
        unanalyzed.map((t) => ({
          rekordboxId: t.id,
          filePath: t.filePath!,
          title: t.title,
          artist: t.artist,
        }))
      )
    } catch (err) {
      console.error('Failed to queue tracks:', err)
      set({
        isAnalyzing: false,
        tracks: tracks.map((t) =>
          unanalyzedIds.has(t.id) ? { ...t, analysisStatus: 'none' as const } : t
        ),
      })
    }
  },

  stopAnalysis: async () => {
    await window.api.sidecar.clearQueue()
    set({ isAnalyzing: false, analysisProgress: null })
  },

  handleAnalysisProgress: (progress) => {
    set({ analysisProgress: progress, isAnalyzing: progress.isProcessing || progress.pending > 0 })
    // Refresh analysis from SQLite when new results arrive
    if (progress.newlySaved > 0) {
      get().loadAnalysis()
    }
  },

  handleAnalysisComplete: () => {
    set({ isAnalyzing: false })
    get().loadAnalysis()
  },

  getFilteredTracks: () => {
    const { tracks, filters, sortField, sortDirection } = get()
    let result = tracks

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album ?? '').toLowerCase().includes(q)
      )
    }

    // Genre
    if (filters.genre) {
      result = result.filter(
        (t) =>
          (t.genre ?? '').toLowerCase().includes(filters.genre.toLowerCase()) ||
          (t.analysis?.genre ?? '').toLowerCase().includes(filters.genre.toLowerCase())
      )
    }

    // Mood
    if (filters.mood) {
      result = result.filter(
        (t) => (t.analysis?.mood ?? '').toLowerCase().includes(filters.mood.toLowerCase())
      )
    }

    // BPM range
    if (filters.minBpm != null) {
      result = result.filter((t) => (t.bpm ?? 0) >= filters.minBpm!)
    }
    if (filters.maxBpm != null) {
      result = result.filter((t) => (t.bpm ?? 999) <= filters.maxBpm!)
    }

    // Energy range
    if (filters.minEnergy != null) {
      result = result.filter((t) => (t.analysis?.energy ?? 0) >= filters.minEnergy!)
    }
    if (filters.maxEnergy != null) {
      result = result.filter((t) => (t.analysis?.energy ?? 1) <= filters.maxEnergy!)
    }

    // Analysis status
    if (filters.analysisStatus !== 'all') {
      result = result.filter((t) => t.analysisStatus === filters.analysisStatus)
    }

    // Sort
    result = [...result].sort((a, b) => {
      let valA: string | number | null
      let valB: string | number | null

      switch (sortField) {
        case 'title':  valA = a.title;  valB = b.title;  break
        case 'artist': valA = a.artist; valB = b.artist; break
        case 'bpm':    valA = a.bpm;    valB = b.bpm;    break
        case 'genre':  valA = a.genre;  valB = b.genre;  break
        case 'duration': valA = a.duration; valB = b.duration; break
        case 'energy': valA = a.analysis?.energy ?? null; valB = b.analysis?.energy ?? null; break
        case 'mood':   valA = a.analysis?.mood ?? null;   valB = b.analysis?.mood ?? null;   break
        default:       valA = a.artist; valB = b.artist;
      }

      if (valA == null && valB == null) return 0
      if (valA == null) return 1
      if (valB == null) return -1

      const cmp = typeof valA === 'string'
        ? valA.localeCompare(valB as string, undefined, { sensitivity: 'base' })
        : (valA as number) - (valB as number)

      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  },
}))
