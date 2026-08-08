import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  applyPragmas,
  createProject,
  deleteProject,
  getSetting,
  listProjects,
  loadModel,
  MIGRATIONS,
  runMigrations,
  saveModel,
  setSetting,
  type Migration,
  type SqlDatabase,
} from './db'

function freshDb(): SqlDatabase {
  const db = new Database(':memory:') as unknown as SqlDatabase
  applyPragmas(db)
  runMigrations(db, MIGRATIONS)
  return db
}

describe('runMigrations', () => {
  test('applies pending migrations in order and records versions', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    const order: number[] = []
    const migrations: Migration[] = [
      { version: 1, name: 'one', up: () => order.push(1) },
      { version: 2, name: 'two', up: () => order.push(2) },
    ]
    expect(runMigrations(db, migrations)).toEqual([1, 2])
    expect(order).toEqual([1, 2])
    // Re-running applies nothing.
    expect(runMigrations(db, migrations)).toEqual([])
    // An update appends migration 3; only it runs.
    migrations.push({ version: 3, name: 'three', up: () => order.push(3) })
    expect(runMigrations(db, migrations)).toEqual([3])
    expect(order).toEqual([1, 2, 3])
  })

  test('rejects non-ascending versions', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    const bad: Migration[] = [
      { version: 2, name: 'two', up: () => {} },
      { version: 1, name: 'one', up: () => {} },
    ]
    expect(() => runMigrations(db, bad)).toThrow(/ascending/)
  })

  test('refuses to open a newer database', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    runMigrations(db, [
      { version: 1, name: 'one', up: () => {} },
      { version: 2, name: 'two', up: () => {} },
    ])
    expect(() => runMigrations(db, [{ version: 1, name: 'one', up: () => {} }])).toThrow(/newer/)
  })

  test('rolls back a failing migration and stops', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    const migrations: Migration[] = [
      { version: 1, name: 'ok', up: (d) => d.exec('CREATE TABLE a(x)') },
      {
        version: 2,
        name: 'boom',
        up: (d) => {
          d.exec('CREATE TABLE b(x)')
          throw new Error('boom')
        },
      },
    ]
    expect(() => runMigrations(db, migrations)).toThrow('boom')
    // Migration 1 committed, migration 2 fully rolled back.
    db.exec('INSERT INTO a VALUES (1)')
    expect(() => db.exec('INSERT INTO b VALUES (1)')).toThrow()
    const row = db.prepare('SELECT max(version) AS v FROM schema_migrations').get() as {
      v: number
    }
    expect(row.v).toBe(1)
  })
})

describe('project store', () => {
  test('project crud round-trips', () => {
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    createProject(db, 'Beta', 'b')
    expect(listProjects(db)).toEqual([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ])
    deleteProject(db, 'a')
    expect(listProjects(db).map((p) => p.id)).toEqual(['b'])
  })

  test('saveModel stores snapshot + event, syncs name, loadModel returns latest', () => {
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    saveModel(db, 'a', { title: 'Renamed', objects: [] }, 'setTitle', 3)
    saveModel(db, 'a', { title: 'Renamed', objects: [1] }, 'addObject', 1)
    expect(loadModel(db, 'a')).toEqual({ title: 'Renamed', objects: [1] })
    expect(listProjects(db)).toEqual([{ id: 'a', name: 'Renamed' }])
    const events = db.prepare('SELECT action, payload FROM events ORDER BY id').all() as {
      action: string
      payload: string | null
    }[]
    expect(events).toEqual([
      { action: 'setTitle', payload: JSON.stringify({ coalesced: 3 }) },
      { action: 'addObject', payload: null },
    ])
  })

  test('snapshots are pruned to the last 20 per project', () => {
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    createProject(db, 'Beta', 'b')
    for (let i = 1; i <= 25; i++) saveModel(db, 'a', { title: 'Alpha', i }, 'edit', 1)
    saveModel(db, 'b', { title: 'Beta' }, 'edit', 1)
    const count = (id: string) =>
      (db.prepare('SELECT count(*) AS n FROM snapshots WHERE project_id = ?').get(id) as {
        n: number
      }).n
    expect(count('a')).toBe(20)
    expect(count('b')).toBe(1)
    expect(loadModel(db, 'a')).toEqual({ title: 'Alpha', i: 25 })
  })

  test('deleting a project cascades to its events and snapshots', () => {
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    saveModel(db, 'a', { title: 'Alpha' }, 'edit', 1)
    deleteProject(db, 'a')
    const n = (table: string) =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    expect(n('snapshots')).toBe(0)
    expect(n('events')).toBe(0)
  })

  test('settings upsert', () => {
    const db = freshDb()
    expect(getSetting(db, 'currentProjectId')).toBeNull()
    setSetting(db, 'currentProjectId', 'a')
    setSetting(db, 'currentProjectId', 'b')
    expect(getSetting(db, 'currentProjectId')).toBe('b')
  })
})

describe('records', () => {
  test('crud round-trips and scopes by project + object', async () => {
    const { createRecord, findRecords, getRecord, patchRecord, removeRecord } = await import('./db')
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    createProject(db, 'Beta', 'b')
    const rec = createRecord(db, 'a', 'User', 'r1', { name: 'Ada' })
    createRecord(db, 'a', 'Post', 'r2', { title: 'Hi' })
    createRecord(db, 'b', 'User', 'r3', { name: 'Bob' })
    expect(rec.data).toEqual({ name: 'Ada' })
    expect(findRecords(db, 'a', 'User').map((r) => r.id)).toEqual(['r1'])
    expect(findRecords(db, 'b', 'User').map((r) => r.id)).toEqual(['r3'])
    const patched = patchRecord(db, 'r1', { name: 'Ada L' })
    expect(patched?.data).toEqual({ name: 'Ada L' })
    expect(getRecord(db, 'r1')?.data).toEqual({ name: 'Ada L' })
    removeRecord(db, 'r1')
    expect(getRecord(db, 'r1')).toBeNull()
  })

  test('deleting a project cascades to its records', async () => {
    const { createRecord, findRecords } = await import('./db')
    const db = freshDb()
    createProject(db, 'Alpha', 'a')
    createRecord(db, 'a', 'User', 'r1', { name: 'Ada' })
    deleteProject(db, 'a')
    const n = (db.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
    expect(n).toBe(0)
    expect(findRecords(db, 'a', 'User')).toEqual([])
  })
})

describe('initial schema migration', () => {
  test('is idempotent over a dev database that already has tables', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    applyPragmas(db)
    runMigrations(db, MIGRATIONS)
    // Wipe the version stamp and rerun — DDL must not fail or drop data.
    createProject(db, 'Alpha', 'a')
    db.exec('DELETE FROM schema_migrations')
    runMigrations(db, MIGRATIONS)
    expect(listProjects(db).map((p) => p.id)).toEqual(['a'])
  })

  test('converges a dev database whose records were keyed by object_name', () => {
    const db = new Database(':memory:') as unknown as SqlDatabase
    applyPragmas(db)
    db.exec(`CREATE TABLE records (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      object_name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.prepare("INSERT INTO records (id, project_id, object_name, data) VALUES ('r1', 'a', 'x', '{}')").run()
    runMigrations(db, MIGRATIONS)
    const row = db.prepare('SELECT object_id FROM records WHERE id = ?').get('r1') as {
      object_id: string
    }
    expect(row.object_id).toBe('x')
  })
})
