import { lazy, Suspense, useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Toaster } from '@/components/ui/sonner'
import { Canvas } from '@/components/canvas/Canvas'
import { Inspector } from '@/components/inspector/Inspector'

// The Data view carries the whole RJSF + ajv form stack (~400 kB raw); keep it
// out of the startup chunk — the canvas is the first screen.
const DataView = lazy(() =>
  import('@/components/data/DataView').then((m) => ({ default: m.DataView })),
)
import { Toolbar } from '@/components/Toolbar'
import { ImportDialog } from '@/components/dialogs/ImportDialog'
import { ExportDialog } from '@/components/dialogs/ExportDialog'
import { RelationDialog, type PendingConnection } from '@/components/dialogs/RelationDialog'
import { bootProjects } from '@/lib/project-session'
import { startMenuBridge } from '@/lib/menu-bridge'
import { startPersistence } from '@/lib/persistence-bus'
import { applyTheme, loadThemePref, persistThemePref, watchSystemTheme } from '@/lib/theme'
import { useStore } from '@/state/store'

export default function App() {
  const title = useStore((s) => s.model.title)
  const view = useStore((s) => s.view)
  const theme = useStore((s) => s.theme)

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    useStore.getState().setTheme(loadThemePref())
    return watchSystemTheme(() => useStore.getState().theme)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    persistThemePref(theme)
  }, [theme])

  useEffect(() => {
    // Keyboard fallback for plain-browser dev; in Electron the menu accelerators own ⌘Z.
    if (window.zoolander) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      e.preventDefault()
      if (e.shiftKey) useStore.getState().redo()
      else useStore.getState().undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)

  useEffect(() => {
    void bootProjects()
    const stopPersistence = startPersistence()
    const stopMenuBridge = startMenuBridge({
      openImport: () => setImportOpen(true),
      openExport: () => setExportOpen(true),
    })
    return () => {
      stopMenuBridge()
      stopPersistence()
    }
  }, [])

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col">
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          {view === 'model' ? (
            <>
              <main className="min-w-0 flex-1">
                <Canvas
                  onConnectRequest={(sourceId, targetId) =>
                    setPendingConnection({ sourceId, targetId })
                  }
                />
              </main>
              <Inspector
                onAddRelation={(sourceId) => setPendingConnection({ sourceId, targetId: null })}
              />
            </>
          ) : (
            <main className="min-w-0 flex-1">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading data view…
                  </div>
                }
              >
                <DataView />
              </Suspense>
            </main>
          )}
        </div>
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <RelationDialog pending={pendingConnection} onClose={() => setPendingConnection(null)} />
      <Toaster richColors position="bottom-right" />
    </ReactFlowProvider>
  )
}
