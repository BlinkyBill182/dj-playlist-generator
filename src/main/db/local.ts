import Database from 'better-sqlite3-multiple-ciphers'
import { join } from 'path'
import { app } from 'electron'
import { mkdirSync } from 'fs'

let _db: Database.Database | null = null

export function getLocalDb(): Database.Database {
  if (_db) return _db

  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'dj-playlist-app.db')

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  runMigrations(_db)
  return _db
}

export function closeLocalDb(): void {
  _db?.close()
  _db = null
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)

  const currentVersion = (() => {
    const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined
    return row?.version ?? 0
  })()

  if (currentVersion < 1) {
    db.exec(`
      -- Full audio analysis per track
      CREATE TABLE IF NOT EXISTS track_analysis (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        rekordbox_id      TEXT UNIQUE NOT NULL,
        file_path         TEXT NOT NULL,
        title             TEXT,
        artist            TEXT,
        duration_ms       INTEGER,

        -- Librosa features
        bpm               REAL,
        energy            REAL,
        key_detected      TEXT,
        brightness        REAL,
        percussiveness    REAL,
        warmth            REAL,
        waveform_peaks    TEXT,         -- JSON array of normalized peak values

        -- Essentia ML features
        genre             TEXT,
        sub_genre         TEXT,
        mood              TEXT,
        danceability      REAL,

        -- Metadata
        is_hebrew         INTEGER DEFAULT 0,
        language          TEXT,
        analysis_version  TEXT,
        analyzed_at       DATETIME,

        -- User overrides
        user_override     TEXT,         -- JSON object
        user_genre        TEXT,
        user_mood         TEXT,

        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_track_analysis_rekordbox_id ON track_analysis(rekordbox_id);

      -- Generated playlists
      CREATE TABLE IF NOT EXISTS playlists (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        event_type      TEXT,
        event_style     TEXT,
        duration_min    INTEGER,
        energy_curve    TEXT,
        notes           TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Tracks inside a generated playlist
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id             INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        track_analysis_id       INTEGER NOT NULL REFERENCES track_analysis(id),
        position                INTEGER NOT NULL,
        phase                   TEXT,
        start_time_sec          INTEGER,
        end_time_sec            INTEGER,
        selected_alternative_id INTEGER REFERENCES track_alternatives(id)
      );

      -- AI-computed track alternatives (similar tracks)
      CREATE TABLE IF NOT EXISTS track_alternatives (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        source_track_id   INTEGER NOT NULL REFERENCES track_analysis(id),
        alt_track_id      INTEGER NOT NULL REFERENCES track_analysis(id),
        similarity_score  REAL,
        reason            TEXT,
        calculated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Analysis queue
      CREATE TABLE IF NOT EXISTS analysis_queue (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        rekordbox_id    TEXT UNIQUE NOT NULL,
        file_path       TEXT NOT NULL,
        status          TEXT DEFAULT 'pending',  -- pending | processing | done | error
        error_msg       TEXT,
        queued_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at      DATETIME,
        finished_at     DATETIME
      );

      INSERT INTO schema_version (version) VALUES (1);
    `)
  }
}

// ---- Track Analysis helpers ----

export interface LocalTrackAnalysis {
  id: number
  rekordboxId: string
  bpm: number | null
  energy: number | null
  keyDetected: string | null
  brightness: number | null
  percussiveness: number | null
  warmth: number | null
  waveformPeaks: number[] | null
  genre: string | null
  subGenre: string | null
  mood: string | null
  danceability: number | null
  isHebrew: boolean
  language: string | null
  analysisVersion: string | null
  analyzedAt: string | null
  userOverride: Record<string, unknown> | null
  userGenre: string | null
  userMood: string | null
}

export function getAllAnalysis(): LocalTrackAnalysis[] {
  const db = getLocalDb()
  const rows = db.prepare('SELECT * FROM track_analysis').all() as any[]
  return rows.map(mapAnalysisRow)
}

