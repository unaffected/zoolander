import { serializeProject, fileNameFor } from '@/model/project'
import type { DataModel } from '@/model/types'
import { getRecordStore } from './record-store'

/**
 * Archive layout: schema/<Resource>.schema.json (one schema per resource) and
 * data/<Resource>.json (every record of that resource, verbatim rows).
 */
export async function buildArchiveFiles(
  model: DataModel,
  projectId: string,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const [name, doc] of Object.entries(serializeProject(model))) {
    files[`schema/${name}`] = JSON.stringify(doc, null, 2) + '\n'
  }
  const store = getRecordStore()
  for (const resource of model.objects) {
    const records = await store.find(projectId, resource.id)
    files[`data/${fileNameFor(resource.name).replace(/\.schema\.json$/, '.json')}`] =
      JSON.stringify(records, null, 2) + '\n'
  }
  return files
}
