import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { relationIds, tableColumns } from '@/lib/data-table'
import Form from '@rjsf/shadcn'
import validator from '@rjsf/validator-ajv8'
import type { IChangeEvent } from '@rjsf/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formSchemaFor, recordLabel, referencedObjectIds, type RefOption } from '@/lib/form-schema'
import { getRecordStore } from '@/lib/record-store'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'
import type { RecordDTO } from '@/types/bridge'

interface EditState {
  record: RecordDTO | null
}

export function DataView() {
  const model = useStore((s) => s.model)
  const projectId = useStore((s) => s.projectId)
  const [objectId, setObjectId] = useState<string | null>(model.objects[0]?.id ?? null)
  const [records, setRecords] = useState<RecordDTO[]>([])
  const [refRecords, setRefRecords] = useState<Record<string, RecordDTO[]>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<EditState | null>(null)

  const object = model.objects.find((o) => o.id === objectId) ?? model.objects[0] ?? null
  const activeObjectId = object?.id ?? null

  const reload = useCallback(async () => {
    if (!projectId) return
    const store = getRecordStore()
    const next: Record<string, number> = {}
    for (const obj of model.objects) {
      next[obj.id] = (await store.find(projectId, obj.id)).length
    }
    setCounts(next)
    if (!object) {
      setRecords([])
      setRefRecords({})
      return
    }
    setRecords(await store.find(projectId, object.id))
    const refs: Record<string, RecordDTO[]> = {}
    for (const refId of referencedObjectIds(model, object.id)) {
      refs[refId] = await store.find(projectId, refId)
    }
    setRefRecords(refs)
  }, [projectId, model, object])

  useEffect(() => {
    void reload()
  }, [reload])

  const schema = useMemo(() => {
    if (!object) return null
    const options = (targetId: string): RefOption[] => {
      const targetObj = model.objects.find((o) => o.id === targetId)
      return (refRecords[targetId] ?? []).map((r) => ({
        id: r.id,
        label: recordLabel(targetObj, r.data, r.id),
      }))
    }
    return formSchemaFor(model, object.id, options)
  }, [model, object, refRecords])

  const columns = useMemo(
    () => (activeObjectId ? tableColumns(model, activeObjectId) : []),
    [model, activeObjectId],
  )

  // Linked-record labels come from the same refRecords already loaded for the
  // form pickers.
  const linkedRecords = useMemo(() => {
    const byId = new Map<string, RecordDTO>()
    for (const list of Object.values(refRecords)) for (const r of list) byId.set(r.id, r)
    return byId
  }, [refRecords])

  // Following a link switches tables and briefly highlights the target row.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    if (!highlightId) return
    highlightRef.current?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => setHighlightId(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightId, records])

  const followLink = (targetObjectId: string, recordId: string) => {
    setObjectId(targetObjectId)
    setHighlightId(recordId)
  }

  const save = async (event: IChangeEvent) => {
    if (!projectId || !object || !editing) return
    const store = getRecordStore()
    if (editing.record) {
      await store.patch(editing.record.id, projectId, event.formData)
      toast.success('Record updated.')
    } else {
      await store.create(projectId, object.id, event.formData)
      toast.success('Record created.')
    }
    setEditing(null)
    void reload()
  }

  const removeRecord = async (record: RecordDTO) => {
    if (!projectId) return
    if (!window.confirm('Delete this record?')) return
    await getRecordStore().remove(record.id, projectId)
    void reload()
  }

  if (model.objects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Define resources in the model first, then manage their records here.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-52 shrink-0 space-y-1 overflow-y-auto border-r bg-card p-2">
        {model.objects.map((obj) => (
          <button
            key={obj.id}
            type="button"
            onClick={() => setObjectId(obj.id)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
              obj.id === activeObjectId
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50',
            )}
          >
            <span className="truncate font-mono">{obj.name}</span>
            <span className="text-xs text-muted-foreground">{counts[obj.id] ?? 0}</span>
          </button>
        ))}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        {object && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-lg font-semibold">{object.name}</h2>
              <Button size="sm" onClick={() => setEditing({ record: null })}>
                <Plus className="size-4" /> New {object.name}
              </Button>
            </div>
            {records.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground italic">
                No {object.name} records yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      {columns.map((c) => (
                        <th key={c.name} className="px-3 py-2 font-mono font-medium">
                          {c.name}
                        </th>
                      ))}
                      <th className="w-20 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => {
                      const data = (record.data ?? {}) as Record<string, unknown>
                      return (
                        <tr
                          key={record.id}
                          ref={record.id === highlightId ? highlightRef : undefined}
                          className={cn(
                            'border-b transition-colors last:border-0 hover:bg-accent/30',
                            record.id === highlightId && 'bg-primary/10',
                          )}
                        >
                          {columns.map((c) => {
                            if (c.kind === 'id') {
                              return (
                                <td key={c.name} className="px-3 py-2">
                                  <button
                                    type="button"
                                    title={record.id}
                                    className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                    onClick={() => setEditing({ record })}
                                  >
                                    {record.id.slice(0, 8)}
                                  </button>
                                </td>
                              )
                            }
                            if (c.kind === 'relation') {
                              const targetObj = model.objects.find((o) => o.id === c.targetObjectId)
                              const ids = relationIds(data[c.name])
                              return (
                                <td key={c.name} className="max-w-64 truncate px-3 py-2">
                                  {ids.map((id, i) => {
                                    const linked = linkedRecords.get(id)
                                    return (
                                      <span key={id}>
                                        {i > 0 && ', '}
                                        {linked ? (
                                          <button
                                            type="button"
                                            title={id}
                                            className="text-primary underline-offset-2 hover:underline"
                                            onClick={() => followLink(c.targetObjectId, id)}
                                          >
                                            {recordLabel(targetObj, linked.data, id)}
                                          </button>
                                        ) : (
                                          <span title={id} className="font-mono text-xs text-muted-foreground">
                                            {id.slice(0, 8)}
                                          </span>
                                        )}
                                      </span>
                                    )
                                  })}
                                </td>
                              )
                            }
                            return (
                              <td key={c.name} className="max-w-64 truncate px-3 py-2">
                                {formatCell(data[c.name])}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Edit record"
                                onClick={() => setEditing({ record })}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Delete record"
                                onClick={() => void removeRecord(record)}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing?.record ? `Edit ${object?.name}` : `New ${object?.name}`}
              </DialogTitle>
            </DialogHeader>
            {schema && editing && (
              <Form
                // Remount per object/record so RJSF never carries stale form
                // state from a previously opened dialog.
                key={`${object?.id}:${editing.record?.id ?? 'new'}`}
                schema={schema}
                validator={validator}
                formData={editing.record?.data ?? {}}
                onSubmit={(event) => void save(event)}
                showErrorList={false}
              />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
