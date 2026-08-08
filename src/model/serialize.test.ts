import { describe, expect, test } from 'bun:test'
import type { DataModel } from './types'
import { SCHEMA_URI } from './types'
import { serialize } from './serialize'

const emptyModel: DataModel = { title: 'Empty', objects: [], relations: [] }

describe('serialize', () => {
  test('empty model produces a bare 2020-12 document', () => {
    expect(serialize(emptyModel)).toEqual({
      $schema: SCHEMA_URI,
      $id: 'urn:zoolander:model',
      title: 'Empty',
      $defs: {},
      'x-zoolander': { positions: {}, ids: {} },
    })
  })

  test('object with scalar properties, required, description, enum, format', () => {
    const model: DataModel = {
      title: 'M',
      objects: [
        {
          id: 'User',
          name: 'User',
          description: 'A user',
          position: { x: 10.4, y: 20.6 },
          properties: [
            { name: 'name', type: 'string', required: true },
            { name: 'age', type: 'integer', required: false, description: 'Years' },
            { name: 'role', type: 'string', required: false, enum: ['admin', 'member'] },
            { name: 'email', type: 'string', required: true, format: 'email' },
          ],
        },
      ],
      relations: [],
    }
    const schema = serialize(model) as any
    expect(schema.$defs.User).toEqual({
      type: 'object',
      title: 'User',
      description: 'A user',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', description: 'Years' },
        role: { type: 'string', enum: ['admin', 'member'] },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'email'],
    })
    expect(schema['x-zoolander'].positions.User).toEqual({ x: 10, y: 21 })
  })

  test('validation rules serialize onto properties', () => {
    const model: DataModel = {
      title: 'M',
      objects: [
        {
          id: 'Thing',
          name: 'Thing',
          position: { x: 0, y: 0 },
          properties: [
            { name: 'slug', type: 'string', required: false, minLength: 2, maxLength: 40, pattern: '^[a-z-]+$' },
            { name: 'count', type: 'integer', required: false, minimum: 0, maximum: 100 },
          ],
        },
      ],
      relations: [],
    }
    const schema = serialize(model) as any
    expect(schema.$defs.Thing.properties.slug).toEqual({
      type: 'string',
      minLength: 2,
      maxLength: 40,
      pattern: '^[a-z-]+$',
    })
    expect(schema.$defs.Thing.properties.count).toEqual({ type: 'integer', minimum: 0, maximum: 100 })
  })

  test('one-to-one relation becomes a direct $ref property', () => {
    const model: DataModel = {
      title: 'M',
      objects: [
        { id: 'User', name: 'User', properties: [], position: { x: 0, y: 0 } },
        { id: 'Image', name: 'Image', properties: [], position: { x: 0, y: 0 } },
      ],
      relations: [
        { id: 'User.avatar', sourceId: 'User', targetId: 'Image', propertyName: 'avatar', cardinality: 'one', kind: 'ref' },
      ],
    }
    const schema = serialize(model) as any
    expect(schema.$defs.User.properties.avatar).toEqual({ $ref: '#/$defs/Image' })
  })

  test('one-to-many relation becomes an array items $ref', () => {
    const model: DataModel = {
      title: 'M',
      objects: [
        { id: 'User', name: 'User', properties: [], position: { x: 0, y: 0 } },
        { id: 'Post', name: 'Post', properties: [], position: { x: 0, y: 0 } },
      ],
      relations: [
        { id: 'User.posts', sourceId: 'User', targetId: 'Post', propertyName: 'posts', cardinality: 'many', kind: 'ref' },
      ],
    }
    const schema = serialize(model) as any
    expect(schema.$defs.User.properties.posts).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/Post' },
    })
  })

  test('inheritance relation becomes allOf on the source def', () => {
    const model: DataModel = {
      title: 'M',
      objects: [
        { id: 'User', name: 'User', properties: [], position: { x: 0, y: 0 } },
        { id: 'Admin', name: 'Admin', properties: [], position: { x: 0, y: 0 } },
      ],
      relations: [
        { id: 'Admin->extends->User', sourceId: 'Admin', targetId: 'User', propertyName: '', cardinality: 'one', kind: 'inheritance' },
      ],
    }
    const schema = serialize(model) as any
    expect(schema.$defs.Admin.allOf).toEqual([{ $ref: '#/$defs/User' }])
  })
})

describe('inverse relations', () => {
  const model: DataModel = {
    title: 'M',
    objects: [
      { id: 'Realm', name: 'Realm', properties: [], position: { x: 0, y: 0 } },
      { id: 'World', name: 'World', properties: [], position: { x: 0, y: 0 } },
    ],
    relations: [
      {
        id: 'Realm.world',
        sourceId: 'Realm',
        targetId: 'World',
        propertyName: 'world',
        cardinality: 'one',
        kind: 'ref',
        inverse: { propertyName: 'realms', cardinality: 'many' },
      },
    ],
  }

  test('inverse end is emitted on the target def', () => {
    const schema = serialize(model) as any
    expect(schema.$defs.Realm.properties.world).toEqual({ $ref: '#/$defs/World' })
    expect(schema.$defs.World.properties.realms).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/Realm' },
    })
  })

  test('inverse pairs are recorded in the extension', () => {
    const schema = serialize(model) as any
    expect(schema['x-zoolander'].inverses).toEqual([
      { source: 'Realm', property: 'world', inverseProperty: 'realms' },
    ])
  })
})
