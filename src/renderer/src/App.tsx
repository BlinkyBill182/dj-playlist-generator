import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { PlayerBar } from './components/layout/PlayerBar'
import { CollectionView } from './components/collection/CollectionView'
import { useCollectionStore } from './store/collection'

export type View = 'collection' | 'playlists' | 'new-playlist' | 'timeline'

export default function App() {
  const [activeView, setActiveView] = useState<View>('collection')
  const {
    checkConnection,
    loadCollection,
    handleAnalysisProgress,
    handleAnalysisComplete,
  } = useCollectionStore()

  useEffect(() => {
    checkConnection().then(() => loadCollection())
  }, [])

  // Listen for analysis progress events pushed from the main process
  useEffect(() => {
    const { ipcRenderer } = window.electron
    const onProgress = (_e: unknown, progress: any) => handleAnalysisProgress(progress)
    const onComplete = (_e: unknown, data: any) => handleAnalysisComplete()
    ipcRenderer.on('analysis:progress', onProgress)
    ipcRenderer.on('analysis:complete', onComplete)
    return () => {
      ipcRenderer.removeListener('analysis:progress', onProgress)
      ipcRenderer.removeListener('analysis:complete', onComplete)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      {/* Title bar area — macOS traffic lights sit here */}
      <div className="drag-region h-10 bg-surface flex-shrink-0" />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeView={activeView} onNavigate={setActiveView} />

        {/* Main content area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar activeView={activeView} />

          <main className="flex-1 overflow-hidden">
            {activeView === 'collection' && <CollectionView />}
            {activeView === 'playlists' && (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-5xl mb-4">📋</div>
                  <div className="text-lg font-medium">Playlists — Phase 3</div>
                  <div className="text-sm mt-1">Coming soon</div>
                </div>
              </div>
            )}
            {activeView === 'new-playlist' && (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-5xl mb-4">✨</div>
                  <div className="text-lg font-medium">New Playlist Generator — Phase 3</div>
                  <div className="text-sm mt-1">Coming soon</div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Player bar */}
      <PlayerBar />
    </div>
  )
}
