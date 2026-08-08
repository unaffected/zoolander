import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, FileArchive, FolderOutput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { serializeProject } from '@/model/project'
import { buildArchiveFiles } from '@/lib/export-archive'
import { downloadFile } from '@/lib/file-io'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const model = useStore((s) => s.model)
  const projectId = useStore((s) => s.projectId)
  const files = useMemo(() => {
    return Object.fromEntries(
      Object.entries(serializeProject(model)).map(([name, doc]) => [name, JSON.stringify(doc, null, 2)]),
    )
  }, [model])
  const names = Object.keys(files)
  const [selected, setSelected] = useState<string | null>(null)
  const active = selected && files[selected] !== undefined ? selected : (names[0] ?? null)

  const copy = async () => {
    if (!active) return
    await navigator.clipboard.writeText(files[active]!)
    toast.success(`${active} copied.`)
  }

  const download = () => {
    if (!active) return
    downloadFile(active, files[active]!)
  }

  const exportArchive = async () => {
    if (!window.zoolander || !projectId) return
    const archive = await buildArchiveFiles(model, projectId)
    const saved = await window.zoolander.exportArchive(model.title || 'zoolander-export', archive)
    if (saved) toast.success(`Exported ${saved}`)
  }

  const exportToFolder = async () => {
    if (!window.zoolander) return
    const dir = await window.zoolander.chooseDir()
    if (!dir) return
    const ok = await window.zoolander.writeFiles(
      dir,
      Object.fromEntries(Object.entries(files).map(([n, t]) => [n, t + '\n'])),
    )
    if (ok) toast.success(`Wrote ${names.length} files to ${dir}`)
    else toast.error('Write failed.')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>One JSON Schema file per resource.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 gap-3">
          <ul className="w-48 shrink-0 space-y-1 overflow-y-auto">
            {names.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setSelected(name)}
                  className={cn(
                    'w-full truncate rounded px-2 py-1 text-left font-mono text-xs',
                    name === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {name}
                </button>
              </li>
            ))}
            {names.length === 0 && <li className="text-xs text-muted-foreground">No resources.</li>}
          </ul>
          <pre className="max-h-96 min-h-48 flex-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
            {active ? files[active] : ''}
          </pre>
        </div>
        <DialogFooter>
          {window.zoolander && (
            <>
              <Button onClick={() => void exportArchive()} disabled={names.length === 0}>
                <FileArchive className="size-4" /> Export .zip (schema + data)…
              </Button>
              <Button variant="outline" onClick={exportToFolder} disabled={names.length === 0}>
                <FolderOutput className="size-4" /> Write to folder…
              </Button>
            </>
          )}
          <Button variant="outline" onClick={copy} disabled={!active}>
            <Copy className="size-4" /> Copy
          </Button>
          <Button onClick={download} disabled={!active}>
            <Download className="size-4" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
