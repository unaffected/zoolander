import { describe, expect, test } from 'bun:test'
import { buildMenuTemplate, type MenuAction, type MenuTemplateItem } from './menu'

const state = {
  projects: [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ],
  currentProjectId: 'b',
  theme: 'dark' as const,
  minimap: true,
  grid: true,
  layoutDirection: 'LR' as const,
  layoutSpacing: 'comfortable' as const,
}

function build(overrides?: Partial<Parameters<typeof buildMenuTemplate>[2]>) {
  const sent: MenuAction[] = []
  const template = buildMenuTemplate(state, (m) => sent.push(m), {
    isMac: true,
    isDev: false,
    ...overrides,
  })
  return { template, sent }
}

function findItem(items: MenuTemplateItem[], label: string): MenuTemplateItem | null {
  for (const item of items) {
    if (item.label === label) return item
    const nested = item.submenu && findItem(item.submenu, label)
    if (nested) return nested
  }
  return null
}

describe('buildMenuTemplate', () => {
  test('includes top-level menus in order', () => {
    const { template } = build()
    expect(template.map((i) => i.label ?? i.role)).toEqual([
      'appMenu',
      'File',
      'Edit',
      'View',
      'Model',
      'windowMenu',
    ])
  })

  test('omits appMenu off mac and devtools outside dev', () => {
    const { template } = build({ isMac: false })
    expect(template[0]?.label).toBe('File')
    const view = findItem(template, 'View')
    expect(view?.submenu?.some((i) => i.role === 'toggleDevTools')).toBe(false)
  })

  test('includes reload/devtools in dev', () => {
    const { template } = build({ isDev: true })
    const view = findItem(template, 'View')
    expect(view?.submenu?.some((i) => i.role === 'toggleDevTools')).toBe(true)
  })

  test('project submenu checks the current project and sends open-project', () => {
    const { template, sent } = build()
    const open = findItem(template, 'Open Project')
    expect(open?.submenu?.map((i) => [i.label, i.checked])).toEqual([
      ['Alpha', false],
      ['Beta', true],
    ])
    open?.submenu?.[0]?.click?.()
    expect(sent).toEqual([{ action: 'open-project', payload: 'a' }])
  })

  test('shows a disabled placeholder when there are no projects', () => {
    const sent: MenuAction[] = []
    const template = buildMenuTemplate(
      { projects: [], currentProjectId: null, theme: 'system', minimap: true, grid: true, layoutDirection: 'LR' as const, layoutSpacing: 'comfortable' as const },
      (m) => sent.push(m),
      { isMac: true, isDev: false },
    )
    const open = findItem(template, 'Open Project')
    expect(open?.submenu).toEqual([{ label: 'No Projects', enabled: false }])
  })

  test('appearance radios reflect the current theme and send set-theme', () => {
    const { template, sent } = build()
    const appearance = findItem(template, 'Appearance')
    expect(appearance?.submenu?.map((i) => [i.label, i.type, i.checked])).toEqual([
      ['Light', 'radio', false],
      ['Dark', 'radio', true],
      ['System', 'radio', false],
    ])
    appearance?.submenu?.[2]?.click?.()
    expect(sent).toEqual([{ action: 'set-theme', payload: 'system' }])
  })

  test.each([
    ['New Project', { action: 'new-project' }],
    ['Import JSON…', { action: 'import' }],
    ['Export JSON…', { action: 'export' }],
    ['Delete Project…', { action: 'delete-project' }],
    ['Undo', { action: 'undo' }],
    ['Redo', { action: 'redo' }],
    ['Model', { action: 'view-model' }],
    ['Data', { action: 'view-data' }],
    ['Add Resource', { action: 'add-object' }],
    ['Auto Layout', { action: 'auto-layout' }],
    ['Find', { action: 'find' }],
  ] as const)('%s sends its action', (label, expected) => {
    const { template, sent } = build()
    findItem(template, label)?.click?.()
    expect(sent).toEqual([expected])
  })

  test('accelerators are attached to the core commands', () => {
    const { template } = build()
    expect(findItem(template, 'New Project')?.accelerator).toBe('CmdOrCtrl+N')
    expect(findItem(template, 'Undo')?.accelerator).toBe('CmdOrCtrl+Z')
    expect(findItem(template, 'Redo')?.accelerator).toBe('CmdOrCtrl+Shift+Z')
    expect(findItem(template, 'Find')?.accelerator).toBe('CmdOrCtrl+F')
  })
})

describe('minimap toggle', () => {
  test('checkbox reflects state and sends toggle-minimap', () => {
    const { template, sent } = build()
    const item = findItem(template, 'Show Minimap')
    expect(item?.type).toBe('checkbox')
    expect(item?.checked).toBe(true)
    item?.click?.()
    expect(sent).toEqual([{ action: 'toggle-minimap' }])
  })
})

describe('grid + layout settings', () => {
  test('grid checkbox sends toggle-grid', () => {
    const { template, sent } = build()
    const item = findItem(template, 'Show Grid')
    expect(item?.checked).toBe(true)
    item?.click?.()
    expect(sent).toEqual([{ action: 'toggle-grid' }])
  })

  test('layout direction and spacing radios send payloads', () => {
    const { template, sent } = build()
    const direction = findItem(template, 'Layout Direction')
    expect(direction?.submenu?.map((i) => [i.label, i.checked])).toEqual([
      ['Horizontal', true],
      ['Vertical', false],
    ])
    direction?.submenu?.[1]?.click?.()
    const spacing = findItem(template, 'Layout Spacing')
    expect(spacing?.submenu?.map((i) => [i.label, i.checked])).toEqual([
      ['Compact', false],
      ['Comfortable', true],
      ['Spacious', false],
    ])
    spacing?.submenu?.[0]?.click?.()
    expect(sent).toEqual([
      { action: 'set-layout-direction', payload: 'TB' },
      { action: 'set-layout-spacing', payload: 'compact' },
    ])
  })
})
