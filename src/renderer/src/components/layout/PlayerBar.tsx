import { useRef } from 'react'
import { usePlayerStore } from '../../store/player'
import { formatDuration } from '../../types'

export function PlayerBar() {
  const { currentTrack, isPlaying, progress, duration, volume, play, pause, resume, stop, seek, setVolume } =
    usePlayerStore()

  const progressBarRef = useRef<HTMLDivElement>(null)

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect) return
    const pos = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(1, pos)))
  }

  const currentSec = duration * progress
  const remainingSec = duration - currentSec

  if (!currentTrack) {
    return (
      <div className="h-16 bg-surface-1 border-t border-border flex items-center justify-center">
        <span className="text-xs text-gray-600">No track playing — click a track to preview</span>
      </div>
    )
  }

  return (
    <div className="h-16 bg-surface-1 border-t border-border flex items-center gap-4 px-4 flex-shrink-0">
      {/* Track info */}
      <div className="flex items-center gap-3 w-64 min-w-0">
        <div
          className={`w-9 h-9 rounded-full bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center flex-shrink-0 ${
            isPlaying ? 'vinyl-spin' : ''
          }`}
        >
          <span className="text-base">♪</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
          <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center flex-1 gap-1">
        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={stop}
            className="text-gray-500 hover:text-white transition-colors text-sm"
            title="Stop"
          >
            ⏹
          </button>
          <button
            onClick={isPlaying ? pause : resume}
            className="w-8 h-8 rounded-full bg-accent-purple hover:bg-purple-600 flex items-center justify-center transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <span className="text-xs text-gray-500 font-mono w-10 text-right">
            {formatDuration(Math.floor(currentSec))}
          </span>
          <div
            ref={progressBarRef}
            className="flex-1 h-1.5 bg-surface-3 rounded-full cursor-pointer group relative"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-accent-purple rounded-full relative group-hover:bg-purple-400 transition-colors"
              style={{ width: `${progress * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-gray-500 font-mono w-10">
            -{formatDuration(Math.floor(remainingSec))}
          </span>
        </div>
      </div>

      {/* Right side: BPM + Volume */}
      <div className="flex items-center gap-4 w-48 justify-end">
        {/* BPM badge */}
        {currentTrack.bpm && (
          <div className="text-center">
            <div className="text-xs font-mono text-accent-purple-light font-semibold">
              {currentTrack.bpm.toFixed(1)}
            </div>
            <div className="text-xs text-gray-600">BPM</div>
          </div>
        )}

        {/* Volume */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">
            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 accent-purple-500 cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}
