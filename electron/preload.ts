import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('zoolander', {
  openFile: () => ipcRenderer.invoke('zoolander:open'),
  saveFile: (text: string, path?: string) => ipcRenderer.invoke('zoolander:save', text, path),
  chooseDir: () => ipcRenderer.invoke('zoolander:choose-dir'),
  readDir: (dir: string) => ipcRenderer.invoke('zoolander:read-dir', dir),
  writeFiles: (dir: string, files: Record<string, string>) =>
    ipcRenderer.invoke('zoolander:write-files', dir, files),
  exportArchive: (defaultName: string, files: Record<string, string>) =>
    ipcRenderer.invoke('zoolander:export-archive', defaultName, files),
  onMenuAction: (callback: (message: { action: string; payload?: unknown }) => void) => {
    const listener = (_event: IpcRendererEvent, message: { action: string; payload?: unknown }) =>
      callback(message)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
  syncMenu: (state: {
    projects: { id: string; name: string }[]
    currentProjectId: string | null
    theme: 'light' | 'dark' | 'system'
    minimap: boolean
    grid: boolean
    layoutDirection: 'LR' | 'TB'
    layoutSpacing: 'compact' | 'comfortable' | 'spacious'
  }) => ipcRenderer.send('menu:sync', state),
  db: {
    listProjects: () => ipcRenderer.invoke('db:list-projects'),
    createProject: (name: string, id: string) => ipcRenderer.invoke('db:create-project', name, id),
    deleteProject: (id: string) => ipcRenderer.invoke('db:delete-project', id),
    loadModel: (id: string) => ipcRenderer.invoke('db:load-model', id),
    saveModel: (id: string, model: unknown, action: string, coalesced: number) =>
      ipcRenderer.invoke('db:save-model', id, model, action, coalesced),
    getSetting: (key: string) => ipcRenderer.invoke('db:get-setting', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('db:set-setting', key, value),
    records: {
      find: (projectId: string, objectId: string) =>
        ipcRenderer.invoke('db:records:find', projectId, objectId),
      get: (id: string) => ipcRenderer.invoke('db:records:get', id),
      create: (projectId: string, objectId: string, id: string, data: unknown) =>
        ipcRenderer.invoke('db:records:create', projectId, objectId, id, data),
      patch: (id: string, data: unknown) => ipcRenderer.invoke('db:records:patch', id, data),
      remove: (id: string) => ipcRenderer.invoke('db:records:remove', id),
    },
  },
})
