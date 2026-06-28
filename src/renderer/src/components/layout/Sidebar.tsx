import { useCollectionStore } from '../../store/collection'
import type { View } from '../../App'

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
}

const NAV_ITEMS: { id: View; icon: string; label: string; sublabel?: string }[] = [
  { id: 'collection',   icon: '💿', label: 'Collection',      sublabel: 'All tracks' },
  { id: 'playlists',   icon: '📋', label: 'Playlists',       sublabel: 'Saved sets' },
  { id: 'new-playlist', icon: '✨', label: 'New Playlist',   sublabel: 'AI generator' },
]

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const { connectionStatus, tracks } = useCollectionStore()

  const analyzedCount = tracks.filter((t) => t.analysisStatus === 'analyzed').length

  return (
    <div className="w-56 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
      {/* Logo area */}
      <div className="px-4 pt-3 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-pink flex items-center justify-center text-white font-bold text-sm">
            DJ
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Playlist Gen</div>
            <div className="text-xs text-gray-500 leading-tight">DJ Studio</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item w-full text-left ${activeView === item.id ? 'nav-item-active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="text-lg">{item.icon}</span>
            <div className="min-w-0">
              <div className="truncate">{item.label}</div>
              {item.sublabel && (
                <div className="text-xs text-gray-500 truncate">{item.sublabel}</div>
              )}
            </div>
          </button>
        ))}
      </nav>

      {/* Status panel */}
      <div className="p-3 border-t border-border space-y-2">
        {/* Rekordbox connection */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              connectionStatus?.connected ? 'bg-green-400' : 'bg-red-500'
            }`}
          />
          <div className="text-xs text-gray-400 truncate">
            {connectionStatus?.connected
              ? `Rekordbox • ${connectionStatus.trackCount.toLocaleString()} tracks`
              : 'Rekordbox not found'}
          </div>
        </div>

        {/* Analysis progress */}
        {tracks.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Analyzed</span>
              <span>{analyzedCount}/{tracks.length}</span>
            </div>
            <div className="energy-bar-bg">
              <div
                className="energy-bar-fill bg-accent-purple"
                style={{ width: `${tracks.length > 0 ? (analyzedCount / tracks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Rekordbox running indicator */}
        {connectionStatus?.isRunning && (
          <div className="text-xs text-yellow-400 flex items-center gap-1">
            <span>⚠</span>
            <span>Rekordbox is open (read-only)</span>
          </div>
        )}
      </div>
    </div>
  )
}
