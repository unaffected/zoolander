export type ScalarType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'

export const SCALAR_TYPES: ScalarType[] = ['string', 'number', 'integer', 'boolean', 'object', 'array']

export interface Property {
  name: string
  type: ScalarType
  required: boolean
  description?: string
  enum?: string[]
  format?: string
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
}

/** JSON Schema string formats offered in the editor. */
export const STRING_FORMATS = [
  'date-time',
  'date',
  'time',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uri',
  'uuid',
  'regex',
] as const

export interface ModelObject {
  id: string
  name: string
  description?: string
  properties: Property[]
  position: { x: number; y: number }
}

export interface RelationEnd {
  propertyName: string
  cardinality: 'one' | 'many'
}

export interface Relation {
  id: string
  sourceId: string
  targetId: string
  propertyName: string
  cardinality: 'one' | 'many'
  kind: 'ref' | 'inheritance'
  /** Optional back-reference field on the target object (ref relations only). */
  inverse?: RelationEnd
}

export interface DataModel {
  title: string
  objects: ModelObject[]
  relations: Relation[]
}

export const SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema'
export const MODEL_ID = 'urn:zoolander:model'
export const EXTENSION_KEYWORD = 'x-zoolander'
