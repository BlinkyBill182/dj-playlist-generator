import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync, spawn } from 'child_process'

// Possible DB locations across Rekordbox versions and Pioneer→AlphaTheta rebrand
// NOTE: Rekordbox 7+ stores master.db in ~/Library/Pioneer/ (not ~/Library/Application Support/)
const DB_SEARCH_PATHS = [
  join(homedir(), 'Library/Pioneer/rekordbox/master.db'),
  join(homedir(), 'Library/Application Support/AlphaTheta/rekordbox/master.db'),
  join(homedir(), 'Library/Application Support/Pioneer/rekordbox/master.db'),
  join(homedir(), 'Library/Application Support/Pioneer/rekordbox6/master.db'),
  join(homedir(), 'Library/Application Support/Pioneer/rekordbox5/master.db'),
]

export function findRekordboxDbPath(): string | null {
  for (const p of DB_SEARCH_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

export function isRekordboxRunning(): boolean {
  try {
    const output = execSync('pgrep -ix rekordbox', { encoding: 'utf8' })
    return output.trim().length > 0
  } catch {
    return false
  }
}

function getPythonScriptPath(): string {
  // Dev: out/main/index.js → ../../python/rekordbox_reader.py
  const devPath = join(__dirname, '../../python/rekordbox_reader.py')
  if (existsSync(devPath)) return devPath

  // Packaged: scripts live in process.resourcesPath
  if (process.resourcesPath) {
    const prodPath = join(process.resourcesPath, 'python/rekordbox_reader.py')
    if (existsSync(prodPath)) return prodPath
  }

  throw new Error(
    'rekordbox_reader.py not found. ' +
    'Ensure the python/ directory is present next to the project root.'
  )
}

function runPythonReader(command: string, extraArgs: string[] = []): Promise<any> {
  const scriptPath = getPythonScriptPath()

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, command, ...extraArgs], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
      timeout: 30_000,
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('error', (err) => {
      reject(new Error(`Python reader failed to start: ${err.message}`))
    })

    proc.on('close', (code) => {
      const raw = stdout.trim()
      if (!raw) {
        reject(new Error(
          `Python reader produced no output (exit ${code}).\n` +
          `stderr: ${stderr.slice(0, 500)}`
        ))
        return
      }
      let parsed: any
      try {
        parsed = JSON.parse(raw)
      } catch {
        reject(new Error(`Invalid JSON from Python reader:\n${raw.slice(0, 500)}`))
        return
      }
      if (parsed.error) {
        reject(new Error(`Rekordbox reader: ${parsed.error}`))
        return
      }
      resolve(parsed)
    })
  })
}

// ─── Public interfaces ──────────────────────────────────────────────────────

export interface RekordboxTrack {
  id: string
  title: string
  artist: string
  album: string | null
  genre: string | null
  bpm: number | null
  duration: number | null
  fileType: number | null
  folderPath: string | null
  fileName: string | null
  filePath: string | null
  colorId: string | null
  comment: string | null
  rating: number | null
  musicalKey: string | null
  myTagIds: string[]
}

export interface RekordboxPlaylist {
  id: string
  name: string
  parentId: string | null
  seq: number
  attribute: number | null
  trackCount: number
}

export interface RekordboxMyTag {
  id: string
  name: string
  parentId: string | null
}

export interface RekordboxConnectionStatus {
  connected: boolean
  dbPath: string | null
  trackCount: number
  error: string | null
  isRunning: boolean
}

// ─── Exported functions ─────────────────────────────────────────────────────

export async function getConnectionStatus(): Promise<RekordboxConnectionStatus> {
  const isRunning = isRekordboxRunning()
  try {
    const data = await runPythonReader('status')
    return {
      connected: true,
      dbPath: data.dbPath,
      trackCount: data.trackCount,
      error: null,
      isRunning,
    }
  } catch (err) {
    const dbPath = findRekordboxDbPath()
    return {
      connected: false,
      dbPath,
      trackCount: 0,
      error: String(err),
      isRunning,
    }
  }
}

export async function getAllTracks(): Promise<RekordboxTrack[]> {
  const data = await runPythonReader('tracks')
  return data.tracks as RekordboxTrack[]
}

export async function getMyTags(): Promise<RekordboxMyTag[]> {
  try {
    const data = await runPythonReader('tags')
    return data.tags as RekordboxMyTag[]
  } catch {
    return []
  }
}

export async function getPlaylists(): Promise<RekordboxPlaylist[]> {
  try {
    const data = await runPythonReader('playlists')
    return data.playlists as RekordboxPlaylist[]
  } catch {
    return []
  }
}
