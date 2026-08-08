import type { DataModel, ModelObject, Relation } from './types'
import { EXTENSION_KEYWORD, SCHEMA_URI } from './types'
import { inversePairs, serializeObjectDef } from './serialize'
import {
  mergeInversePairs,
  parseInversePairs,
  parseScalarProperty,
  type InversePair,
  type ParseResult,
} from './parse'
import { uuidv7 } from './uuid'
import type { ValidationResult } from './validate'
import { validateSchema } from './validate'

type JsonObject = Record<string, unknown>

export function fileNameFor(objectName: string): string {
  return `${objectName}.schema.json`
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fileRefTarget(node: unknown): string | null {
  if (!isObject(node) || typeof node.$ref !== 'string') return null
  const match = /^(?:\.\/)?([A-Za-z_][A-Za-z0-9_-]*)\.schema\.json$/.exec(node.$ref)
  return match ? match[1]! : null
}

/** One JSON Schema 2020-12 document per object; relations use relative file $refs. */
export function serializeProject(model: DataModel): Record<string, JsonObject> {
  const files: Record<string, JsonObject> = {}
  for (const obj of model.objects) {
    const def = serializeObjectDef(obj, model, fileNameFor)
    const pairs = inversePairs(model, obj.id)
    const extension: Record<string, unknown> = {
      id: obj.id,
      position: { x: Math.round(obj.position.x), y: Math.round(obj.position.y) },
    }
    if (pairs.length > 0) extension.inverses = pairs
    files[fileNameFor(obj.name)] = {
      $schema: SCHEMA_URI,
      $id: fileNameFor(obj.name),
      ...def,
      [EXTENSION_KEYWORD]: extension,
    }
  }
  return files
}

export function parseProject(files: Record<string, JsonObject>): ParseResult {
  const warnings: string[] = []
  const objects: ModelObject[] = []
  const relations: Relation[] = []
  const pairs: InversePair[] = []

  const nameForFile = new Map<string, string>()
  const idForName = new Map<string, string>()
  for (const [fileName, doc] of Object.entries(files)) {
    const base = fileName.replace(/\.schema\.json$/, '')
    const name = isObject(doc) && typeof doc.title === 'string' && doc.title ? doc.title : base
    nameForFile.set(fileName, name)
    // Stable ids: restore from x-zoolander when present, mint UUIDv7 otherwise.
    const ext = isObject(doc) && isObject(doc[EXTENSION_KEYWORD]) ? (doc[EXTENSION_KEYWORD] as JsonObject) : {}
    idForName.set(name, typeof ext.id === 'string' && ext.id ? ext.id : uuidv7())
  }
  const knownNames = new Set(nameForFile.values())

  for (const [fileName, doc] of Object.entries(files)) {
    const name = nameForFile.get(fileName)!
    if (!isObject(doc) || (doc.type !== 'object' && !doc.allOf)) {
      warnings.push(`${fileName}: not an object schema, skipped`)
      continue
    }

    const ext = isObject(doc[EXTENSION_KEYWORD]) ? (doc[EXTENSION_KEYWORD] as JsonObject) : {}
    pairs.push(...parseInversePairs(ext.inverses))
    const pos = isObject(ext.position) ? (ext.position as JsonObject) : null
    const object: ModelObject = {
      id: idForName.get(name)!,
      name,
      properties: [],
      position: {
        x: pos && typeof pos.x === 'number' ? pos.x : 0,
        y: pos && typeof pos.y === 'number' ? pos.y : 0,
      },
    }
    if (typeof doc.description === 'string') object.description = doc.description

    if (Array.isArray(doc.allOf)) {
      for (const entry of doc.allOf) {
        const target = fileRefTarget(entry)
        if (!target || !knownNames.has(target)) {
          warnings.push(`${fileName}: allOf ref ${JSON.stringify(entry)} does not resolve, skipped`)
          continue
        }
        relations.push({
          id: `${name}->extends->${target}`,
          sourceId: idForName.get(name)!,
          targetId: idForName.get(target)!,
          propertyName: '',
          cardinality: 'one',
          kind: 'inheritance',
        })
      }
    }

    const required = Array.isArray(doc.required) ? doc.required.filter((r): r is string => typeof r === 'string') : []
    const properties = isObject(doc.properties) ? doc.properties : {}
    for (const [propName, rawProp] of Object.entries(properties)) {
      if (!isObject(rawProp)) {
        warnings.push(`${fileName}.${propName}: unsupported property definition, skipped`)
        continue
      }
      const directRef = fileRefTarget(rawProp)
      const itemsRef = rawProp.type === 'array' ? fileRefTarget(rawProp.items) : null
      if (directRef || itemsRef) {
        const target = (directRef ?? itemsRef)!
        if (!knownNames.has(target)) {
          warnings.push(`${fileName}.${propName}: references unknown schema "${target}", skipped`)
          continue
        }
        relations.push({
          id: `${name}.${propName}`,
          sourceId: idForName.get(name)!,
          targetId: idForName.get(target)!,
          propertyName: propName,
          cardinality: directRef ? 'one' : 'many',
          kind: 'ref',
        })
        continue
      }
      const prop = parseScalarProperty(propName, rawProp, required.includes(propName), name, warnings)
      if (prop) object.properties.push(prop)
    }

    objects.push(object)
  }

  const resolvedPairs = pairs.flatMap((pair) => {
    const sourceId = idForName.get(pair.source)
    return sourceId
      ? [{ sourceId, property: pair.property, inverseProperty: pair.inverseProperty }]
      : []
  })
  const merged = mergeInversePairs(relations, resolvedPairs)
  return { model: { title: 'Untitled Model', objects, relations: merged }, warnings }
}

function collectFileRefs(node: unknown, refs: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFileRefs(item, refs)
    return
  }
  if (!isObject(node)) return
  if (typeof node.$ref === 'string' && !node.$ref.startsWith('#')) {
    refs.push(node.$ref)
  }
  for (const value of Object.values(node)) collectFileRefs(value, refs)
}

export function validateProject(files: Record<string, JsonObject>): ValidationResult {
  const errors: string[] = []
  const fileNames = new Set(Object.keys(files))
  for (const [fileName, doc] of Object.entries(files)) {
    const result = validateSchema(doc)
    errors.push(...result.errors.map((e) => `${fileName}: ${e}`))
    const refs: string[] = []
    collectFileRefs(doc, refs)
    for (const ref of refs) {
      const normalized = ref.replace(/^\.\//, '')
      if (!fileNames.has(normalized)) errors.push(`${fileName}: can't resolve ${ref}`)
    }
  }
  return { valid: errors.length === 0, errors }
}
