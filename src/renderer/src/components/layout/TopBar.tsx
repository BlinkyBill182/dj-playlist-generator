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
  const {
    tracks,
    isLoadingTracks,
    loadCollection,
    isAnalyzing,
    analysisProgress,
    analyzeAll,
    stopAnalysis,
  } = useCollectionStore()

  const analyzedCount = tracks.filter((t) => t.analysisStatus === 'analyzed').length
  const unanalyzedCount = tracks.filter(
    (t) => t.analysisStatus !== 'analyzed' && t.filePath
  ).length

  const progressPercent = analysisProgress?.total
    ? Math.round((analysisProgress.done / analysisProgress.total) * 100)
    : 0

  return (
    <div className="flex-shrink-0 bg-surface-1 border-b border-border flex flex-col">
      {/* Main bar */}
      <div className="h-12 flex items-center justify-between px-4">
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
                <span className={isLoadingTracks ? 'animate-spin inline-block' : 'inline-block'}>⟳</span>
                <span className="ml-1">Refresh</span>
              </button>

              {isAnalyzing ? (
                <button
                  onClick={stopAnalysis}
                  className="btn-ghost text-xs text-yellow-400 border-yellow-400/30 hover:bg-yellow-400/10"
                >
                  <span className="animate-pulse">⏸</span>
                  <span className="ml-1">
                    {analysisProgress
                      ? `${analysisProgress.done}/${analysisProgress.total} · ${progressPercent}%`
                      : 'Analyzing…'}
                  </span>
                  <span className="ml-2 text-gray-500 text-[10px]">Stop</span>
                </button>
              ) : (
                <button
                  onClick={analyzeAll}
                  disabled={unanalyzedCount === 0}
                  className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    unanalyzedCount > 0
                      ? `Analyze ${unanalyzedCount} unanalyzed tracks`
                      : 'All tracks already analyzed'
                  }
                >
                  <span>🔬</span>
                  <span className="ml-1">
                    {unanalyzedCount > 0 ? `Analyze ${unanalyzedCount}` : 'All Analyzed'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress bar strip (2px, no reflow) */}
      <div className="h-0.5 bg-surface-2">
        {isAnalyzing && analysisProgress && (
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        )}
      </div>
    </div>
  )
}
