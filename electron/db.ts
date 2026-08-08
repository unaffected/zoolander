// Storage layer written against a minimal SQL interface satisfied by both
// node:sqlite (production, Electron main) and bun:sqlite (tests), since bun
// cannot resolve node:sqlite.

export interface SqlStatement {
  run(...params: (string | number | null)[]): unknown
  get(...params: (string | number | null)[]): unknown
  all(...params: (string | number | null)[]): unknown[]
}

export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
}

export interface Migration {
  version: number
  name: string
  up(db: SqlDatabase): void
}

/** WAL + performance pragmas; run once per connection before anything else. */
export function applyPragmas(db: SqlDatabase): void {
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')
  db.exec('PRAGMA busy_timeout=5000')
  db.exec('PRAGMA foreign_keys=ON')
}

/**
 * Apply pending migrations in version order inside transactions. Ships with the
 * app: an update simply appends migrations and startup applies the new tail.
 */
export function runMigrations(db: SqlDatabase, migrations: Migration[]): number[] {
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]!.version <= migrations[i - 1]!.version) {
      throw new Error('migrations must have strictly ascending versions')
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  const row = db.prepare('SELECT max(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  const current = row.v ?? 0
  const latest = migrations.at(-1)?.version ?? 0
  if (current > latest) {
    throw new Error(
      `database schema version ${current} is newer than this build (${latest}); refusing to run`,
    )
  }
  const applied: number[] = []
  for (const migration of migrations) {
    if (migration.version <= current) continue
    db.exec('BEGIN')
    try {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      )
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    applied.push(migration.version)
  }
  return applied
}

// Pre-release: one initial-schema migration, no back-compat machinery. It
// carries version 3 (idempotent DDL) so this week's dev databases converge on
// the same schema regardless of which intermediate build created them; the
// next migration is version 4.
export const MIGRATIONS: Migration[] = [
  {
    version: 3,
    name: 'initial schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          payload TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS events_project ON events(project_id, id);
        CREATE TABLE IF NOT EXISTS snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS snapshots_project ON snapshots(project_id, id);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          object_id TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
      const columns = db.prepare('PRAGMA table_info(records)').all() as { name: string }[]
      if (columns.some((c) => c.name === 'object_name')) {
        db.exec('ALTER TABLE records RENAME COLUMN object_name TO object_id')
      }
      db.exec(
        'CREATE INDEX IF NOT EXISTS records_project_object ON records(project_id, object_id, created_at)',
      )
    },
  },
]

export interface ProjectRow {
  id: string
  name: string
}

const SNAPSHOTS_KEPT = 20

export function listProjects(db: SqlDatabase): ProjectRow[] {
  return db
    .prepare('SELECT id, name FROM projects ORDER BY created_at, id')
    .all() as ProjectRow[]
}

export function createProject(db: SqlDatabase, name: string, id: string): ProjectRow {
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name)
  return { id, name }
}

export function deleteProject(db: SqlDatabase, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function loadModel(db: SqlDatabase, projectId: string): unknown | null {
  const row = db
    .prepare('SELECT model FROM snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1')
    .get(projectId) as { model: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.model)
  } catch {
    return null
  }
}

/**
 * Append an audit event and a full-model snapshot, prune old snapshots, and
 * keep the project name in step with the model title. One call per autosave.
 */
export function saveModel(
  db: SqlDatabase,
  projectId: string,
  model: unknown,
  action: string,
  coalesced: number,
): void {
  const title =
    typeof model === 'object' && model !== null && 'title' in model
      ? String((model as { title: unknown }).title)
      : null
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO events (project_id, action, payload) VALUES (?, ?, ?)').run(
      projectId,
      action,
      coalesced > 1 ? JSON.stringify({ coalesced }) : null,
    )
    db.prepare('INSERT INTO snapshots (project_id, model) VALUES (?, ?)').run(
      projectId,
      JSON.stringify(model),
    )
    db.prepare(
      `DELETE FROM snapshots WHERE project_id = ? AND id NOT IN (
        SELECT id FROM snapshots WHERE project_id = ? ORDER BY id DESC LIMIT ?
      )`,
    ).run(projectId, projectId, SNAPSHOTS_KEPT)
    if (title !== null) {
      db.prepare(
        "UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(title, projectId)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export interface RecordRow {
  id: string
  objectId: string
  data: unknown
  createdAt: string
  updatedAt: string
}

function toRecordRow(raw: {
  id: string
  object_id: string
  data: string
  created_at: string
  updated_at: string
}): RecordRow {
  return {
    id: raw.id,
    objectId: raw.object_id,
    data: JSON.parse(raw.data),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

// Feathers-compatible record service surface: find/get/create/patch/remove.
// Records key on the object's stable id, never its (renamable) name.

export function findRecords(db: SqlDatabase, projectId: string, objectId: string): RecordRow[] {
  const rows = db
    .prepare(
      `SELECT id, object_id, data, created_at, updated_at FROM records
       WHERE project_id = ? AND object_id = ? ORDER BY created_at, id`,
    )
    .all(projectId, objectId)
  return (rows as Parameters<typeof toRecordRow>[0][]).map(toRecordRow)
}

export function getRecord(db: SqlDatabase, id: string): RecordRow | null {
  const row = db
    .prepare('SELECT id, object_id, data, created_at, updated_at FROM records WHERE id = ?')
    .get(id)
  return row ? toRecordRow(row as Parameters<typeof toRecordRow>[0]) : null
}

export function createRecord(
  db: SqlDatabase,
  projectId: string,
  objectId: string,
  id: string,
  data: unknown,
): RecordRow {
  db.prepare('INSERT INTO records (id, project_id, object_id, data) VALUES (?, ?, ?, ?)').run(
    id,
    projectId,
    objectId,
    JSON.stringify(data),
  )
  return getRecord(db, id)!
}

export function patchRecord(db: SqlDatabase, id: string, data: unknown): RecordRow | null {
  db.prepare("UPDATE records SET data = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(data),
    id,
  )
  return getRecord(db, id)
}

export function removeRecord(db: SqlDatabase, id: string): void {
  db.prepare('DELETE FROM records WHERE id = ?').run(id)
}

export function getSetting(db: SqlDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: SqlDatabase, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

