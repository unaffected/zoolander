import type { RJSFSchema } from '@rjsf/utils'
import type { DataModel, ModelObject, Property } from '@/model/types'

export interface RefOption {
  id: string
  label: string
}

/** Human label for a record: its first string property, else a shortened id. */
export function recordLabel(obj: ModelObject | undefined, data: unknown, id: string): string {
  const key = obj?.properties.find((p) => p.type === 'string')?.name
  if (key && typeof data === 'object' && data !== null) {
    const value = (data as Record<string, unknown>)[key]
    if (typeof value === 'string' && value) return value
  }
  return id.slice(0, 8)
}

function scalarSchema(prop: Property): Record<string, unknown> {
  const out: Record<string, unknown> = { type: prop.type, title: prop.name }
  if (prop.description) out.description = prop.description
  if (prop.enum && prop.enum.length > 0) out.enum = [...prop.enum]
  if (prop.format) out.format = prop.format
  if (prop.minLength !== undefined) out.minLength = prop.minLength
  if (prop.maxLength !== undefined) out.maxLength = prop.maxLength
  if (prop.pattern !== undefined) out.pattern = prop.pattern
  if (prop.minimum !== undefined) out.minimum = prop.minimum
  if (prop.maximum !== undefined) out.maximum = prop.maximum
  return out
}

/**
 * JSON Schema for the data-entry form of one object. Relation fields become
 * reference pickers over existing target records (stored as record ids).
 */
export function formSchemaFor(
  model: DataModel,
  objectId: string,
  refOptions: (targetObjectId: string) => RefOption[],
): RJSFSchema {
  const obj = model.objects.find((o) => o.id === objectId)
  if (!obj) return { type: 'object', properties: {} }
  const nameById = new Map(model.objects.map((o) => [o.id, o.name]))

  const properties: Record<string, unknown> = {}
  for (const prop of obj.properties) {
    properties[prop.name] = scalarSchema(prop)
  }

  const picker = (name: string, targetObjectId: string, cardinality: 'one' | 'many') => {
    const targetName = nameById.get(targetObjectId) ?? targetObjectId
    const options = refOptions(targetObjectId)
    const title = `${name} (${targetName})`
    if (options.length === 0) {
      // Never degrade to a free-text input: references only point at existing
      // records, so an empty target renders as an explicit, non-editable note.
      const description = `No ${targetName} records yet — create one under ${targetName} first.`
      properties[name] =
        cardinality === 'many'
          ? { type: 'array', title, description, maxItems: 0, items: { type: 'string' } }
          : { type: 'string', title, description, readOnly: true }
      return
    }
    const item = { type: 'string', oneOf: options.map((o) => ({ const: o.id, title: o.label })) }
    properties[name] =
      cardinality === 'many'
        ? { type: 'array', title, uniqueItems: true, items: item }
        : { ...item, title }
  }

  for (const rel of model.relations) {
    if (rel.kind !== 'ref') continue
    if (rel.sourceId === objectId) picker(rel.propertyName, rel.targetId, rel.cardinality)
    if (rel.targetId === objectId && rel.inverse) {
      picker(rel.inverse.propertyName, rel.sourceId, rel.inverse.cardinality)
    }
  }

  const required = obj.properties.filter((p) => p.required).map((p) => p.name)
  return {
    type: 'object',
    title: obj.name,
    ...(obj.description ? { description: obj.description } : {}),
    properties: properties as RJSFSchema['properties'],
    ...(required.length > 0 ? { required } : {}),
  }
}

/** Object ids referenced by pickers on the given object's form. */
export function referencedObjectIds(model: DataModel, objectId: string): string[] {
  const ids = new Set<string>()
  for (const rel of model.relations) {
    if (rel.kind !== 'ref') continue
    if (rel.sourceId === objectId) ids.add(rel.targetId)
    if (rel.targetId === objectId && rel.inverse) ids.add(rel.sourceId)
  }
  return [...ids]
}