export function getAnalysisForTrack(rekordboxId: string): LocalTrackAnalysis | null {
  const db = getLocalDb()
  const row = db.prepare('SELECT * FROM track_analysis WHERE rekordbox_id = ?').get(rekordboxId) as any
  return row ? mapAnalysisRow(row) : null
}

export function upsertAnalysis(data: Partial<LocalTrackAnalysis> & { rekordboxId: string; filePath: string }): void {
  const db = getLocalDb()
  db.prepare(`
    INSERT INTO track_analysis (
      rekordbox_id, file_path, bpm, energy, key_detected, brightness,
      percussiveness, warmth, waveform_peaks, genre, sub_genre, mood,
      danceability, is_hebrew, language, analysis_version, analyzed_at,
      user_override, user_genre, user_mood, updated_at
    ) VALUES (
      @rekordboxId, @filePath, @bpm, @energy, @keyDetected, @brightness,
      @percussiveness, @warmth, @waveformPeaks, @genre, @subGenre, @mood,
      @danceability, @isHebrew, @language, @analysisVersion, @analyzedAt,
      @userOverride, @userGenre, @userMood, CURRENT_TIMESTAMP
    )
    ON CONFLICT(rekordbox_id) DO UPDATE SET
      bpm = excluded.bpm,
      energy = excluded.energy,
      key_detected = excluded.key_detected,
      brightness = excluded.brightness,
      percussiveness = excluded.percussiveness,
      warmth = excluded.warmth,
      waveform_peaks = excluded.waveform_peaks,
      genre = excluded.genre,
      sub_genre = excluded.sub_genre,
      mood = excluded.mood,
      danceability = excluded.danceability,
      is_hebrew = excluded.is_hebrew,
      language = excluded.language,
      analysis_version = excluded.analysis_version,
      analyzed_at = excluded.analyzed_at,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    rekordboxId: data.rekordboxId,
    filePath: data.filePath,
    bpm: data.bpm ?? null,
    energy: data.energy ?? null,
    keyDetected: data.keyDetected ?? null,
    brightness: data.brightness ?? null,
    percussiveness: data.percussiveness ?? null,
    warmth: data.warmth ?? null,
    waveformPeaks: data.waveformPeaks ? JSON.stringify(data.waveformPeaks) : null,
    genre: data.genre ?? null,
    subGenre: data.subGenre ?? null,
    mood: data.mood ?? null,
    danceability: data.danceability ?? null,
    isHebrew: data.isHebrew ? 1 : 0,
    language: data.language ?? null,
    analysisVersion: data.analysisVersion ?? null,
    analyzedAt: data.analyzedAt ?? new Date().toISOString(),
    userOverride: data.userOverride ? JSON.stringify(data.userOverride) : null,
    userGenre: data.userGenre ?? null,
    userMood: data.userMood ?? null,
  })
}

export function updateUserOverride(rekordboxId: string, override: Record<string, unknown>): void {
  const db = getLocalDb()
  db.prepare(`
    UPDATE track_analysis
    SET user_override = ?, updated_at = CURRENT_TIMESTAMP
    WHERE rekordbox_id = ?
  `).run(JSON.stringify(override), rekordboxId)
}

function mapAnalysisRow(r: any): LocalTrackAnalysis {
  return {
    id: r.id,
    rekordboxId: r.rekordbox_id,
    bpm: r.bpm ?? null,
    energy: r.energy ?? null,
    keyDetected: r.key_detected ?? null,
    brightness: r.brightness ?? null,
    percussiveness: r.percussiveness ?? null,
    warmth: r.warmth ?? null,
    waveformPeaks: r.waveform_peaks ? JSON.parse(r.waveform_peaks) : null,
    genre: r.genre ?? null,
    subGenre: r.sub_genre ?? null,
    mood: r.mood ?? null,
    danceability: r.danceability ?? null,
    isHebrew: !!r.is_hebrew,
    language: r.language ?? null,
    analysisVersion: r.analysis_version ?? null,
    analyzedAt: r.analyzed_at ?? null,
    userOverride: r.user_override ? JSON.parse(r.user_override) : null,
    userGenre: r.user_genre ?? null,
    userMood: r.user_mood ?? null,
  }
}
