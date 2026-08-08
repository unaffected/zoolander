import type { DataModel, ModelObject, Property, Relation, ScalarType } from './types'
import { EXTENSION_KEYWORD, SCALAR_TYPES } from './types'
import { uuidv7 } from './uuid'

export interface ParseResult {
  model: DataModel
  warnings: string[]
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function refTarget(node: unknown): string | null {
  if (!isObject(node) || typeof node.$ref !== 'string') return null
  const match = /^#\/\$defs\/(.+)$/.exec(node.$ref)
  return match ? match[1]! : null
}

export function parseScalarProperty(name: string, node: JsonObject, required: boolean, defName: string, warnings: string[]): Property | null {
  const type = node.type
  if (typeof type !== 'string' || !SCALAR_TYPES.includes(type as ScalarType)) {
    warnings.push(`${defName}.${name}: unsupported property definition, skipped`)
    return null
  }
  const prop: Property = { name, type: type as ScalarType, required }
  if (typeof node.description === 'string') prop.description = node.description
  if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === 'string')) {
    prop.enum = node.enum as string[]
  }
  if (typeof node.format === 'string') prop.format = node.format
  if (typeof node.minLength === 'number') prop.minLength = node.minLength
  if (typeof node.maxLength === 'number') prop.maxLength = node.maxLength
  if (typeof node.pattern === 'string') prop.pattern = node.pattern
  if (typeof node.minimum === 'number') prop.minimum = node.minimum
  if (typeof node.maximum === 'number') prop.maximum = node.maximum
  return prop
}

export interface InversePair {
  source: string
  property: string
  inverseProperty: string
}

export function parseInversePairs(raw: unknown): InversePair[] {
  if (!Array.isArray(raw)) return []
  const pairs: InversePair[] = []
  for (const entry of raw) {
    if (
      isObject(entry) &&
      typeof entry.source === 'string' &&
      typeof entry.property === 'string' &&
      typeof entry.inverseProperty === 'string'
    ) {
      pairs.push({
        source: entry.source,
        property: entry.property,
        inverseProperty: entry.inverseProperty,
      })
    }
  }
  return pairs
}

export interface ResolvedInversePair {
  sourceId: string
  property: string
  inverseProperty: string
}

/**
 * Fold paired back-reference relations into their forward relation's `inverse`
 * end. Each pair names a forward ref (source.property) and the back-reference
 * property on its target; the standalone back-reference relation is removed.
 */
export function mergeInversePairs(
  relations: Relation[],
  pairs: ResolvedInversePair[],
): Relation[] {
  let merged = relations
  for (const pair of pairs) {
    const forward = merged.find(
      (r) => r.kind === 'ref' && r.sourceId === pair.sourceId && r.propertyName === pair.property,
    )
    if (!forward) continue
    const backward = merged.find(
      (r) =>
        r.kind === 'ref' &&
        r !== forward &&
        r.sourceId === forward.targetId &&
        r.targetId === forward.sourceId &&
        r.propertyName === pair.inverseProperty,
    )
    if (!backward) continue
    forward.inverse = { propertyName: backward.propertyName, cardinality: backward.cardinality }
    merged = merged.filter((r) => r !== backward)
  }
  return merged
}

export function parse(schema: JsonObject): ParseResult {
  if (!isObject(schema)) {
    throw new Error('Schema must be a JSON object')
  }
  const warnings: string[] = []
  const title = typeof schema.title === 'string' && schema.title ? schema.title : 'Untitled Model'
  const defs = isObject(schema.$defs) ? schema.$defs : {}
  const defNames = Object.keys(defs)

  const ext = isObject(schema[EXTENSION_KEYWORD]) ? (schema[EXTENSION_KEYWORD] as JsonObject) : {}
  const positions = isObject(ext.positions) ? (ext.positions as JsonObject) : {}
  const extIds = isObject(ext.ids) ? (ext.ids as JsonObject) : {}

  // Stable ids: restore from the extension when present, mint UUIDv7 otherwise.
  // Names are never used as ids — records key on ids and renames must not orphan.
  const idForName = new Map<string, string>()
  for (const defName of defNames) {
    const extId = extIds[defName]
    idForName.set(defName, typeof extId === 'string' && extId ? extId : uuidv7())
  }

  const objects: ModelObject[] = []
  const relations: Relation[] = []

  for (const defName of defNames) {
    const def = defs[defName]
    if (!isObject(def) || (def.type !== 'object' && def.type !== undefined && !def.allOf)) {
      warnings.push(`$defs.${defName}: not a plain object schema, skipped`)
      continue
    }
    if (def.type === undefined && !def.allOf) {
      warnings.push(`$defs.${defName}: not a plain object schema, skipped`)
      continue
    }

    const pos = isObject(positions[defName]) ? (positions[defName] as JsonObject) : null
    const object: ModelObject = {
      id: idForName.get(defName)!,
      name: defName,
      properties: [],
      position: {
        x: pos && typeof pos.x === 'number' ? pos.x : 0,
        y: pos && typeof pos.y === 'number' ? pos.y : 0,
      },
    }
    if (typeof def.description === 'string') object.description = def.description

    if (Array.isArray(def.allOf)) {
      for (const entry of def.allOf) {
        const target = refTarget(entry)
        if (!target) {
          warnings.push(`$defs.${defName}: allOf entry without a $defs $ref, skipped`)
          continue
        }
        if (!defNames.includes(target)) {
          warnings.push(`$defs.${defName}: inherits unknown def "${target}", skipped`)
          continue
        }
        relations.push({
          id: `${defName}->extends->${target}`,
          sourceId: idForName.get(defName)!,
          targetId: idForName.get(target)!,
          propertyName: '',
          cardinality: 'one',
          kind: 'inheritance',
        })
      }
    }

    const required = Array.isArray(def.required) ? def.required.filter((r): r is string => typeof r === 'string') : []
    const properties = isObject(def.properties) ? def.properties : {}
    for (const [propName, rawProp] of Object.entries(properties)) {
      if (!isObject(rawProp)) {
        warnings.push(`${defName}.${propName}: unsupported property definition, skipped`)
        continue
      }

      const directRef = refTarget(rawProp)
      const itemsRef = rawProp.type === 'array' ? refTarget(rawProp.items) : null
      if (directRef || itemsRef) {
        const target = (directRef ?? itemsRef)!
        if (!defNames.includes(target)) {
          warnings.push(`${defName}.${propName}: references unknown def "${target}", skipped`)
          continue
        }
        relations.push({
          id: `${defName}.${propName}`,
          sourceId: idForName.get(defName)!,
          targetId: idForName.get(target)!,
          propertyName: propName,
          cardinality: directRef ? 'one' : 'many',
          kind: 'ref',
        })
        continue
      }

      const prop = parseScalarProperty(propName, rawProp, required.includes(propName), defName, warnings)
      if (prop) object.properties.push(prop)
    }

    objects.push(object)
  }

  const resolvedPairs = parseInversePairs(ext.inverses).flatMap((pair) => {
    const sourceId = idForName.get(pair.source)
    return sourceId
      ? [{ sourceId, property: pair.property, inverseProperty: pair.inverseProperty }]
      : []
  })
  const merged = mergeInversePairs(relations, resolvedPairs)
  return { model: { title, objects, relations: merged }, warnings }
}
