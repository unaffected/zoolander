import { Ajv2020 } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { EXTENSION_KEYWORD } from './types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// One shared instance: constructing Ajv2020 compiles the entire 2020-12
// meta-schema suite, which is far too expensive to repeat per edit.
let sharedAjv: Ajv2020 | null = null

function getAjv(): Ajv2020 {
  if (!sharedAjv) {
    sharedAjv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(sharedAjv)
    sharedAjv.addKeyword({ keyword: EXTENSION_KEYWORD })
  }
  return sharedAjv
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectLocalRefs(node: unknown, refs: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLocalRefs(item, refs)
    return
  }
  if (!isObject(node)) return
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    refs.push(node.$ref.slice('#/$defs/'.length))
  }
  for (const value of Object.values(node)) collectLocalRefs(value, refs)
}

/** Meta-validates a schema document and checks that all `#/$defs/…` refs resolve. */
export function validateSchema(schema: Record<string, unknown>): ValidationResult {
  const ajv = getAjv()

  const metaValid = ajv.validateSchema(schema, false)
  if (!metaValid) {
    const errors = (ajv.errors ?? []).map((e) => `${e.instancePath || '/'}: ${e.message ?? 'invalid'}`)
    return { valid: false, errors: errors.length > 0 ? errors : ['schema failed meta-validation'] }
  }

  const defs = isObject(schema.$defs) ? schema.$defs : {}
  const refs: string[] = []
  collectLocalRefs(schema, refs)
  const errors: string[] = []
  for (const ref of refs) {
    if (!(ref in defs)) errors.push(`can't resolve #/$defs/${ref}`)
  }
  return { valid: errors.length === 0, errors }
}
