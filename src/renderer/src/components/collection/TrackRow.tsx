import { memo } from 'react'
import type { Track, SortField } from '../../types'
import { formatDuration, energyToColor, KEY_TO_CAMELOT, REKORDBOX_KEY_TO_CAMELOT } from '../../types'
import { usePlayerStore } from '../../store/player'
import { useCollectionStore } from '../../store/collection'

const COLOR_DOTS: Record<string, string> = {
  '1': 'bg-pink-400',
  '2': 'bg-red-400',
  '3': 'bg-orange-400',
  '4': 'bg-yellow-400',
  '5': 'bg-green-400',
  '6': 'bg-cyan-400',
  '7': 'bg-blue-400',
  '8': 'bg-purple-400',
}

interface TrackRowProps {
  track: Track
  index: number
  style?: React.CSSProperties
}

export const TrackRow = memo(function TrackRow({ track, index, style }: TrackRowProps) {
  const { currentTrack, isPlaying, play, pause } = usePlayerStore()
  const { selectedTrackId, selectTrack } = useCollectionStore()

  const isCurrent = currentTrack?.id === track.id
  const isSelected = selectedTrackId === track.id
  const analysis = track.analysis

  const effectiveGenre = analysis?.userGenre ?? analysis?.genre ?? track.genre
  const effectiveMood = analysis?.userMood ?? analysis?.mood
  const effectiveBpm = (analysis?.userOverride as any)?.bpm ?? analysis?.bpm ?? track.bpm
  const effectiveEnergy = (analysis?.userOverride as any)?.energy ?? analysis?.energy
  const effectiveKey = analysis?.userOverride && (analysis.userOverride as any).key
    ? (analysis.userOverride as any).key
    : analysis?.keyDetected ?? null
  // Camelot from analysis (long-form) or fall back to Rekordbox key (short-form)
  const camelot = effectiveKey
    ? (KEY_TO_CAMELOT[effectiveKey] ?? null)
    : (track.musicalKey ? (REKORDBOX_KEY_TO_CAMELOT[track.musicalKey] ?? null) : null)

  const handleRowClick = () => {
    selectTrack(isSelected ? null : track.id)
  }

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCurrent && isPlaying) {
      pause()
    } else {
      play(track)
    }
  }

  return (
    <div
      style={style}
      className={`track-row ${isSelected ? 'track-row-selected' : ''} ${isCurrent ? 'track-row-playing' : ''}`}
      onClick={handleRowClick}
    >
      {/* Row number / play button */}
      <div className="col w-10 flex-shrink-0 justify-center">
        <button
          onClick={handlePlayClick}
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all
            ${isCurrent
              ? 'bg-accent-purple text-white hover:bg-purple-600'
              : 'text-gray-500 hover:text-white hover:bg-surface-3'
            }`}
        >
          {isCurrent && isPlaying ? (
            // Animated EQ bars when playing
            <span className="flex gap-px items-end h-3">
              <span className="w-0.5 bg-current animate-eq" style={{ animationDelay: '0ms' }} />
              <span className="w-0.5 bg-current animate-eq" style={{ animationDelay: '200ms' }} />
              <span className="w-0.5 bg-current animate-eq" style={{ animationDelay: '400ms' }} />
            </span>
          ) : (
            <span className="text-xs">{isCurrent ? '⏸' : '▶'}</span>
          )}
        </button>
      </div>

      {/* Color dot */}
      <div className="col w-6 flex-shrink-0 justify-center px-0">
        {track.colorId != null && track.colorId !== '0' && COLOR_DOTS[track.colorId] && (
          <div className={`w-2 h-2 rounded-full ${COLOR_DOTS[track.colorId]}`} />
        )}
      </div>

      {/* Title + Artist */}
      <div className="col flex-1 min-w-0 flex-col items-start py-2">
        <div className="flex items-center gap-1.5 w-full">
          <span className="text-white text-sm font-medium truncate">{track.title}</span>
          {analysis?.isHebrew && (
            <span className="tag-hebrew text-xs flex-shrink-0">עב</span>
          )}
        </div>
        <span className="text-gray-400 text-xs truncate w-full">{track.artist}</span>
      </div>

      {/* BPM */}
      <div className="col w-20 flex-shrink-0 justify-end">
        <span className={`font-mono text-sm ${effectiveBpm ? 'text-accent-purple-light' : 'text-gray-600'}`}>
          {effectiveBpm ? effectiveBpm.toFixed(1) : '—'}
        </span>
      </div>

      {/* Key / Camelot */}
      <div className="col w-20 flex-shrink-0 justify-center">
        {camelot ? (
          <span
            className="text-xs font-mono text-gray-400 bg-surface-3 px-1.5 py-0.5 rounded cursor-default"
            title={track.musicalKey ?? effectiveKey ?? undefined}
          >
            {camelot}
          </span>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        )}
      </div>

      {/* Energy bar */}
      <div className="col w-28 flex-shrink-0">
        {effectiveEnergy != null ? (
          <div className="flex items-center gap-2 w-full">
            <div className="energy-bar-bg flex-1">
              <div
                className={`energy-bar-fill ${
                  effectiveEnergy >= 0.8 ? 'bg-energy-peak' :
                  effectiveEnergy >= 0.6 ? 'bg-energy-high' :
                  effectiveEnergy >= 0.35 ? 'bg-energy-mid' :
                  'bg-energy-low'
                }`}
                style={{ width: `${effectiveEnergy * 100}%` }}
              />
            </div>
            <span className={`text-xs font-mono w-8 text-right ${energyToColor(effectiveEnergy)}`}>
              {(effectiveEnergy * 100).toFixed(0)}
            </span>
          </div>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        )}
      </div>

      {/* Genre */}
      <div className="col w-28 flex-shrink-0">
        {effectiveGenre ? (
          <span className="tag-genre truncate max-w-full">{effectiveGenre}</span>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        )}
      </div>

      {/* Mood */}
      <div className="col w-24 flex-shrink-0">
        {effectiveMood ? (
          <span className="tag-mood truncate max-w-full">{effectiveMood}</span>
        ) : (
          <span className="text-gray-600 text-xs">—</span>
        )}
      </div>

      {/* Duration */}
      <div className="col w-16 flex-shrink-0 justify-end">
        <span className="font-mono text-xs text-gray-400">
          {formatDuration(track.duration)}
        </span>
      </div>

      {/* Analysis status */}
      <div className="col w-10 flex-shrink-0 justify-center">
        {track.analysisStatus === 'analyzed' ? (
          <span title="Analyzed" className="text-green-400 text-sm">✓</span>
        ) : track.analysisStatus === 'analyzing' ? (
          <span title="Analyzing…" className="text-yellow-400 text-sm animate-spin">⟳</span>
        ) : track.analysisStatus === 'error' ? (
          <span title="Analysis error" className="text-red-400 text-sm">✗</span>
        ) : (
          <span title="Not analyzed" className="text-gray-700 text-sm">○</span>
        )}
      </div>
    </div>
  )
})
