import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { Badge } from '@/components/ui/badge'
import { relationRows, useStore, type ObjectNodeType } from '@/state/store'
import { cn } from '@/lib/utils'

export const ObjectNode = memo(function ObjectNode({ data, selected }: NodeProps<ObjectNodeType>) {
  const { object } = data
  const relations = useStore(useShallow((s) => relationRows(s.model, object.id)))
  const fieldCount = object.properties.length + relations.length
  return (
    <div
      className={cn(
        'w-60 rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow',
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !bg-muted-foreground" />
      <div className="flex items-center justify-between rounded-t-lg border-b bg-muted/60 px-3 py-2">
        <span className="truncate font-semibold">{object.name}</span>
        <Badge variant="secondary" className="text-[10px]">
          {fieldCount}
        </Badge>
      </div>
      <ul className="px-3 py-1.5">
        {fieldCount === 0 && (
          <li className="py-1 text-xs text-muted-foreground italic">no properties</li>
        )}
        {object.properties.map((prop) => (
          <li key={prop.name} className="flex items-center justify-between gap-2 py-0.5 text-xs">
            <span className="truncate font-mono">
              {prop.name}
              {prop.required && <span className="text-destructive">*</span>}
            </span>
            <span className="shrink-0 text-muted-foreground">{prop.enum ? 'enum' : prop.type}</span>
          </li>
        ))}
        {relations.map((row) => {
          const [name, type] = row.split('|')
          return (
            <li key={`rel-${name}`} className="flex items-center justify-between gap-2 py-0.5 text-xs">
              <span className="truncate font-mono">{name}</span>
              <span className="shrink-0 font-mono text-primary/80">{type}</span>
            </li>
          )
        })}
      </ul>
      <Handle type="source" position={Position.Right} className="!size-2.5 !bg-primary" />
    </div>
  )
})
