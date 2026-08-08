import { autoLayout } from '@/model/layout'
import { parseProject } from '@/model/project'
import { useStore } from '@/state/store'
import { discardPersistence, flushPersistence } from './persistence-bus'
import { getProjectStore } from './project-store'

async function refreshContext(): Promise<void> {
  const store = getProjectStore()
  const [currentId, projects] = await Promise.all([store.getCurrentId(), store.list()])
  useStore.getState().setProjectContext(currentId, projects)
}

async function activate(id: string): Promise<void> {
  const store = getProjectStore()
  await store.setCurrentId(id)
  const model = (await store.loadModel(id)) ?? {
    title: 'Untitled',
    objects: [],
    relations: [],
  }
  useStore.getState().loadModel(model)
  await refreshContext()
}

export async function bootProjects(): Promise<void> {
  try {
    const store = getProjectStore()
    let projects = await store.list()
    if (projects.length === 0) {
      // Blank slate: one empty project, no seed content.
      const meta = await store.create('Untitled')
      await store.saveModel(meta.id, { title: meta.name, objects: [], relations: [] }, 'create', 1)
      projects = await store.list()
    }
    const currentId = await store.getCurrentId()
    const id = projects.some((p) => p.id === currentId) ? currentId! : projects[0]!.id
    await activate(id)
  } catch (err) {
    console.error('bootProjects failed:', err)
    const { toast } = await import('sonner')
    toast.error(
      `Couldn't load projects: ${err instanceof Error ? err.message : String(err)}. Changes will not be saved.`,
    )
  }
}

export async function switchProject(id: string): Promise<void> {
  await flushPersistence()
  await activate(id)
}

export async function createProjectAndSwitch(name: string): Promise<void> {
  await flushPersistence()
  const store = getProjectStore()
  const meta = await store.create(name || 'Untitled')
  await store.saveModel(meta.id, { title: meta.name, objects: [], relations: [] }, 'create', 1)
  await activate(meta.id)
}

export async function deleteCurrentProject(): Promise<void> {
  const id = useStore.getState().projectId
  if (!id) return
  discardPersistence()
  const store = getProjectStore()
  await store.remove(id)
  const remaining = await store.list()
  if (remaining.length === 0) {
    const meta = await store.create('Untitled')
    await store.saveModel(meta.id, { title: meta.name, objects: [], relations: [] }, 'create', 1)
    await activate(meta.id)
  } else {
    await activate(remaining[0]!.id)
  }
}

/** Refresh the project list shown in the switcher (names may change via title edits). */
export function refreshProjects(): void {
  void refreshContext()
}

export interface OpenFolderResult {
  ok: boolean
  warnings: string[]
  error?: string
}

/** Import a folder of *.schema.json files as a new project (one-shot; no folder link). */
export async function openFolderAsProject(): Promise<OpenFolderResult | null> {
  if (!window.zoolander) return null
  const dir = await window.zoolander.chooseDir()
  if (!dir) return null
  const raw = await window.zoolander.readDir(dir)
  if (!raw || Object.keys(raw).length === 0) {
    return { ok: false, warnings: [], error: 'No .schema.json files in that folder.' }
  }
  const files: Record<string, Record<string, unknown>> = {}
  for (const [name, text] of Object.entries(raw)) {
    try {
      files[name] = JSON.parse(text)
    } catch {
      return { ok: false, warnings: [], error: `${name} is not valid JSON.` }
    }
  }
  const { model, warnings } = parseProject(files)
  const dirName = dir.split('/').filter(Boolean).at(-1) ?? 'Imported'
  const positioned = model.objects.every((o) => o.position.x === 0 && o.position.y === 0)
    ? autoLayout(model)
    : model
  await flushPersistence()
  const store = getProjectStore()
  const meta = await store.create(dirName)
  await store.saveModel(meta.id, { ...positioned, title: dirName }, 'import', 1)
  await activate(meta.id)
  return { ok: true, warnings }
}
