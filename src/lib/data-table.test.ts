import { describe, expect, test } from 'bun:test'
import type { DataModel } from '@/model/types'
import { relationIds, tableColumns } from './data-table'

const model: DataModel = {
  title: 'T',
  objects: [
    {
      id: 'world',
      name: 'World',
      position: { x: 0, y: 0 },
      properties: [
        { name: 'p1', type: 'string', required: false },
        { name: 'p2', type: 'string', required: false },
        { name: 'p3', type: 'string', required: false },
        { name: 'p4', type: 'string', required: false },
        { name: 'p5', type: 'string', required: false },
      ],
    },
    { id: 'region', name: 'Region', position: { x: 0, y: 0 }, properties: [] },
  ],
  relations: [
    {
      id: 'r1',
      sourceId: 'world',
      targetId: 'region',
      propertyName: 'regions',
      cardinality: 'many',
      kind: 'ref',
      inverse: { propertyName: 'world', cardinality: 'one' },
    },
  ],
}

describe('tableColumns', () => {
  test('id column always comes first', () => {
    for (const objectId of ['world', 'region']) {
      expect(tableColumns(model, objectId)[0]).toEqual({ kind: 'id', name: 'id' })
    }
  })

  test('an object with no scalar properties still gets its relation columns', () => {
    const cols = tableColumns(model, 'region')
    expect(cols).toEqual([
      { kind: 'id', name: 'id' },
      { kind: 'relation', name: 'world', targetObjectId: 'world', cardinality: 'one' },
    ])
  })

  test('scalar columns are capped at 4, relations still included', () => {
    const cols = tableColumns(model, 'world')
    expect(cols.filter((c) => c.kind === 'scalar')).toHaveLength(4)
    expect(cols.at(-1)).toEqual({
      kind: 'relation',
      name: 'regions',
      targetObjectId: 'region',
      cardinality: 'many',
    })
  })

  test('unknown object yields only the id column', () => {
    expect(tableColumns(model, 'nope')).toEqual([{ kind: 'id', name: 'id' }])
  })
})

describe('relationIds', () => {
  test('normalizes one/many/absent values to a string array', () => {
    expect(relationIds('abc')).toEqual(['abc'])
    expect(relationIds(['a', 'b'])).toEqual(['a', 'b'])
    expect(relationIds(undefined)).toEqual([])
    expect(relationIds(null)).toEqual([])
    expect(relationIds('')).toEqual([])
    expect(relationIds([1, 'a'])).toEqual(['a'])
  })
})
