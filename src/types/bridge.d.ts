export interface MenuActionMessage {
  action: string
  payload?: unknown
}

export interface MenuSyncState {
  projects: { id: string; name: string }[]
  currentProjectId: string | null
  theme: 'light' | 'dark' | 'system'
  minimap: boolean
  grid: boolean
  layoutDirection: 'LR' | 'TB'
  layoutSpacing: 'compact' | 'comfortable' | 'spacious'
}

export interface RecordDTO {
  id: string
  objectId: string
  data: unknown
  createdAt: string
  updatedAt: string
}

export interface RecordsBridge {
  find: (projectId: string, objectId: string) => Promise<RecordDTO[]>
  get: (id: string) => Promise<RecordDTO | null>
  create: (projectId: string, objectId: string, id: string, data: unknown) => Promise<RecordDTO>
  patch: (id: string, data: unknown) => Promise<RecordDTO | null>
  remove: (id: string) => Promise<void>
}

export interface DbBridge {
  records: RecordsBridge
  listProjects: () => Promise<{ id: string; name: string }[]>
  createProject: (name: string, id: string) => Promise<{ id: string; name: string }>
  deleteProject: (id: string) => Promise<void>
  loadModel: (id: string) => Promise<unknown | null>
  saveModel: (id: string, model: unknown, action: string, coalesced: number) => Promise<void>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
}

export interface ZoolanderBridge {
  openFile: () => Promise<{ path: string; text: string } | null>
  saveFile: (text: string, path?: string) => Promise<string | null>
  chooseDir: () => Promise<string | null>
  readDir: (dir: string) => Promise<Record<string, string> | null>
  writeFiles: (dir: string, files: Record<string, string>) => Promise<boolean>
  exportArchive: (defaultName: string, files: Record<string, string>) => Promise<string | null>
  onMenuAction: (callback: (message: MenuActionMessage) => void) => () => void
  syncMenu: (state: MenuSyncState) => void
  db: DbBridge
}

declare global {
  interface Window {
    zoolander?: ZoolanderBridge
  }
}
