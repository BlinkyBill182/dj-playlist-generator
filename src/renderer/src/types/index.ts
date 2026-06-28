// ---- Rekordbox raw track (from main DB) ----
export interface RekordboxTrack {
  id: string
  title: string
  artist: string
  album: string | null
  genre: string | null
  bpm: number | null
  duration: number | null   // seconds
  fileType: number | null   // 1=mp3, 5=aiff, etc.
  folderPath: string | null
  fileName: string | null
  filePath: string | null
  colorId: string | null    // stored as string in DB ("0"–"8")
  comment: string | null
  rating: number | null
  musicalKey: string | null // e.g. "Bbm", "F#"
  myTagIds: string[]
}

// ---- Local analysis data (from our DB) ----
export interface TrackAnalysis {
  id: number
  rekordboxId: string
  bpm: number | null
  energy: number | null        // 0.0–1.0
  keyDetected: string | null   // e.g. "A minor"
  brightness: number | null    // 0.0–1.0
  percussiveness: number | null
  warmth: number | null
  waveformPeaks: number[] | null
  genre: string | null
  subGenre: string | null
  mood: string | null
  danceability: number | null  // 0.0–1.0
  isHebrew: boolean
  language: string | null
  analysisVersion: string | null
  analyzedAt: string | null
  userOverride: Record<string, unknown> | null
  userGenre: string | null
  userMood: string | null
}

// ---- Merged track (used in UI) ----
export type AnalysisStatus = 'none' | 'analyzing' | 'analyzed' | 'error'

export interface Track extends RekordboxTrack {
  analysis: TrackAnalysis | null
  analysisStatus: AnalysisStatus
}

// ---- Rekordbox tag ----
export interface MyTag {
  id: string
  name: string
  parentId: string | null
}

// ---- Rekordbox playlist ----
export interface RBPlaylist {
  id: string
  name: string
  parentId: string | null
  seq: number
  trackCount: number
}

// ---- Rekordbox connection status ----
export interface ConnectionStatus {
  connected: boolean
  dbPath: string | null
  trackCount: number
  error: string | null
  isRunning: boolean
}

// ---- Analysis sidecar ----
export interface SidecarHealth {
  status: string
  librosa: boolean
  essentia: boolean
  queue_length: number
  done: number
  errors: number
  is_processing: boolean
}

export interface QueueStatus {
  queue_length: number
  is_processing: boolean
  pending: number
  processing: number
  done: number
  error: number
}

export interface AnalysisProgress {
  done: number
  pending: number
  processing: number
  error: number
  total: number
  isProcessing: boolean
  newlySaved: number
}

export interface QueueTrackInput {
  rekordboxId: string
  filePath: string
  title: string
  artist: string
}

// ---- Sort / Filter ----
export type SortField = 'title' | 'artist' | 'bpm' | 'energy' | 'genre' | 'duration' | 'mood'
export type SortDirection = 'asc' | 'desc'

export interface CollectionFilters {
  search: string
  genre: string
  mood: string
  minBpm: number | null
  maxBpm: number | null
  analysisStatus: AnalysisStatus | 'all'
  minEnergy: number | null
  maxEnergy: number | null
}

// ---- Event Phases (Playlist Generator) ----
export type EventPhase = 'cocktail' | 'warmup' | 'buildup' | 'peak' | 'winddown'
export type EventType = 'wedding' | 'club_night' | 'corporate' | 'birthday' | 'festival'
export type EventStyle = 'electronic' | 'pop' | 'mizrahi' | 'international' | 'mixed'
export type EnergyCurve = 'linear_peak' | 'plateau' | 'gradual_build' | 'wave'

// ---- Color IDs used in Rekordbox (colorId is stored as string) ----
export const REKORDBOX_COLORS: Record<string, string> = {
  '0': 'none',
  '1': 'pink',
  '2': 'red',
  '3': 'orange',
  '4': 'yellow',
  '5': 'green',
  '6': 'aqua',
  '7': 'blue',
  '8': 'purple',
}

// ---- Key → Camelot Wheel mapping (long-form, from audio analysis output) ----
export const KEY_TO_CAMELOT: Record<string, string> = {
  'C major': '8B', 'A minor': '8A',
  'G major': '9B', 'E minor': '9A',
  'D major': '10B', 'B minor': '10A',
  'A major': '11B', 'F# minor': '11A',
  'E major': '12B', 'C# minor': '12A',
  'B major': '1B', 'G# minor': '1A',
  'F# major': '2B', 'D# minor': '2A',
  'C# major': '3B', 'A# minor': '3A',
  'G# major': '4B', 'F minor': '4A',
  'D# major': '5B', 'C minor': '5A',
  'A# major': '6B', 'G minor': '6A',
  'F major': '7B', 'D minor': '7A',
}

// ---- Rekordbox short-notation key → Camelot (e.g. "Bbm" → "3A") ----
export const REKORDBOX_KEY_TO_CAMELOT: Record<string, string> = {
  // Major
  'C': '8B',  'Db': '3B', 'C#': '3B', 'D': '10B', 'Eb': '5B', 'D#': '5B',
  'E': '12B', 'F': '7B',  'F#': '2B', 'Gb': '2B', 'G': '9B',  'Ab': '4B',
  'G#': '4B', 'A': '11B', 'Bb': '6B', 'A#': '6B', 'B': '1B',
  // Minor (Rekordbox appends 'm')
  'Cm': '5A',  'Dbm': '12A', 'C#m': '12A', 'Dm': '7A',  'Ebm': '2A', 'D#m': '2A',
  'Em': '9A',  'Fm': '4A',   'F#m': '11A', 'Gbm': '11A', 'Gm': '6A',  'Abm': '1A',
  'G#m': '1A', 'Am': '8A',   'Bbm': '3A',  'A#m': '3A',  'Bm': '10A',
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function energyToColor(energy: number | null): string {
  if (energy == null) return 'text-gray-500'
  if (energy >= 0.8) return 'text-energy-peak'
  if (energy >= 0.6) return 'text-energy-high'
  if (energy >= 0.35) return 'text-energy-mid'
  return 'text-energy-low'
}
