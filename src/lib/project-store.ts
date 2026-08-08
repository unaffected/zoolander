import type { DataModel } from '@/model/types'
import { uuidv7 } from '@/model/uuid'
import type { DbBridge } from '@/types/bridge'

export interface ProjectMeta {
  id: string
  name: string
}

/**
 * Async project storage facade. Electron routes to SQLite in the main process
 * (the source of truth). Plain-browser dev — which we never ship — gets a
 * throwaway in-memory store so the app still renders.
 */
export interface ProjectStore {
  list(): Promise<ProjectMeta[]>
  create(name: string): Promise<ProjectMeta>
  remove(id: string): Promise<void>
  loadModel(id: string): Promise<DataModel | null>
  saveModel(id: string, model: DataModel, action: string, coalesced: number): Promise<void>
  getCurrentId(): Promise<string | null>
  setCurrentId(id: string): Promise<void>
}

function sqliteStore(db: DbBridge): ProjectStore {
  return {
    list: () => db.listProjects(),
    create: (name) => db.createProject(name, uuidv7()),
    remove: (id) => db.deleteProject(id),
    loadModel: async (id) => (await db.loadModel(id)) as DataModel | null,
    saveModel: (id, model, action, coalesced) => db.saveModel(id, model, action, coalesced),
    getCurrentId: () => db.getSetting('currentProjectId'),
    setCurrentId: (id) => db.setSetting('currentProjectId', id),
  }
}

const memory = {
  projects: [] as ProjectMeta[],
  models: new Map<string, DataModel>(),
  currentId: null as string | null,
}

const memoryStore: ProjectStore = {
  list: async () => [...memory.projects],
  create: async (name) => {
    const meta = { id: uuidv7(), name }
    memory.projects.push(meta)
    return meta
  },
  remove: async (id) => {
    memory.projects = memory.projects.filter((p) => p.id !== id)
    memory.models.delete(id)
  },
  loadModel: async (id) => memory.models.get(id) ?? null,
  saveModel: async (id, model) => {
    memory.models.set(id, model)
    const meta = memory.projects.find((p) => p.id === id)
    if (meta && meta.name !== model.title) meta.name = model.title
  },
  getCurrentId: async () => memory.currentId,
  setCurrentId: async (id) => {
    memory.currentId = id
  },
}

export function getProjectStore(): ProjectStore {
  const db = window.zoolander?.db
  return db ? sqliteStore(db) : memoryStore
}
