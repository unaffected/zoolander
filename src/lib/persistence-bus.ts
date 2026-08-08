import type { DataModel } from '@/model/types'
import { useStore } from '@/state/store'
import { getProjectStore } from './project-store'

const DEBOUNCE_MS = 250

interface PendingSave {
  projectId: string
  model: DataModel
  action: string
  count: number
}

let timer: ReturnType<typeof setTimeout> | null = null
let pending: PendingSave | null = null

/** Write the pending autosave (event + snapshot) immediately. */
export async function flushPersistence(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const batch = pending
  pending = null
  if (!batch) return
  await getProjectStore().saveModel(batch.projectId, batch.model, batch.action, batch.count)
}

/** Drop the pending autosave without writing (e.g. the project was deleted). */
export function discardPersistence(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  pending = null
}

/**
 * Autosave pipeline: every store mutation is captured; rapid same-project
 * commits coalesce for 250 ms, then one event + snapshot lands in the store.
 */
export function startPersistence(): () => void {
  let warnedNoProject = false
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.model === prev.model) return
    // 'load' marks project activation, not a user edit.
    if (state.lastAction === 'load') return
    if (!state.projectId) {
      // Editing without an active project would silently discard changes.
      if (!warnedNoProject) {
        warnedNoProject = true
        void import('sonner').then(({ toast }) =>
          toast.error('No active project — these changes are not being saved.'),
        )
      }
      return
    }
    warnedNoProject = false
    pending = {
      projectId: state.projectId,
      model: state.model,
      action: state.lastAction ?? 'edit',
      count: pending?.projectId === state.projectId ? (pending?.count ?? 0) + 1 : 1,
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flushPersistence()
    }, DEBOUNCE_MS)
  })
  const onBeforeUnload = () => void flushPersistence()
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    unsubscribe()
    window.removeEventListener('beforeunload', onBeforeUnload)
    void flushPersistence()
  }
}
