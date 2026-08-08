import { uuidv7 } from '@/model/uuid'
import type { RecordDTO, RecordsBridge } from '@/types/bridge'

/**
 * Feathers-shaped record service (find/get/create/patch/remove), keyed by the
 * object's stable id. Electron routes to SQLite; plain-browser dev — never
 * shipped — gets a throwaway in-memory store.
 */
export interface RecordStore {
  find(projectId: string, objectId: string): Promise<RecordDTO[]>
  create(projectId: string, objectId: string, data: unknown): Promise<RecordDTO>
  patch(id: string, projectId: string, data: unknown): Promise<RecordDTO | null>
  remove(id: string, projectId: string): Promise<void>
}

function sqliteRecords(bridge: RecordsBridge): RecordStore {
  return {
    find: (projectId, objectId) => bridge.find(projectId, objectId),
    create: (projectId, objectId, data) => bridge.create(projectId, objectId, uuidv7(), data),
    patch: (id, _projectId, data) => bridge.patch(id, data),
    remove: (id) => bridge.remove(id),
  }
}

const memory = new Map<string, RecordDTO[]>()

const memoryRecords: RecordStore = {
  find: async (projectId, objectId) =>
    (memory.get(projectId) ?? []).filter((r) => r.objectId === objectId),
  create: async (projectId, objectId, data) => {
    const now = new Date().toISOString()
    const record: RecordDTO = { id: uuidv7(), objectId, data, createdAt: now, updatedAt: now }
    memory.set(projectId, [...(memory.get(projectId) ?? []), record])
    return record
  },
  patch: async (id, projectId, data) => {
    let patched: RecordDTO | null = null
    memory.set(
      projectId,
      (memory.get(projectId) ?? []).map((r) => {
        if (r.id !== id) return r
        patched = { ...r, data, updatedAt: new Date().toISOString() }
        return patched
      }),
    )
    return patched
  },
  remove: async (id, projectId) => {
    memory.set(
      projectId,
      (memory.get(projectId) ?? []).filter((r) => r.id !== id),
    )
  },
}

export function getRecordStore(): RecordStore {
  const bridge = window.zoolander?.db.records
  return bridge ? sqliteRecords(bridge) : memoryRecords
}
