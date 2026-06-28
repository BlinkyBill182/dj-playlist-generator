import { useCollectionStore } from '../../store/collection'

const GENRE_OPTIONS = [
  '', 'Mizrahi', 'Pop', 'Electronic', 'Hip Hop', 'R&B', 'Rock',
  'International', 'House', 'Trance', 'Techno', 'Reggaeton', 'Latin',
]

const MOOD_OPTIONS = [
  '', 'Energetic', 'Happy', 'Melancholic', 'Romantic', 'Dark',
  'Chill', 'Aggressive', 'Uplifting', 'Groovy',
]

export function FilterBar() {
  const { filters, setFilters, tracks } = useCollectionStore()

  const analyzedCount = tracks.filter((t) => t.analysisStatus === 'analyzed').length

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-1 border-b border-border flex-shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-0 max-w-sm">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          className="input w-full pl-8 text-sm"
          placeholder="Search title, artist, album…"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
      </div>

      {/* Genre filter */}
      <select
        className="select text-sm w-36"
        value={filters.genre}
        onChange={(e) => setFilters({ genre: e.target.value })}
      >
        <option value="">All Genres</option>
        {GENRE_OPTIONS.filter(Boolean).map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      {/* Mood filter (only when analyzed tracks exist) */}
      {analyzedCount > 0 && (
        <select
          className="select text-sm w-36"
          value={filters.mood}
          onChange={(e) => setFilters({ mood: e.target.value })}
        >
          <option value="">All Moods</option>
          {MOOD_OPTIONS.filter(Boolean).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}

      {/* BPM range */}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          className="input w-16 text-sm text-center font-mono"
          placeholder="Min"
          min={60}
          max={200}
          value={filters.minBpm ?? ''}
          onChange={(e) => setFilters({ minBpm: e.target.value ? Number(e.target.value) : null })}
        />
        <span className="text-gray-600 text-xs">BPM</span>
        <input
          type="number"
          className="input w-16 text-sm text-center font-mono"
          placeholder="Max"
          min={60}
          max={200}
          value={filters.maxBpm ?? ''}
          onChange={(e) => setFilters({ maxBpm: e.target.value ? Number(e.target.value) : null })}
        />
      </div>

      {/* Analysis status filter */}
      <select
        className="select text-sm w-32"
        value={filters.analysisStatus}
        onChange={(e) => setFilters({ analysisStatus: e.target.value as any })}
      >
        <option value="all">All tracks</option>
        <option value="analyzed">Analyzed</option>
        <option value="none">Not analyzed</option>
      </select>

      {/* Clear filters */}
      {(filters.search || filters.genre || filters.mood || filters.minBpm || filters.maxBpm || filters.analysisStatus !== 'all') && (
        <button
          className="btn-ghost text-xs"
          onClick={() =>
            setFilters({
              search: '',
              genre: '',
              mood: '',
              minBpm: null,
              maxBpm: null,
              analysisStatus: 'all',
            })
          }
        >
          ✕ Clear
        </button>
      )}
    </div>
  )
}
