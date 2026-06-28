# DJ Playlist Generator

An AI-powered desktop app for DJs that reads your **Rekordbox** library, analyzes tracks locally, and (planned) generates dynamic event playlists with smart alternatives and a visual timeline.

Built as a **macOS Electron** app with a **React** UI and a **Python** audio-analysis sidecar. All data stays on your machine — no cloud required for collection browsing or analysis.

---

## Features

### Implemented (v0.1.0)

| Feature | Description |
|---------|-------------|
| **Rekordbox integration** | Reads `master.db` from Rekordbox 6/7 via `pyrekordbox` (handles encrypted DB) |
| **Collection view** | Virtualized track list with sort, filter, search, energy bars, and analysis status |
| **Audio preview** | Local playback via Howler.js (starts ~30% into the track for quick preview) |
| **Track detail panel** | BPM, key, Camelot code, energy, mood, genre, and AI analysis metrics |
| **Batch analysis** | Queue unanalyzed tracks through a Python sidecar with live progress bar |
| **Local SQLite cache** | Analysis results persisted in a separate app database (survives restarts) |
| **Hebrew detection** | Flags tracks with Hebrew characters in title/artist |

### Planned

| Feature | Phase |
|---------|-------|
| Track metadata edit modal | 2 |
| Playlist generator (event type, duration, energy curve) | 3 |
| Phase-based algorithm + harmonic mixing (Camelot wheel) | 3 |
| Timeline view with track blocks | 3–4 |
| WaveSurfer.js waveforms per track | 4 |
| Claude API smart alternatives | 4 |
| Export to Rekordbox XML | 5 |
| Drag & reorder in timeline | 5 |
| macOS `.dmg` packaging | 5 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process                                     │
│  ├── IPC handlers (collection, audio, sidecar)              │
│  ├── Local SQLite (track_analysis, playlists, queue)        │
│  └── Sidecar lifecycle (spawn, poll, save results)          │
├─────────────────────────────────────────────────────────────┤
│  Preload (contextBridge)  →  window.api                     │
├─────────────────────────────────────────────────────────────┤
│  React Renderer (Zustand state)                            │
│  ├── CollectionView, FilterBar, TrackDetailPanel            │
│  ├── PlayerBar (Howler.js)                                  │
│  └── Sidebar / TopBar                                       │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ python3 rekordbox_reader.py  │ HTTP localhost:7432
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│  pyrekordbox         │    │  Python FastAPI Sidecar       │
│  (Rekordbox DB read) │    │  Librosa + optional Essentia  │
└──────────────────────┘    └──────────────────────────────┘
         │
         ▼
