import { useState } from 'react'
import { toast } from 'sonner'
import { FileUp, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parse } from '@/model/parse'
import { validateSchema } from '@/model/validate'
import { autoLayout } from '@/model/layout'
import { openSchemaFile } from '@/lib/file-io'
import { openFolderAsProject } from '@/lib/project-session'
import { useStore } from '@/state/store'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadModel = useStore((s) => s.loadModel)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const importText = (raw: string) => {
    let json: Record<string, unknown>
    try {
      json = JSON.parse(raw)
    } catch (err) {
      setErrors([`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`])
      return
    }
    const validation = validateSchema(json)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }
    let result
    try {
      result = parse(json)
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)])
      return
    }
    const allAtOrigin = result.model.objects.every((o) => o.position.x === 0 && o.position.y === 0)
    const model = allAtOrigin && result.model.objects.length > 0 ? autoLayout(result.model) : result.model
    loadModel(model, 'import')
    for (const warning of result.warnings) toast.warning(warning)
    toast.success(`Imported ${model.objects.length} objects, ${model.relations.length} relations.`)
    setText('')
    setErrors([])
    onClose()
  }

  const pickFile = async () => {
    const file = await openSchemaFile()
    if (file) importText(file.text)
  }

  const pickFolder = async () => {
    const result = await openFolderAsProject()
    if (!result) return
    if (!result.ok) {
      setErrors(result.error ? [result.error] : [])
      return
    }
    for (const warning of result.warnings) toast.warning(warning)
    setText('')
    setErrors([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import JSON Schema</DialogTitle>
          <DialogDescription>
            Paste a JSON Schema 2020-12 document with resource types in <code>$defs</code>, or open a file.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={12}
          className="font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {errors.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-destructive">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={pickFile}>
              <FileUp className="size-4" /> Open file…
            </Button>
            {window.zoolander && (
              <Button variant="outline" onClick={pickFolder}>
                <FolderOpen className="size-4" /> Open folder as project…
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => importText(text)} disabled={!text.trim()}>
              Import
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
