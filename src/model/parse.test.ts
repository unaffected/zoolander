import { describe, expect, test } from 'bun:test'
import type { DataModel } from './types'
import { SCHEMA_URI } from './types'
import { serialize } from './serialize'
import { parse } from './parse'

const fullModel: DataModel = {
  title: 'Blog',
  objects: [
    {
      id: 'User',
      name: 'User',
      description: 'A user',
      position: { x: 10, y: 20 },
      properties: [
        { name: 'name', type: 'string', required: true, minLength: 1, maxLength: 80 },
        { name: 'age', type: 'integer', required: false, description: 'Years', minimum: 0, maximum: 150 },
        { name: 'role', type: 'string', required: false, enum: ['admin', 'member'] },
        { name: 'email', type: 'string', required: true, format: 'email' },
        { name: 'slug', type: 'string', required: false, pattern: '^[a-z-]+$' },
      ],
    },
    {
      id: 'Post',
      name: 'Post',
      position: { x: 300, y: 20 },
      properties: [{ name: 'body', type: 'string', required: true }],
    },
    { id: 'Image', name: 'Image', position: { x: 300, y: 200 }, properties: [] },
    { id: 'Admin', name: 'Admin', position: { x: 10, y: 200 }, properties: [] },
  ],
  relations: [
    { id: 'User.posts', sourceId: 'User', targetId: 'Post', propertyName: 'posts', cardinality: 'many', kind: 'ref' },
    { id: 'User.avatar', sourceId: 'User', targetId: 'Image', propertyName: 'avatar', cardinality: 'one', kind: 'ref' },
    { id: 'Admin->extends->User', sourceId: 'Admin', targetId: 'User', propertyName: '', cardinality: 'one', kind: 'inheritance' },
  ],
}

describe('parse', () => {
  test('round-trip: parse(serialize(model)) equals model', () => {
    const { model, warnings } = parse(serialize(fullModel))
    expect(warnings).toEqual([])
    expect(model).toEqual(fullModel)
  })

  test('round-trip: serialize(parse(schema).model) equals schema', () => {
    const schema = serialize(fullModel)
    const reserialized = serialize(parse(schema).model)
    expect(reserialized).toEqual(schema)
  })

  test('missing positions default to origin', () => {
    const schema: Record<string, unknown> = {
      $schema: SCHEMA_URI,
      title: 'M',
      $defs: { Thing: { type: 'object', properties: { n: { type: 'string' } } } },
    }
    const { model } = parse(schema)
    expect(model.objects[0]!.position).toEqual({ x: 0, y: 0 })
    expect(model.objects[0]!.properties).toEqual([{ name: 'n', type: 'string', required: false }])
  })

  test('unsupported constructs produce warnings, not crashes', () => {
    const schema: Record<string, unknown> = {
      $schema: SCHEMA_URI,
      title: 'M',
      $defs: {
        Weird: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        Fine: { type: 'object', properties: {} },
      },
    }
    const { model, warnings } = parse(schema)
    expect(model.objects.map((o) => o.name)).toEqual(['Fine'])
    expect(warnings.length).toBeGreaterThan(0)
  })

  test('ref to a missing def produces a warning and skips the relation', () => {
    const schema: Record<string, unknown> = {
      $schema: SCHEMA_URI,
      title: 'M',
      $defs: {
        User: { type: 'object', properties: { pet: { $ref: '#/$defs/Ghost' } } },
      },
    }
    const { model, warnings } = parse(schema)
    expect(model.relations).toEqual([])
    expect(warnings.some((w) => w.includes('Ghost'))).toBe(true)
  })

  test('untitled schema falls back to a default title and empty defs', () => {
    const { model, warnings } = parse({ $schema: SCHEMA_URI })
    expect(model).toEqual({ title: 'Untitled Model', objects: [], relations: [] })
    expect(warnings).toEqual([])
  })

  test('non-object input throws', () => {
    expect(() => parse(null as unknown as Record<string, unknown>)).toThrow()
    expect(() => parse('nope' as unknown as Record<string, unknown>)).toThrow()
  })
})

describe('inverse round-trip', () => {
  test('serialize → parse folds the pair back into one relation', async () => {
    const { serialize } = await import('./serialize')
    const model = {
      title: 'M',
      objects: [
        { id: 'Realm', name: 'Realm', properties: [], position: { x: 1, y: 2 } },
        { id: 'World', name: 'World', properties: [], position: { x: 3, y: 4 } },
      ],
      relations: [
        {
          id: 'Realm.world',
          sourceId: 'Realm',
          targetId: 'World',
          propertyName: 'world',
          cardinality: 'one' as const,
          kind: 'ref' as const,
          inverse: { propertyName: 'realms', cardinality: 'many' as const },
        },
      ],
    }
    const { model: parsed, warnings } = parse(serialize(model) as Record<string, unknown>)
    expect(warnings).toEqual([])
    expect(parsed.relations).toHaveLength(1)
    const rel = parsed.relations[0]!
    expect(rel.propertyName).toBe('world')
    expect(rel.cardinality).toBe('one')
    expect(rel.sourceId).toBe('Realm')
    expect(rel.targetId).toBe('World')
    expect(rel.inverse).toEqual({ propertyName: 'realms', cardinality: 'many' })
  })

  test('unpaired back-references stay as independent relations', () => {
    const schema = {
      title: 'M',
      $defs: {
        A: { type: 'object', properties: { b: { $ref: '#/$defs/B' } } },
        B: { type: 'object', properties: { a: { $ref: '#/$defs/A' } } },
      },
    }
    const { model } = parse(schema as Record<string, unknown>)
    expect(model.relations).toHaveLength(2)
  })
})

describe('stable ids', () => {
  test('uuid object ids survive serialize → parse round-trips', async () => {
    const { serialize } = await import('./serialize')
    const model = {
      title: 'M',
      objects: [
        {
          id: '019394a0-0000-7000-8000-000000000001',
          name: 'Realm',
          properties: [],
          position: { x: 0, y: 0 },
        },
      ],
      relations: [],
    }
    const { model: parsed } = parse(serialize(model) as Record<string, unknown>)
    expect(parsed.objects[0]!.id).toBe('019394a0-0000-7000-8000-000000000001')
  })

  test('objects without persisted ids get minted UUIDv7 ids, not names', () => {
    const { model } = parse({
      title: 'M',
      $defs: { Thing: { type: 'object', properties: {} } },
    })
    expect(model.objects[0]!.name).toBe('Thing')
    expect(model.objects[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
  })
})
