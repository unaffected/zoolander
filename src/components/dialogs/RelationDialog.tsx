import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/store'

export interface PendingConnection {
  sourceId: string
  /** null when opened without a target (e.g. from the Inspector) — the dialog offers a picker. */
  targetId: string | null
}

const NEW_TARGET = '::new::'

function autoFieldName(objectName: string, many: boolean): string {
  if (!objectName) return ''
  const base = objectName.charAt(0).toLowerCase() + objectName.slice(1)
  return many ? `${base}s` : base
}

export function RelationDialog({
  pending,
  onClose,
}: {
  pending: PendingConnection | null
  onClose: () => void
}) {
  const model = useStore((s) => s.model)
  const addRelation = useStore((s) => s.addRelation)
  const addObject = useStore((s) => s.addObject)
  const [targetChoice, setTargetChoice] = useState('')
  const [newObjectName, setNewObjectName] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [cardinality, setCardinality] = useState<'one' | 'many'>('one')
  const [withInverse, setWithInverse] = useState(false)
  const [inverseName, setInverseName] = useState('')
  const [inverseTouched, setInverseTouched] = useState(false)
  const [inverseCardinality, setInverseCardinality] = useState<'one' | 'many'>('one')
  const [error, setError] = useState<string | null>(null)

  const sourceName = model.objects.find((o) => o.id === pending?.sourceId)?.name ?? ''
  const targetName =
    targetChoice === NEW_TARGET
      ? newObjectName.trim()
      : (model.objects.find((o) => o.id === targetChoice)?.name ?? '')

  useEffect(() => {
    if (pending) {
      setTargetChoice(pending.targetId ?? '')
      setNewObjectName('')
      setPropertyName('')
      setNameTouched(false)
      setCardinality('one')
      setWithInverse(false)
      setInverseName('')
      setInverseTouched(false)
      setInverseCardinality('one')
      setError(null)
    }
  }, [pending])

  // Auto-name each end from the opposite object until the user edits it.
  useEffect(() => {
    if (!nameTouched) setPropertyName(autoFieldName(targetName, cardinality === 'many'))
  }, [targetName, cardinality, nameTouched])
  useEffect(() => {
    if (withInverse && !inverseTouched) {
      setInverseName(autoFieldName(sourceName, inverseCardinality === 'many'))
    }
  }, [withInverse, sourceName, inverseCardinality, inverseTouched])

  const submit = () => {
    if (!pending) return
    let targetId = targetChoice
    if (targetChoice === NEW_TARGET) {
      const created = addObject(newObjectName.trim())
      if (!created) {
        setError('Resource name must be a unique identifier, like Character.')
        return
      }
      targetId = created
    }
    const inverse = withInverse
      ? { propertyName: inverseName, cardinality: inverseCardinality }
      : undefined
    if (addRelation(pending.sourceId, targetId, propertyName, cardinality, inverse)) {
      onClose()
    } else {
      setError('A field name is invalid or already in use.')
    }
  }

  const canSubmit =
    propertyName.trim() !== '' &&
    targetChoice !== '' &&
    (targetChoice !== NEW_TARGET || newObjectName.trim() !== '') &&
    (!withInverse || inverseName.trim() !== '')

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add relation</DialogTitle>
          <DialogDescription>
            Define both ends of a relation from{' '}
            <span className="font-mono text-foreground">{sourceName}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Relates to</Label>
            <Select
              value={targetChoice}
              items={[
                ...model.objects.map((o) => ({ value: o.id, label: o.name })),
                { value: NEW_TARGET, label: 'New resource…' },
              ]}
              onValueChange={(v) => v && setTargetChoice(v)}
            >
              <SelectTrigger className="!h-8 w-full" aria-label="Target resource">
                <SelectValue placeholder="Choose a resource" />
              </SelectTrigger>
              <SelectContent>
                {model.objects.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_TARGET}>New resource…</SelectItem>
              </SelectContent>
            </Select>
            {targetChoice === NEW_TARGET && (
              <Input
                autoFocus
                aria-label="New resource name"
                className="h-8 font-mono"
                placeholder="e.g. Character"
                value={newObjectName}
                onChange={(e) => setNewObjectName(e.target.value)}
              />
            )}
          </div>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <span className="font-mono text-foreground">{sourceName}</span>
              <ArrowRight className="size-3" />
              <span className="font-mono text-foreground">{targetName || '…'}</span>
            </legend>
            <div className="space-y-1.5">
              <Label htmlFor="rel-name">Field on {sourceName}</Label>
              <Input
                id="rel-name"
                className="h-8 font-mono"
                value={propertyName}
                onChange={(e) => {
                  setNameTouched(true)
                  setPropertyName(e.target.value)
                }}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
              />
            </div>
            <CardinalityPair
              targetName={targetName || 'target'}
              value={cardinality}
              onChange={setCardinality}
            />
          </fieldset>

          <fieldset className={cn('space-y-3 rounded-md border p-3', !withInverse && 'pb-3')}>
            <legend className="px-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={withInverse}
                  onCheckedChange={(checked) => setWithInverse(checked === true)}
                />
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-foreground">{targetName || '…'}</span>
                  <ArrowRight className="size-3" />
                  <span className="font-mono text-foreground">{sourceName}</span>
                  <span>(inverse)</span>
                </span>
              </label>
            </legend>
            {withInverse && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="rel-inverse-name">Field on {targetName || 'target'}</Label>
                  <Input
                    id="rel-inverse-name"
                    className="h-8 font-mono"
                    value={inverseName}
                    onChange={(e) => {
                      setInverseTouched(true)
                      setInverseName(e.target.value)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
                  />
                </div>
                <CardinalityPair
                  targetName={sourceName}
                  value={inverseCardinality}
                  onChange={setInverseCardinality}
                />
              </>
            )}
          </fieldset>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Add relation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CardinalityPair({
  targetName,
  value,
  onChange,
}: {
  targetName: string
  value: 'one' | 'many'
  onChange: (value: 'one' | 'many') => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CardinalityOption
        selected={value === 'one'}
        title="Single"
        detail={`One ${targetName}`}
        onSelect={() => onChange('one')}
      />
      <CardinalityOption
        selected={value === 'many'}
        title="Multiple"
        detail={`A list of ${targetName}`}
        onSelect={() => onChange('many')}
      />
    </div>
  )
}

function CardinalityOption({
  selected,
  title,
  detail,
  onSelect,
}: {
  selected: boolean
  title: string
  detail: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-md border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </button>
  )
}
