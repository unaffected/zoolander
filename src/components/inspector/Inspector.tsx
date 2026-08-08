import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Property, ScalarType } from '@/model/types'
import { SCALAR_TYPES, STRING_FORMATS } from '@/model/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

const WIDTH_KEY = 'zoolander.ui.inspectorWidth'
const MIN_WIDTH = 280
const MAX_WIDTH = 640

/** Drag-to-resize state for the inspector rail; width persists as a UI pref. */
function useResizableWidth() {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : 320
  })
  const widthRef = useRef(width)
  widthRef.current = width

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const onMove = (move: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - move.clientX)))
      setWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      localStorage.setItem(WIDTH_KEY, String(widthRef.current))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }, [])

  return { width, startResize }
}

export function Inspector({ onAddRelation }: { onAddRelation: (sourceId: string) => void }) {
  const model = useStore((s) => s.model)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const renameObject = useStore((s) => s.renameObject)
  const setObjectDescription = useStore((s) => s.setObjectDescription)
  const addProperty = useStore((s) => s.addProperty)
  const updateProperty = useStore((s) => s.updateProperty)
  const deleteProperty = useStore((s) => s.deleteProperty)
  const deleteObject = useStore((s) => s.deleteObject)
  const deleteRelation = useStore((s) => s.deleteRelation)

  const object = model.objects.find((o) => o.id === selectedObjectId)
  const [nameDraft, setNameDraft] = useState(object?.name ?? '')
  const [descDraft, setDescDraft] = useState(object?.description ?? '')
  const { width, startResize } = useResizableWidth()

  useEffect(() => {
    setNameDraft(object?.name ?? '')
    setDescDraft(object?.description ?? '')
  }, [object?.id, object?.name, object?.description])

  if (!object) return null

  const objectName = (id: string) => model.objects.find((o) => o.id === id)?.name ?? '?'

  // One row per relation: name + type, node-card notation (Type / Type[]).
  // Dashed rows are fields living on another resource that point here.
  const suffix = (cardinality: 'one' | 'many') => (cardinality === 'many' ? '[]' : '')
  const relationRows = [
    ...model.relations
      .filter((r) => r.sourceId === object.id)
      .map((rel) => ({
        id: rel.id,
        name: rel.kind === 'inheritance' ? 'extends' : rel.propertyName,
        type:
          rel.kind === 'inheritance'
            ? objectName(rel.targetId)
            : objectName(rel.targetId) + suffix(rel.cardinality),
        external: false,
        title: undefined as string | undefined,
      })),
    ...model.relations
      .filter((r) => r.targetId === object.id && r.sourceId !== object.id)
      .map((rel) =>
        rel.kind !== 'inheritance' && rel.inverse
          ? {
              // The inverse is this resource's own field.
              id: rel.id,
              name: rel.inverse.propertyName,
              type: objectName(rel.sourceId) + suffix(rel.inverse.cardinality),
              external: false,
              title: undefined as string | undefined,
            }
          : {
              id: rel.id,
              name: rel.kind === 'inheritance' ? 'extended by' : rel.propertyName,
              type:
                rel.kind === 'inheritance'
                  ? objectName(rel.sourceId)
                  : object.name + suffix(rel.cardinality),
              external: true,
              title: `${objectName(rel.sourceId)}.${rel.propertyName}`,
            },
      ),
  ]

  const commitName = () => {
    if (nameDraft === object.name) return
    if (!renameObject(object.id, nameDraft)) {
      toast.error(`Can't rename to "${nameDraft}" — names must be unique identifiers.`)
      setNameDraft(object.name)
    }
  }

  const commitProperty = (index: number, patch: Partial<Property>) => {
    const prop = object.properties[index]
    if (!prop) return
    if (!updateProperty(object.id, index, { ...prop, ...patch })) {
      toast.error('Property name must be a unique identifier within this resource.')
    }
  }

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        onPointerDown={startResize}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
      />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Resource</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete resource"
          onClick={() => deleteObject(object.id)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="obj-name">Name</Label>
        <Input
          id="obj-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="obj-desc">Description</Label>
        <Textarea
          id="obj-desc"
          rows={2}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => descDraft !== (object.description ?? '') && setObjectDescription(object.id, descDraft)}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Properties</h3>
        <Button variant="outline" size="sm" onClick={() => addProperty(object.id)}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>

      <div className="space-y-3">
        {object.properties.map((prop, index) => (
          <PropertyRow
            key={`${object.id}-${index}`}
            prop={prop}
            onChange={(patch) => commitProperty(index, patch)}
            onDelete={() => deleteProperty(object.id, index)}
          />
        ))}
        {object.properties.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No properties yet.</p>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Relations</h3>
        <Button variant="outline" size="sm" onClick={() => onAddRelation(object.id)}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {relationRows.map((row) => (
          <div
            key={row.id}
            title={row.title}
            className={cn(
              'flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs',
              row.external && 'border-dashed text-muted-foreground',
            )}
          >
            <span className="truncate font-mono">{row.name}</span>
            <span className="ml-auto shrink-0 font-mono text-muted-foreground">{row.type}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label="Delete relation"
              onClick={() => deleteRelation(row.id)}
            >
              <Trash2 className="size-3 text-destructive" />
            </Button>
          </div>
        ))}
        {relationRows.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No relations yet.</p>
        )}
      </div>
    </aside>
  )
}

function DraftInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (value: string) => void } & Omit<
  ComponentProps<typeof Input>,
  'value' | 'onCommit'
>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && draft !== value && onCommit(draft)}
    />
  )
}

function numberPatch(key: keyof Property, raw: string): Partial<Property> {
  const trimmed = raw.trim()
  if (trimmed === '') return { [key]: undefined } as Partial<Property>
  const value = Number(trimmed)
  return Number.isFinite(value) ? ({ [key]: value } as Partial<Property>) : {}
}

function PropertyRow({
  prop,
  onChange,
  onDelete,
}: {
  prop: Property
  onChange: (patch: Partial<Property>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isString = prop.type === 'string'
  const isNumeric = prop.type === 'number' || prop.type === 'integer'

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-1.5 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={expanded ? 'Collapse rules' : 'Expand rules'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>
        <DraftInput
          className="h-8 font-mono text-xs"
          value={prop.name}
          onCommit={(name) => onChange({ name })}
        />
        <Select value={prop.type} onValueChange={(v) => onChange({ type: v as ScalarType })}>
          <SelectTrigger size="sm" className="!h-8 w-24 shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCALAR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Delete property" onClick={onDelete}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
      {expanded && (
        <div className="space-y-3 border-t px-3 py-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={prop.required}
              onCheckedChange={(checked) => onChange({ required: checked === true })}
            />
            Required
          </label>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <DraftInput
              className="h-8 text-xs"
              value={prop.description ?? ''}
              onCommit={(v) => onChange({ description: v || undefined })}
            />
          </div>
          {isString && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Format</Label>
                <Select
                  value={prop.format ?? 'none'}
                  onValueChange={(v) => onChange({ format: !v || v === 'none' ? undefined : v })}
                >
                  <SelectTrigger size="sm" className="!h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    {STRING_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Allowed values</Label>
                <DraftInput
                  className="h-8 font-mono text-xs"
                  value={(prop.enum ?? []).join(', ')}
                  onCommit={(v) => {
                    const values = v.split(',').map((s) => s.trim()).filter(Boolean)
                    onChange({ enum: values.length > 0 ? values : undefined })
                  }}
                  placeholder="e.g. draft, published, archived"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Min length</Label>
                  <DraftInput
                    className="h-8 text-xs"
                    type="number"
                    value={prop.minLength?.toString() ?? ''}
                    onCommit={(v) => onChange(numberPatch('minLength', v))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Max length</Label>
                  <DraftInput
                    className="h-8 text-xs"
                    type="number"
                    value={prop.maxLength?.toString() ?? ''}
                    onCommit={(v) => onChange(numberPatch('maxLength', v))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Pattern</Label>
                <DraftInput
                  className="h-8 font-mono text-xs"
                  value={prop.pattern ?? ''}
                  onCommit={(v) => onChange({ pattern: v || undefined })}
                />
              </div>
            </>
          )}
          {isNumeric && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Minimum</Label>
                <DraftInput
                  className="h-8 text-xs"
                  type="number"
                  value={prop.minimum?.toString() ?? ''}
                  onCommit={(v) => onChange(numberPatch('minimum', v))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Maximum</Label>
                <DraftInput
                  className="h-8 text-xs"
                  type="number"
                  value={prop.maximum?.toString() ?? ''}
                  onCommit={(v) => onChange(numberPatch('maximum', v))}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