~/Library/Pioneer/rekordbox/master.db
(or other Rekordbox paths — see below)
```

### Why Electron + Python?

- **Direct filesystem access** — read Rekordbox DB and local audio files without a backend server
- **Encrypted Rekordbox DB** — `pyrekordbox` handles Rekordbox 6/7 encryption; raw `better-sqlite3` cannot open it directly
- **Heavy audio ML** — Librosa/Essentia run in a separate Python process so the UI stays responsive
- **Familiar stack** — React + TypeScript for the UI; Python for audio science libraries

---

## Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| Desktop shell | Electron 42 | Filesystem, IPC, window management |
| UI | React 18 + TypeScript + Tailwind CSS | Renderer |
| State | Zustand | Collection, player, filters |
| Rekordbox reader | pyrekordbox (Python) | Encrypted `master.db` access |
| App database | better-sqlite3-multiple-ciphers | Analysis cache + playlists |
| Audio analysis | Python + Librosa (+ Essentia optional) | BPM, energy, key, mood, genre |
| Analysis server | FastAPI on `localhost:7432` | REST API for batch queue |
| Audio playback | Howler.js | Local file preview |
| Waveform viz | WaveSurfer.js | Planned — dependency installed |
| AI alternatives | Claude API | Planned |
| Packaging | electron-builder | macOS `.dmg` / `.zip` |

---

## Requirements

- **macOS** (primary target; Rekordbox paths are macOS-specific)
- **Node.js** 18+ and npm
- **Python** 3.10+
- **Rekordbox 6 or 7** with an existing library

---

## Getting Started

### 1. Clone and install Node dependencies

```bash
git clone <repo-url>
cd dj-playlist-generator
npm install
```

The `postinstall` script rebuilds `better-sqlite3-multiple-ciphers` for Electron.

### 2. Install Python dependencies

```bash
pip3 install -r python/requirements.txt
pip3 install pyrekordbox
```

**Optional — Essentia** (genre/mood/danceability ML models):

```bash
# Apple Silicon — often easiest via conda:
conda install -c conda-forge essentia
```

Without Essentia, analysis still works using Librosa heuristics for mood and danceability.

### 3. Run in development

```bash
npm run dev
```

This starts electron-vite (hot reload) and automatically spawns the Python sidecar on port **7432**.

### 4. Build for production

```bash
npm run build      # Compile main, preload, renderer → out/
npm run preview    # Run compiled app locally
npm run package    # Build macOS .dmg (requires icon at resources/icon.icns)
```

---

## Rekordbox Database

The app searches for `master.db` in these locations (first match wins):

```
~/Library/Pioneer/rekordbox/master.db
~/Library/Application Support/AlphaTheta/rekordbox/master.db
~/Library/Application Support/Pioneer/rekordbox/master.db
~/Library/Application Support/Pioneer/rekordbox6/master.db
```

> **Note:** Rekordbox 7+ often stores the DB under `~/Library/Pioneer/` rather than `Application Support/`.

If Rekordbox is running, the app reads in read-only mode via `pyrekordbox`. A warning appears in the sidebar when Rekordbox is open.

---

## Audio Analysis

Click **Analyze N** in the Collection top bar to queue all unanalyzed tracks.

The sidecar analyzes the **first 60 seconds** at 22,050 Hz (~5–8 s per track on Apple Silicon):

| Metric | Source |
|--------|--------|
| BPM | Librosa beat tracking |
| Energy | RMS normalized 0–1 |
| Key | Chroma + Krumhansl-Schmuckler profiles |
| Brightness | Spectral centroid |
| Percussiveness | Zero-crossing rate |
| Warmth | Low-frequency mel ratio |
| Waveform peaks | 200-point downsample for future viz |
| Genre / Mood / Danceability | Essentia (optional) or heuristics |
| Hebrew flag | Unicode range in title/artist |

Results are saved to the local app DB at:

```
~/Library/Application Support/dj-playlist-generator/dj-playlist-app.db
```

### Sidecar API (localhost:7432)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Sidecar status, librosa/essentia availability |
| `/analyze` | POST | Single-track synchronous analysis |
| `/queue/add` | POST | Batch queue `{ tracks: [...] }` |
| `/queue/status` | GET | Pending / processing / done / error counts |
| `/queue/results` | GET | Completed analysis results |
| `/queue/clear` | DELETE | Clear pending queue items |

---

## Project Structure

```
dj-playlist-generator/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, protocol, sidecar startup
│   │   ├── sidecar.ts           # Python sidecar lifecycle + result polling
│   │   ├── db/
│   │   │   ├── local.ts         # App SQLite schema + migrations
│   │   │   └── rekordbox.ts     # Rekordbox connection (spawns Python reader)
│   │   └── ipc/                 # IPC handlers (collection, audio, sidecar)
│   ├── preload/
│   │   └── index.ts             # contextBridge → window.api
│   └── renderer/src/
│       ├── App.tsx              # Shell + view routing
│       ├── store/               # Zustand (collection, player)
│       ├── components/
│       │   ├── collection/      # CollectionView, TrackRow, FilterBar, …
│       │   └── layout/          # Sidebar, TopBar, PlayerBar
│       └── types/               # Shared TypeScript types + Camelot maps
├── python/
│   ├── main.py                  # FastAPI sidecar
│   ├── analyzer.py              # Librosa/Essentia pipeline
│   ├── rekordbox_reader.py      # pyrekordbox CLI (JSON stdout)
│   └── requirements.txt
├── electron-vite.config.ts
└── package.json
```

---

## Playlist Generator (Planned)

The generator will take event parameters and build a phase-based set:

**Event types:** `wedding` · `club_night` · `corporate` · `birthday` · `festival`

**Styles:** `electronic` · `pop` · `mizrahi` · `international` · `mixed`

**Energy curves:** `linear_peak` · `plateau` · `gradual_build` · `wave`

### Event phases

| Phase | % of event | BPM target | Energy |
|-------|-------------|------------|--------|
| Cocktail | 0–15% | 90–110 | 0.2–0.4 |
| Warmup | 15–30% | 110–120 | 0.4–0.55 |
| Buildup | 30–55% | 120–126 | 0.55–0.75 |
| Peak | 55–80% | 126–135 | 0.75–1.0 |
| Winddown | 80–100% | 105–115 | 0.4–0.6 |

Track selection will filter by BPM/energy/style, sort for BPM progression and Camelot harmonic compatibility, and fill each phase to its target duration without repeats.

---

## Development Roadmap

### Phase 1 — Foundation
- [x] Electron scaffold (React + TypeScript + Tailwind)
- [x] Rekordbox `master.db` reader (pyrekordbox)
- [x] Collection view with sorting and filtering
- [x] Audio preview (Howler.js)
- [x] Local app DB schema + migrations

### Phase 2 — Analysis Engine
- [x] Python FastAPI sidecar
- [x] Librosa pipeline (BPM, energy, key, brightness, warmth)
- [x] Essentia integration (optional)
- [x] Analysis queue with progress UI
- [x] Analysis caching
- [ ] Track edit modal (user overrides)

### Phase 3 — Playlist Generator
- [ ] New Playlist screen + event config
- [ ] Phase-based selection algorithm
- [ ] Harmonic compatibility (Camelot wheel)
- [ ] Timeline view (track blocks)
- [ ] Energy curve visualization

### Phase 4 — AI + Full Timeline
- [ ] WaveSurfer per track block
- [ ] Claude API alternatives
- [ ] Alternatives dropdown + similarity caching
- [ ] Hebrew/RTL polish

### Phase 5 — Polish + Export
- [ ] Export to Rekordbox XML
- [ ] Drag & reorder in timeline
- [ ] Dark theme refinements
- [ ] electron-builder + PyInstaller packaging
- [ ] Future connectors abstraction (Spotify, SoundCloud, …)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIDECAR_PORT` | `7432` | Python analysis server port |

For Claude API integration (planned), an `ANTHROPIC_API_KEY` will be required.

---

## License

MIT
