import { describe, expect, test } from 'bun:test'
import type { DataModel } from './types'
import { serialize } from './serialize'
import { validateSchema } from './validate'

const model: DataModel = {
  title: 'M',
  objects: [
    {
      id: 'User',
      name: 'User',
      position: { x: 5, y: 5 },
      properties: [{ name: 'name', type: 'string', required: true }],
    },
  ],
  relations: [],
}

describe('validateSchema', () => {
  test('a serialized model is valid', () => {
    const result = validateSchema(serialize(model))
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('x-zoolander keyword does not trip strict mode', () => {
    const result = validateSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      'x-zoolander': { positions: {} },
      $defs: {},
    })
    expect(result.valid).toBe(true)
  })

  test('bad type value is invalid with an error message', () => {
    const result = validateSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: { Bad: { type: 'strang' } },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('dangling $ref fails compilation', () => {
    const result = validateSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: { User: { type: 'object', properties: { pet: { $ref: '#/$defs/Ghost' } } } },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Ghost'))).toBe(true)
  })
})
