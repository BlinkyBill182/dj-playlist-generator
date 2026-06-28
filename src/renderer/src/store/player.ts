import { create } from 'zustand'
import { Howl } from 'howler'
import type { Track } from '../types'

interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  progress: number       // 0–1
  duration: number       // seconds
  volume: number         // 0–1
  _howl: Howl | null

  // Actions
  play: (track: Track) => void
  pause: () => void
  resume: () => void
  stop: () => void
  seek: (position: number) => void  // 0–1
  setVolume: (vol: number) => void
  setProgress: (progress: number, duration: number) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  _howl: null,

  play: (track: Track) => {
    const { _howl, currentTrack } = get()

    // Destroy previous howl if different track
    if (_howl) {
      _howl.stop()
      _howl.unload()
    }

    if (!track.filePath) {
      console.warn('No file path for track:', track.title)
      return
    }

    const filePath = track.filePath.startsWith('/')
      ? `file://${track.filePath}`
      : track.filePath

    const howl = new Howl({
      src: [filePath],
      html5: true,  // Required for large files and seeking
      volume: get().volume,
      onplay: () => {
        set({ isPlaying: true })
        const tick = () => {
          const h = get()._howl
          if (!h || !h.playing()) return
          const seek = h.seek() as number
          const dur = h.duration() as number
          set({ progress: dur > 0 ? seek / dur : 0, duration: dur })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      onpause: () => set({ isPlaying: false }),
      onstop: () => set({ isPlaying: false, progress: 0 }),
      onend: () => set({ isPlaying: false, progress: 0 }),
      onloaderror: (id, err) => {
        console.error('Howler load error:', err)
        set({ isPlaying: false })
      },
    })

    // Start from midpoint for preview (like Rekordbox)
    const trackDuration = track.duration ?? 0
    const previewStart = trackDuration > 60 ? trackDuration * 0.3 : 0

    howl.once('load', () => {
      if (previewStart > 0) howl.seek(previewStart)
      howl.play()
    })

    set({ currentTrack: track, _howl: howl, progress: 0, duration: trackDuration })
  },

  pause: () => {
    get()._howl?.pause()
    set({ isPlaying: false })
  },

  resume: () => {
    const { _howl, currentTrack } = get()
    if (_howl) {
      _howl.play()
    } else if (currentTrack) {
      get().play(currentTrack)
    }
  },

  stop: () => {
    const { _howl } = get()
    if (_howl) {
      _howl.stop()
      _howl.unload()
    }
    set({ currentTrack: null, isPlaying: false, progress: 0, duration: 0, _howl: null })
  },

  seek: (position: number) => {
    const { _howl } = get()
    if (_howl) {
      const dur = _howl.duration() as number
      _howl.seek(dur * position)
      set({ progress: position })
    }
  },

  setVolume: (vol: number) => {
    get()._howl?.volume(vol)
    set({ volume: vol })
  },

  setProgress: (progress: number, duration: number) => {
    set({ progress, duration })
  },
}))
