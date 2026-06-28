/**
 * Python analysis sidecar lifecycle manager.
 * Spawns python/main.py (FastAPI on localhost:7432), polls for results,
 * saves them to the local SQLite DB, and broadcasts progress to the renderer.
 */

import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { upsertAnalysis } from './db/local'

const SIDECAR_PORT = 7432
const BASE_URL = `http://127.0.0.1:${SIDECAR_PORT}`

let sidecarProc: ChildProcess | null = null
let pollTimer: NodeJS.Timeout | null = null
let lastDoneCount = 0

// ── Script path ───────────────────────────────────────────────────────────────

function getScriptPath(): string {
  const devPath = join(__dirname, '../../python/main.py')
  if (existsSync(devPath)) return devPath
  if (process.resourcesPath) {
    const prodPath = join(process.resourcesPath, 'python/main.py')
    if (existsSync(prodPath)) return prodPath
  }
  throw new Error('python/main.py not found next to the project root')
}

// ── Sidecar lifecycle ─────────────────────────────────────────────────────────

export async function startSidecar(): Promise<void> {
  if (sidecarProc) return

  let scriptPath: string
  try {
    scriptPath = getScriptPath()
  } catch (e) {
    console.error('[Sidecar] Cannot start:', e)
    return
  }

  sidecarProc = spawn('python3', [scriptPath], {
    env: { ...process.env, SIDECAR_PORT: String(SIDECAR_PORT), ELECTRON_RUN_AS_NODE: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  sidecarProc.stdout?.on('data', (d: Buffer) =>
    console.log('[Sidecar]', d.toString().trimEnd()))
  sidecarProc.stderr?.on('data', (d: Buffer) =>
    console.error('[Sidecar ERR]', d.toString().trimEnd()))
  sidecarProc.on('exit', (code) => {
    console.log(`[Sidecar] exited (code ${code})`)
    sidecarProc = null
  })

  try {
    await waitReady(15_000)
    console.log('[Sidecar] Ready on port', SIDECAR_PORT)
  } catch (e) {
    console.error('[Sidecar] Did not become ready in time:', e)
  }
}

export function stopSidecar(): void {
  stopPoll()
  sidecarProc?.kill('SIGTERM')
  sidecarProc = null
}

async function waitReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1000) })
      if (r.ok) return
    } catch {
      // not ready yet
    }
    await sleep(400)
  }
  throw new Error('Sidecar timeout')
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

export async function getSidecarHealth(): Promise<SidecarHealth> {
  const r = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`Health check failed: ${r.status}`)
  return r.json()
}

export async function queueTracksForAnalysis(
  tracks: QueueTrackInput[]
): Promise<{ queued: number; total_pending: number }> {
  const body = {
    tracks: tracks.map((t) => ({
      rekordbox_id: t.rekordboxId,
      file_path: t.filePath,
      title: t.title,
      artist: t.artist,
    })),
  }
  const r = await fetch(`${BASE_URL}/queue/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`queue/add failed: ${r.status}`)
  const data = await r.json()
  startPoll()
  return data
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const r = await fetch(`${BASE_URL}/queue/status`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`queue/status failed: ${r.status}`)
  return r.json()
}

export async function clearQueue(): Promise<void> {
  await fetch(`${BASE_URL}/queue/clear`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(3000),
  })
  stopPoll()
  lastDoneCount = 0
}

// ── Polling ───────────────────────────────────────────────────────────────────

function startPoll(): void {
  if (pollTimer) return
  pollTimer = setInterval(pollResults, 2500)
}

function stopPoll(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollResults(): Promise<void> {
  try {
    const status = await getQueueStatus()
    const totalDone = status.done

    if (totalDone > lastDoneCount) {
      // Fetch all completed results and save new ones to SQLite
      const r = await fetch(`${BASE_URL}/queue/results`, { signal: AbortSignal.timeout(10_000) })
      if (!r.ok) return
      const results: SidecarResult[] = await r.json()

      let savedCount = 0
      for (const res of results) {
        if (res.status !== 'done') continue
        try {
          upsertAnalysis({
            rekordboxId:    res.rekordbox_id,
            filePath:       res.file_path,
            bpm:            res.bpm ?? null,
            energy:         res.energy ?? null,
            keyDetected:    res.key_detected ?? null,
            brightness:     res.brightness ?? null,
            percussiveness: res.percussiveness ?? null,
            warmth:         res.warmth ?? null,
            waveformPeaks:  res.waveform_peaks ?? null,
            genre:          res.genre ?? null,
            subGenre:       res.sub_genre ?? null,
            mood:           res.mood ?? null,
            danceability:   res.danceability ?? null,
            isHebrew:       !!res.is_hebrew,
            language:       res.language ?? null,
            analysisVersion: res.analysis_version ?? null,
            analyzedAt:     new Date().toISOString(),
          })
          savedCount++
        } catch (e) {
          console.error('[Sidecar] Save failed for', res.rekordbox_id, e)
        }
      }

      lastDoneCount = totalDone

      broadcast('analysis:progress', {
        done:        status.done,
        pending:     status.pending,
        processing:  status.processing,
        error:       status.error,
        total:       status.done + status.pending + status.processing + status.error,
        isProcessing: status.is_processing,
        newlySaved:  savedCount,
      } satisfies AnalysisProgress)
    }

    // Stop polling once idle
    if (!status.is_processing && status.pending === 0 && status.processing === 0) {
      stopPoll()
      lastDoneCount = 0
      broadcast('analysis:complete', {
        done:  status.done,
        error: status.error,
      })
    }
  } catch {
    // sidecar might be restarting — ignore
  }
}

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QueueTrackInput {
  rekordboxId: string
  filePath: string
  title: string
  artist: string
}

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

interface SidecarResult {
  rekordbox_id: string
  status: string
  file_path: string
  bpm?: number
  energy?: number
  key_detected?: string
  brightness?: number
  percussiveness?: number
  warmth?: number
  waveform_peaks?: number[]
  genre?: string
  sub_genre?: string
  mood?: string
  danceability?: number
  is_hebrew?: boolean
  language?: string
  analysis_version?: string
}
