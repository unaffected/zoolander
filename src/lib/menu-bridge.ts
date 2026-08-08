import { toast } from 'sonner'
import { useStore } from '@/state/store'
import {
  createProjectAndSwitch,
  deleteCurrentProject,
  switchProject,
} from './project-session'

export const SEARCH_INPUT_ID = 'toolbar-search'

export interface MenuDialogHandlers {
  openImport: () => void
  openExport: () => void
}

function inTextField(): boolean {
  return Boolean(document.activeElement?.closest('input, textarea, [contenteditable]'))
}

/**
 * Menu accelerators swallow keystrokes before the page sees them, so ⌘Z always
 * arrives here — route to native text undo when a field has focus, else model undo.
 */
function dispatch(message: { action: string; payload?: unknown }, dialogs: MenuDialogHandlers) {
  switch (message.action) {
    case 'new-project':
      void createProjectAndSwitch('Untitled')
      break
    case 'open-project':
      if (typeof message.payload === 'string') void switchProject(message.payload)
      break
    case 'import':
      dialogs.openImport()
      break
    case 'export':
      dialogs.openExport()
      break
    case 'delete-project': {
      const { projects, projectId } = useStore.getState()
      const name = projects.find((p) => p.id === projectId)?.name ?? 'this project'
      if (window.confirm(`Delete "${name}"? Its model and records are deleted too.`)) {
        void deleteCurrentProject().then(() => toast.success(`Deleted "${name}".`))
      }
      break
    }
    case 'undo':
      if (inTextField()) document.execCommand('undo')
      else useStore.getState().undo()
      break
    case 'redo':
      if (inTextField()) document.execCommand('redo')
      else useStore.getState().redo()
      break
    case 'add-object':
      useStore.getState().addObject()
      break
    case 'auto-layout':
      useStore.getState().applyAutoLayout()
      break
    case 'find':
      useStore.getState().setView('model')
      // The search box may be mounting if we just left the Data view.
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus())
      break
    case 'view-model':
      useStore.getState().setView('model')
      break
    case 'view-data':
      useStore.getState().setView('data')
      break
    case 'toggle-minimap':
      useStore.getState().toggleMinimap()
      break
    case 'toggle-grid':
      useStore.getState().toggleGrid()
      break
    case 'set-layout-direction':
      if (message.payload === 'LR' || message.payload === 'TB') {
        useStore.getState().setLayoutDirection(message.payload)
      }
      break
    case 'set-layout-spacing':
      if (
        message.payload === 'compact' ||
        message.payload === 'comfortable' ||
        message.payload === 'spacious'
      ) {
        useStore.getState().setLayoutSpacing(message.payload)
      }
      break
    case 'set-theme':
      if (
        message.payload === 'light' ||
        message.payload === 'dark' ||
        message.payload === 'system'
      ) {
        useStore.getState().setTheme(message.payload)
      }
      break
  }
}

/** Route native-menu actions into the store and keep the menu's project list current. */
export function startMenuBridge(dialogs: MenuDialogHandlers): () => void {
  const bridge = window.zoolander
  if (!bridge) return () => {}

  const offAction = bridge.onMenuAction((message) => dispatch(message, dialogs))

  const sync = () => {
    const { projects, projectId, theme, minimap, grid, layoutDirection, layoutSpacing } =
      useStore.getState()
    bridge.syncMenu({
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      currentProjectId: projectId,
      theme,
      minimap,
      grid,
      layoutDirection,
      layoutSpacing,
    })
  }
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (
      state.projects !== prev.projects ||
      state.projectId !== prev.projectId ||
      state.theme !== prev.theme ||
      state.minimap !== prev.minimap ||
      state.grid !== prev.grid ||
      state.layoutDirection !== prev.layoutDirection ||
      state.layoutSpacing !== prev.layoutSpacing
    ) {
      sync()
    }
  })
  sync()

  return () => {
    offAction()
    unsubscribe()
  }
}
