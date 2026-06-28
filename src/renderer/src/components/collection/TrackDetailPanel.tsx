import { useCollectionStore } from '../../store/collection'
import { usePlayerStore } from '../../store/player'
import { formatDuration, KEY_TO_CAMELOT, energyToColor } from '../../types'

interface TrackDetailPanelProps {
  trackId: string
}

export function TrackDetailPanel({ trackId }: TrackDetailPanelProps) {
  const { tracks, selectTrack } = useCollectionStore()
  const { play, pause, stop, currentTrack, isPlaying } = usePlayerStore()

  const track = tracks.find((t) => t.id === trackId)
  if (!track) return null

  const a = track.analysis
  const effectiveGenre  = a?.userGenre ?? a?.genre ?? track.genre
  const effectiveMood   = a?.userMood ?? a?.mood
  const effectiveBpm    = (a?.userOverride as any)?.bpm ?? a?.bpm ?? track.bpm
  const effectiveEnergy = (a?.userOverride as any)?.energy ?? a?.energy
  const effectiveKey    = (a?.userOverride as any)?.key ?? a?.keyDetected
  const camelot = effectiveKey ? (KEY_TO_CAMELOT[effectiveKey] ?? null) : null

  const isCurrent = currentTrack?.id === track.id

  const handlePlay = () => {
    if (isCurrent && isPlaying) pause()
    else play(track)
  }

  return (
    <div className="w-72 flex-shrink-0 bg-surface-1 border-l border-border flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Track Details</span>
        <button onClick={() => selectTrack(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      {/* Artwork placeholder */}
      <div className="mx-4 mt-4 aspect-square rounded-xl bg-gradient-to-br from-accent-purple/30 to-accent-pink/20 border border-border flex items-center justify-center relative overflow-hidden flex-shrink-0">
        <div
          className={`w-20 h-20 rounded-full bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-4xl ${
            isCurrent && isPlaying ? 'vinyl-spin' : ''
          }`}
        >
          ♪
        </div>
        {/* Play button overlay */}
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
        >
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            <span className="text-black text-lg ml-0.5">{isCurrent && isPlaying ? '⏸' : '▶'}</span>
          </div>
        </button>
      </div>

      {/* Title / Artist */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-white font-semibold text-sm leading-snug">{track.title}</div>
        <div className="text-gray-400 text-xs mt-0.5">{track.artist}</div>
        {track.album && <div className="text-gray-600 text-xs mt-0.5">{track.album}</div>}
      </div>

      {/* Key metrics */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <MetricBox label="BPM" value={effectiveBpm ? effectiveBpm.toFixed(1) : '—'} accent />
        <MetricBox label="Key" value={effectiveKey ?? '—'} />
        <MetricBox label="Camelot" value={camelot ?? '—'} />
        <MetricBox label="Duration" value={formatDuration(track.duration)} />
        <MetricBox label="Rating" value={track.rating ? '★'.repeat(track.rating) : '—'} />
        <MetricBox label="Type" value={track.fileType ?? '—'} />
      </div>

      {/* Energy */}
      {effectiveEnergy != null && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Energy</span>
            <span className={`text-xs font-mono font-semibold ${energyToColor(effectiveEnergy)}`}>
              {(effectiveEnergy * 100).toFixed(0)}%
            </span>
          </div>
          <div className="energy-bar-bg">
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
        </div>
      )}

      {/* Analysis badges */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {effectiveGenre && <span className="tag-genre">{effectiveGenre}</span>}
        {effectiveMood  && <span className="tag-mood">{effectiveMood}</span>}
        {a?.danceability != null && (
          <span className="tag text-xs bg-green-900/30 text-green-300 border border-green-800/30">
            💃 {(a.danceability * 100).toFixed(0)}% dance
          </span>
        )}
        {a?.isHebrew && <span className="tag-hebrew">עברית</span>}
      </div>

      {/* Analysis features (from Phase 2) */}
      {a && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">AI Analysis</div>
          {a.brightness != null && (
            <FeatureBar label="Brightness" value={a.brightness} color="bg-yellow-400" />
          )}
          {a.percussiveness != null && (
            <FeatureBar label="Percussive" value={a.percussiveness} color="bg-red-400" />
          )}
          {a.warmth != null && (
            <FeatureBar label="Warmth" value={a.warmth} color="bg-orange-400" />
          )}
        </div>
      )}

      {/* File info */}
      <div className="px-4 pb-4 mt-auto">
        <div className="text-xs text-gray-600 font-medium uppercase tracking-wide mb-1">File</div>
        <div className="text-xs text-gray-600 break-all font-mono leading-relaxed">
          {track.filePath ?? 'Path not available'}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        <button className="btn-primary text-xs justify-center" onClick={handlePlay}>
          {isCurrent && isPlaying ? '⏸ Pause Preview' : '▶ Preview Track'}
        </button>
        <button className="btn-ghost text-xs justify-center" title="Edit track metadata (Phase 2)">
          ✏ Edit Metadata
        </button>
      </div>
    </div>
  )
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2 text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-xs font-mono font-semibold ${accent ? 'text-accent-purple-light' : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

function FeatureBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-mono text-gray-400">{(value * 100).toFixed(0)}</span>
      </div>
      <div className="energy-bar-bg">
        <div className={`energy-bar-fill ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}
