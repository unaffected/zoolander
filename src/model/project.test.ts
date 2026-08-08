import { describe, expect, test } from 'bun:test'
import type { DataModel } from './types'
import { SCHEMA_URI } from './types'
import { fileNameFor, parseProject, serializeProject, validateProject } from './project'

const fullModel: DataModel = {
  title: 'Blog',
  objects: [
    {
      id: 'User',
      name: 'User',
      description: 'A user',
      position: { x: 10, y: 20 },
      properties: [
        { name: 'name', type: 'string', required: true, minLength: 1 },
        { name: 'role', type: 'string', required: false, enum: ['admin', 'member'] },
      ],
    },
    {
      id: 'Post',
      name: 'Post',
      position: { x: 300, y: 20 },
      properties: [{ name: 'body', type: 'string', required: true }],
    },
    { id: 'Admin', name: 'Admin', position: { x: 10, y: 200 }, properties: [] },
  ],
  relations: [
    { id: 'User.posts', sourceId: 'User', targetId: 'Post', propertyName: 'posts', cardinality: 'many', kind: 'ref' },
    { id: 'Admin->extends->User', sourceId: 'Admin', targetId: 'User', propertyName: '', cardinality: 'one', kind: 'inheritance' },
  ],
}

describe('serializeProject', () => {
  test('emits one file per object with cross-file refs', () => {
    const files = serializeProject(fullModel) as Record<string, any>
    expect(Object.keys(files).sort()).toEqual(['Admin.schema.json', 'Post.schema.json', 'User.schema.json'])
    const user = files['User.schema.json']
    expect(user.$schema).toBe(SCHEMA_URI)
    expect(user.$id).toBe('User.schema.json')
    expect(user.title).toBe('User')
    expect(user.properties.posts).toEqual({ type: 'array', items: { $ref: 'Post.schema.json' } })
    expect(user['x-zoolander']).toEqual({ id: 'User', position: { x: 10, y: 20 } })
    expect(files['Admin.schema.json'].allOf).toEqual([{ $ref: 'User.schema.json' }])
  })
})

describe('parseProject', () => {
  test('round-trip: parseProject(serializeProject(model)) equals model', () => {
    const { model, warnings } = parseProject(serializeProject(fullModel))
    expect(warnings).toEqual([])
    expect(model.objects).toEqual(fullModel.objects)
    expect(model.relations).toEqual(fullModel.relations)
  })

  test('accepts ./-prefixed refs and falls back to filename for missing title', () => {
    const files: Record<string, Record<string, unknown>> = {
      'A.schema.json': {
        $schema: SCHEMA_URI,
        type: 'object',
        properties: { b: { $ref: './B.schema.json' } },
      },
      'B.schema.json': { $schema: SCHEMA_URI, type: 'object', properties: {} },
    }
    const { model, warnings } = parseProject(files)
    expect(warnings).toEqual([])
    expect(model.objects.map((o) => o.name).sort()).toEqual(['A', 'B'])
    // Ids are minted (UUIDv7) when files carry none — resolve via names.
    const idOf = (name: string) => model.objects.find((o) => o.name === name)!.id
    expect(model.relations[0]).toMatchObject({
      sourceId: idOf('A'),
      targetId: idOf('B'),
      cardinality: 'one',
    })
  })

  test('ref to a missing file warns and skips', () => {
    const files: Record<string, Record<string, unknown>> = {
      'A.schema.json': {
        $schema: SCHEMA_URI,
        type: 'object',
        properties: { g: { $ref: 'Ghost.schema.json' } },
      },
    }
    const { model, warnings } = parseProject(files)
    expect(model.relations).toEqual([])
    expect(warnings.some((w) => w.includes('Ghost'))).toBe(true)
  })
})

describe('validateProject', () => {
  test('serialized project validates', () => {
    const result = validateProject(serializeProject(fullModel))
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('dangling cross-file ref is invalid', () => {
    const result = validateProject({
      'A.schema.json': {
        $schema: SCHEMA_URI,
        type: 'object',
        properties: { g: { $ref: 'Ghost.schema.json' } },
      },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Ghost'))).toBe(true)
  })
})

describe('fileNameFor', () => {
  test('maps object name to schema file name', () => {
    expect(fileNameFor('User')).toBe('User.schema.json')
  })
})

describe('project inverse round-trip', () => {
  test('serializeProject → parseProject keeps one two-ended relation', () => {
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
    const files = serializeProject(model)
    expect((files['Realm.schema.json'] as any)['x-zoolander'].inverses).toEqual([
      { source: 'Realm', property: 'world', inverseProperty: 'realms' },
    ])
    const { model: parsed, warnings } = parseProject(files)
    expect(warnings).toEqual([])
    expect(parsed.relations).toHaveLength(1)
    expect(parsed.relations[0]!.inverse).toEqual({ propertyName: 'realms', cardinality: 'many' })
  })
})
