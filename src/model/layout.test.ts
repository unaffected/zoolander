import { describe, expect, test } from 'bun:test'
import type { DataModel } from './types'
import { autoLayout } from './layout'

const model: DataModel = {
  title: 'M',
  objects: [
    {
      id: 'User',
      name: 'User',
      position: { x: 0, y: 0 },
      properties: [{ name: 'name', type: 'string', required: true }],
    },
    { id: 'Post', name: 'Post', position: { x: 0, y: 0 }, properties: [] },
  ],
  relations: [
    { id: 'User.posts', sourceId: 'User', targetId: 'Post', propertyName: 'posts', cardinality: 'many', kind: 'ref' },
  ],
}

describe('autoLayout', () => {
  test('assigns distinct finite positions', () => {
    const laid = autoLayout(model)
    const [a, b] = laid.objects
    expect(Number.isFinite(a!.position.x)).toBe(true)
    expect(Number.isFinite(a!.position.y)).toBe(true)
    expect(Number.isFinite(b!.position.x)).toBe(true)
    expect(Number.isFinite(b!.position.y)).toBe(true)
    expect(a!.position).not.toEqual(b!.position)
  })

  test('does not mutate the input model', () => {
    const before = JSON.parse(JSON.stringify(model))
    autoLayout(model)
    expect(model).toEqual(before)
  })
})
