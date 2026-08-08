import type { DataModel, ModelObject, Property } from './types'
import { EXTENSION_KEYWORD, MODEL_ID, SCHEMA_URI } from './types'

function serializeProperty(prop: Property): Record<string, unknown> {
  const out: Record<string, unknown> = { type: prop.type }
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

/** Builds one object-type schema; `ref` turns a target object name into a $ref string. */
export function serializeObjectDef(
  obj: ModelObject,
  model: DataModel,
  ref: (targetName: string) => string,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const prop of obj.properties) {
    properties[prop.name] = serializeProperty(prop)
  }

  const nameById = new Map(model.objects.map((o) => [o.id, o.name]))
  const refProperty = (targetName: string, cardinality: 'one' | 'many') => {
    const refNode = { $ref: ref(targetName) }
    return cardinality === 'many' ? { type: 'array', items: refNode } : refNode
  }
  const inherits: Record<string, unknown>[] = []
  for (const rel of model.relations) {
    if (rel.sourceId === obj.id) {
      const targetName = nameById.get(rel.targetId)
      if (!targetName) continue
      if (rel.kind === 'inheritance') {
        inherits.push({ $ref: ref(targetName) })
      } else {
        properties[rel.propertyName] = refProperty(targetName, rel.cardinality)
      }
    }
    // The inverse end lives on the target object's schema.
    if (rel.targetId === obj.id && rel.kind === 'ref' && rel.inverse) {
      const sourceName = nameById.get(rel.sourceId)
      if (!sourceName) continue
      properties[rel.inverse.propertyName] = refProperty(sourceName, rel.inverse.cardinality)
    }
  }

  const def: Record<string, unknown> = { type: 'object', title: obj.name }
  if (obj.description) def.description = obj.description
  if (inherits.length > 0) def.allOf = inherits
  def.properties = properties
  const required = obj.properties.filter((p) => p.required).map((p) => p.name)
  if (required.length > 0) def.required = required
  return def
}

/**
 * Inverse-pair records for the x-zoolander extension: which ref property on the
 * source object pairs with which back-reference property on the target, so a
 * two-ended relation round-trips as one relation instead of two.
 */
export function inversePairs(
  model: DataModel,
  forObjectId?: string,
): { source: string; property: string; inverseProperty: string }[] {
  const nameById = new Map(model.objects.map((o) => [o.id, o.name]))
  const pairs: { source: string; property: string; inverseProperty: string }[] = []
  for (const rel of model.relations) {
    if (rel.kind !== 'ref' || !rel.inverse) continue
    if (forObjectId !== undefined && rel.sourceId !== forObjectId) continue
    const source = nameById.get(rel.sourceId)
    if (!source || !nameById.has(rel.targetId)) continue
    pairs.push({ source, property: rel.propertyName, inverseProperty: rel.inverse.propertyName })
  }
  return pairs
}

export function serialize(model: DataModel): Record<string, unknown> {
  const $defs: Record<string, unknown> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  for (const obj of model.objects) {
    $defs[obj.name] = serializeObjectDef(obj, model, (name) => `#/$defs/${name}`)
    positions[obj.name] = { x: Math.round(obj.position.x), y: Math.round(obj.position.y) }
  }
  // Persist object ids so import restores them — records are keyed by id, and
  // regenerating ids on import would orphan data.
  const ids: Record<string, string> = {}
  for (const obj of model.objects) ids[obj.name] = obj.id
  const pairs = inversePairs(model)
  const extension: Record<string, unknown> = { positions, ids }
  if (pairs.length > 0) extension.inverses = pairs
  return {
    $schema: SCHEMA_URI,
    $id: MODEL_ID,
    title: model.title,
    $defs,
    [EXTENSION_KEYWORD]: extension,
  }
}
