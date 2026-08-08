import { describe, expect, test } from 'bun:test'
import { uuidv7 } from './uuid'

describe('uuidv7', () => {
  test('matches the v7 format', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('is unique and time-ordered across calls', () => {
    const ids = Array.from({ length: 200 }, () => uuidv7())
    expect(new Set(ids).size).toBe(200)
    // Timestamp prefix is non-decreasing when generated in sequence.
    const prefixes = ids.map((id) => id.slice(0, 13))
    expect([...prefixes].sort()).toEqual(prefixes)
  })
})
