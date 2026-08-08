// Pure application-menu template. No electron imports so `bun test` can cover it;
// main.ts casts the result to Electron.MenuItemConstructorOptions[].

export interface MenuProjectMeta {
  id: string
  name: string
}

export type ThemePref = 'light' | 'dark' | 'system'

export type LayoutDirection = 'LR' | 'TB'
export type LayoutSpacing = 'compact' | 'comfortable' | 'spacious'

export interface MenuState {
  projects: MenuProjectMeta[]
  currentProjectId: string | null
  theme: ThemePref
  minimap: boolean
  grid: boolean
  layoutDirection: LayoutDirection
  layoutSpacing: LayoutSpacing
}

export type MenuAction =
  | { action: 'new-project' }
  | { action: 'open-project'; payload: string }
  | { action: 'import' }
  | { action: 'export' }
  | { action: 'delete-project' }
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'add-object' }
  | { action: 'auto-layout' }
  | { action: 'find' }
  | { action: 'view-model' }
  | { action: 'view-data' }
  | { action: 'set-theme'; payload: ThemePref }
  | { action: 'toggle-minimap' }
  | { action: 'toggle-grid' }
  | { action: 'set-layout-direction'; payload: LayoutDirection }
  | { action: 'set-layout-spacing'; payload: LayoutSpacing }

export type SendMenuAction = (message: MenuAction) => void

export interface MenuTemplateItem {
  label?: string
  role?: string
  type?: 'separator' | 'checkbox' | 'radio' | 'normal'
  checked?: boolean
  enabled?: boolean
  accelerator?: string
  submenu?: MenuTemplateItem[]
  click?: () => void
}

export function buildMenuTemplate(
  state: MenuState,
  send: SendMenuAction,
  options: { isMac: boolean; isDev: boolean },
): MenuTemplateItem[] {
  const projectItems: MenuTemplateItem[] =
    state.projects.length === 0
      ? [{ label: 'No Projects', enabled: false }]
      : state.projects.map((p) => ({
          label: p.name,
          type: 'checkbox',
          checked: p.id === state.currentProjectId,
          click: () => send({ action: 'open-project', payload: p.id }),
        }))

  return [
    ...(options.isMac ? [{ role: 'appMenu' } satisfies MenuTemplateItem] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => send({ action: 'new-project' }) },
        { label: 'Open Project', submenu: projectItems },
        { type: 'separator' },
        { label: 'Import JSON…', accelerator: 'CmdOrCtrl+Shift+I', click: () => send({ action: 'import' }) },
        { label: 'Export JSON…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send({ action: 'export' }) },
        { type: 'separator' },
        { label: 'Delete Project…', click: () => send({ action: 'delete-project' }) },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Custom undo/redo: the renderer routes to model history, or native text
        // undo when a text field has focus. Always enabled; both paths no-op safely.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send({ action: 'undo' }) },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send({ action: 'redo' }) },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Model', accelerator: 'CmdOrCtrl+1', click: () => send({ action: 'view-model' }) },
        { label: 'Data', accelerator: 'CmdOrCtrl+2', click: () => send({ action: 'view-data' }) },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: (['light', 'dark', 'system'] as const).map((theme) => ({
            label: theme.charAt(0).toUpperCase() + theme.slice(1),
            type: 'radio' as const,
            checked: state.theme === theme,
            click: () => send({ action: 'set-theme', payload: theme }),
          })),
        },
        {
          label: 'Show Minimap',
          type: 'checkbox',
          checked: state.minimap,
          click: () => send({ action: 'toggle-minimap' }),
        },
        {
          label: 'Show Grid',
          type: 'checkbox',
          checked: state.grid,
          click: () => send({ action: 'toggle-grid' }),
        },
        { type: 'separator' },
        ...(options.isDev
          ? [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' } satisfies MenuTemplateItem]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Model',
      submenu: [
        { label: 'Add Resource', accelerator: 'CmdOrCtrl+Shift+N', click: () => send({ action: 'add-object' }) },
        { label: 'Auto Layout', accelerator: 'CmdOrCtrl+Shift+L', click: () => send({ action: 'auto-layout' }) },
        {
          label: 'Layout Direction',
          submenu: [
            { label: 'Horizontal', value: 'LR' as const },
            { label: 'Vertical', value: 'TB' as const },
          ].map(({ label, value }) => ({
            label,
            type: 'radio' as const,
            checked: state.layoutDirection === value,
            click: () => send({ action: 'set-layout-direction', payload: value }),
          })),
        },
        {
          label: 'Layout Spacing',
          submenu: (['compact', 'comfortable', 'spacious'] as const).map((spacing) => ({
            label: spacing.charAt(0).toUpperCase() + spacing.slice(1),
            type: 'radio' as const,
            checked: state.layoutSpacing === spacing,
            click: () => send({ action: 'set-layout-spacing', payload: spacing }),
          })),
        },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => send({ action: 'find' }) },
      ],
    },
    { role: 'windowMenu' },
  ]
}
