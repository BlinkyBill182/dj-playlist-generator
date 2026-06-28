import { useCollectionStore } from '../../store/collection'
import type { View } from '../../App'

const VIEW_LABELS: Record<View, string> = {
  collection: 'Collection',
  playlists: 'Playlists',
  'new-playlist': 'New Playlist',
  timeline: 'Timeline',
}

interface TopBarProps {
  activeView: View
}

export function TopBar({ activeView }: TopBarProps) {
  const { tracks, isLoadingTracks, loadCollection } = useCollectionStore()
  const analyzedCount = tracks.filter((t) => t.analysisStatus === 'analyzed').length

  return (
    <div className="h-12 bg-surface-1 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-white">{VIEW_LABELS[activeView]}</h1>
        {activeView === 'collection' && tracks.length > 0 && (
          <span className="text-xs text-gray-500">
            {tracks.length.toLocaleString()} tracks
            {analyzedCount > 0 && (
              <span className="ml-2 text-green-400">• {analyzedCount} analyzed</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 no-drag">
        {activeView === 'collection' && (
          <>
            <button
              onClick={loadCollection}
              disabled={isLoadingTracks}
              className="btn-ghost text-xs"
            >
              {isLoadingTracks ? (
                <span className="animate-spin">⟳</span>
              ) : (
                '⟳'
              )}
              Refresh
            </button>

            <button
              onClick={() => {/* Phase 2 */}}
              className="btn-primary text-xs"
              title="Analyze all tracks with AI (Phase 2)"
            >
              <span>🔬</span>
              Analyze All
            </button>
          </>
        )}
      </div>
    </div>
  )
}
