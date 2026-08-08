import type { DataModel } from '@/model/types'

export type TableColumn =
  | { kind: 'id'; name: 'id' }
  | { kind: 'scalar'; name: string }
  | { kind: 'relation'; name: string; targetObjectId: string; cardinality: 'one' | 'many' }

const SCALAR_COLUMN_CAP = 4

/**
 * Columns for one resource's record table: the id first (so a row can never
 * render empty), then up to four scalar properties, then every relation field
 * (forward and inverse) so linked records are visible and navigable.
 */
export function tableColumns(model: DataModel, objectId: string): TableColumn[] {
  const obj = model.objects.find((o) => o.id === objectId)
  const columns: TableColumn[] = [{ kind: 'id', name: 'id' }]
  for (const prop of (obj?.properties ?? []).slice(0, SCALAR_COLUMN_CAP)) {
    columns.push({ kind: 'scalar', name: prop.name })
  }
  for (const rel of model.relations) {
    if (rel.kind !== 'ref') continue
    if (rel.sourceId === objectId) {
      columns.push({
        kind: 'relation',
        name: rel.propertyName,
        targetObjectId: rel.targetId,
        cardinality: rel.cardinality,
      })
    }
    if (rel.targetId === objectId && rel.inverse) {
      columns.push({
        kind: 'relation',
        name: rel.inverse.propertyName,
        targetObjectId: rel.sourceId,
        cardinality: rel.inverse.cardinality,
      })
    }
  }
  return columns
}

/** Normalize a stored relation value (one id, many ids, or absent) to ids. */
export function relationIds(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v !== '')
  return []
}
