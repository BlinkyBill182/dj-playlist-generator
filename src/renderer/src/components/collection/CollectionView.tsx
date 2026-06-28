import { useRef, useCallback, useEffect, useState } from 'react'
import { useCollectionStore } from '../../store/collection'
import { FilterBar } from './FilterBar'
import { TrackRow } from './TrackRow'
import { TrackDetailPanel } from './TrackDetailPanel'
import type { SortField } from '../../types'

const ITEM_HEIGHT = 52
const OVERSCAN = 5

interface ColumnHeader {
  label: string
  field: SortField | null
  className: string
}

const COLUMNS: ColumnHeader[] = [
  { label: '#',       field: null,       className: 'w-10 justify-center' },
  { label: '',        field: null,       className: 'w-6 px-0' },
  { label: 'Title',   field: 'title',    className: 'flex-1' },
  { label: 'BPM',     field: 'bpm',      className: 'w-20 justify-end' },
  { label: 'Key',     field: null,       className: 'w-20 justify-center' },
  { label: 'Energy',  field: 'energy',   className: 'w-28' },
  { label: 'Genre',   field: 'genre',    className: 'w-28' },
  { label: 'Mood',    field: 'mood',     className: 'w-24' },
  { label: 'Time',    field: 'duration', className: 'w-16 justify-end' },
  { label: '✓',       field: null,       className: 'w-10 justify-center' },
]

export function CollectionView() {
  const {
    tracks,
    isLoadingTracks,
    loadError,
    connectionStatus,
    sortField,
    sortDirection,
    setSort,
    getFilteredTracks,
    selectedTrackId,
    loadCollection,
  } = useCollectionStore()

  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredTracks = getFilteredTracks()
  const totalHeight = filteredTracks.length * ITEM_HEIGHT

  // Virtualised window
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    filteredTracks.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  )
  const visibleTracks = filteredTracks.slice(startIndex, endIndex)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // ---- Loading / error states ----
  if (isLoadingTracks) {
    return (
      <div className="flex flex-col h-full">
        <FilterBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-spin-slow">💿</div>
            <div className="text-gray-400 text-sm">Loading collection from Rekordbox…</div>
          </div>
        </div>
      </div>
    )
  }

  if (loadError || connectionStatus?.connected === false) {
    return (
      <div className="flex flex-col h-full">
        <FilterBar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">🔌</div>
            <div className="text-white font-semibold mb-2">Rekordbox not found</div>
            <div className="text-gray-400 text-sm mb-4">
              {connectionStatus?.error ?? loadError ?? 'Could not connect to Rekordbox database.'}
            </div>
            <div className="text-xs text-gray-600 mb-4 text-left bg-surface-2 rounded-lg p-3 space-y-1">
              <p className="font-medium text-gray-400 mb-2">Expected database locations:</p>
              <code className="text-xs text-gray-500 break-all block">~/Library/Pioneer/rekordbox/master.db</code>
              <code className="text-xs text-gray-500 break-all block">~/Library/Application Support/AlphaTheta/rekordbox/master.db</code>
              <code className="text-xs text-gray-500 break-all block">~/Library/Application Support/Pioneer/rekordbox/master.db</code>
            </div>
            <button onClick={loadCollection} className="btn-primary">
              ⟳ Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <FilterBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-4">🎵</div>
            <div className="text-gray-400">No tracks found in your Rekordbox library</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Main table */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center bg-surface-1 border-b border-border flex-shrink-0 text-xs text-gray-500 font-medium uppercase tracking-wide select-none">
            {COLUMNS.map((col) => (
              <div
                key={col.label}
                className={`col ${col.className} ${col.field ? 'cursor-pointer hover:text-gray-300 transition-colors' : ''}`}
                onClick={col.field ? () => setSort(col.field!) : undefined}
              >
                <span>{col.label}</span>
                {col.field === sortField && (
                  <span className="ml-1 text-accent-purple">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Virtualised list */}
          {filteredTracks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl mb-3">🔍</div>
                <div className="text-gray-500 text-sm">No tracks match your filters</div>
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto"
              onScroll={handleScroll}
            >
              {/* Virtual spacer for total height */}
              <div style={{ height: totalHeight, position: 'relative' }}>
                {visibleTracks.map((track, i) => {
                  const absoluteIndex = startIndex + i
                  return (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={absoluteIndex}
                      style={{
                        position: 'absolute',
                        top: absoluteIndex * ITEM_HEIGHT,
                        left: 0,
                        right: 0,
                        height: ITEM_HEIGHT,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer stats */}
          <div className="h-7 bg-surface-1 border-t border-border flex items-center px-4 text-xs text-gray-600 flex-shrink-0">
            <span>
              {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()} tracks
              {filteredTracks.length !== tracks.length && ' (filtered)'}
            </span>
          </div>
        </div>

        {/* Track detail panel */}
        {selectedTrackId && (
          <TrackDetailPanel
            trackId={selectedTrackId}
          />
        )}
      </div>
    </div>
  )
}
