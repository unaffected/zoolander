import path from 'node:path'
import fs from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import AdmZip from 'adm-zip'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron'
import {
  applyPragmas,
  createProject,
  createRecord,
  deleteProject,
  findRecords,
  getRecord,
  getSetting,
  listProjects,
  loadModel,
  MIGRATIONS,
  patchRecord,
  removeRecord,
  runMigrations,
  saveModel,
  setSetting,
  type SqlDatabase,
} from './db'
import { buildMenuTemplate, type MenuAction, type MenuState } from './menu'

const DEV_URL = process.env.ZOOLANDER_DEV_URL
const SMOKE = process.env.ZOOLANDER_SMOKE === '1'

app.setName('Zoolander')

let mainWindow: BrowserWindow | null = null
let menuState: MenuState = {
  projects: [],
  currentProjectId: null,
  theme: 'system',
  minimap: true,
  grid: true,
  layoutDirection: 'LR',
  layoutSpacing: 'comfortable',
}

function sendMenuAction(message: MenuAction) {
  // The menu outlives the window on macOS — never send into a destroyed window.
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('menu:action', message)
}

function rebuildMenu() {
  const template = buildMenuTemplate(menuState, sendMenuAction, {
    isMac: process.platform === 'darwin',
    isDev: Boolean(DEV_URL),
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(template as Electron.MenuItemConstructorOptions[]),
  )
}

function registerMenuHandlers() {
  ipcMain.on('menu:sync', (_event, state: MenuState) => {
    menuState = state
    rebuildMenu()
  })
}

function openDatabase(): SqlDatabase {
  // Overridable so smoke/test runs keep their data isolated from the real app.
  if (process.env.ZOOLANDER_USER_DATA) app.setPath('userData', process.env.ZOOLANDER_USER_DATA)
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'zoolander.db')
  const db = new DatabaseSync(file) as unknown as SqlDatabase
  applyPragmas(db)
  const applied = runMigrations(db, MIGRATIONS)
  if (applied.length > 0) console.log(`[db] applied migrations: ${applied.join(', ')}`)
  return db
}

function registerDbHandlers(db: SqlDatabase) {
  ipcMain.handle('db:list-projects', () => listProjects(db))
  ipcMain.handle('db:create-project', (_e, name: string, id: string) =>
    createProject(db, name, id),
  )
  ipcMain.handle('db:delete-project', (_e, id: string) => deleteProject(db, id))
  ipcMain.handle('db:load-model', (_e, id: string) => loadModel(db, id))
  ipcMain.handle(
    'db:save-model',
    (_e, id: string, model: unknown, action: string, coalesced: number) =>
      saveModel(db, id, model, action, coalesced),
  )
  ipcMain.handle('db:get-setting', (_e, key: string) => getSetting(db, key))
  ipcMain.handle('db:set-setting', (_e, key: string, value: string) => setSetting(db, key, value))
  ipcMain.handle('db:records:find', (_e, projectId: string, objectId: string) =>
    findRecords(db, projectId, objectId),
  )
  ipcMain.handle('db:records:get', (_e, id: string) => getRecord(db, id))
  ipcMain.handle(
    'db:records:create',
    (_e, projectId: string, objectId: string, id: string, data: unknown) =>
      createRecord(db, projectId, objectId, id, data),
  )
  ipcMain.handle('db:records:patch', (_e, id: string, data: unknown) => patchRecord(db, id, data))
  ipcMain.handle('db:records:remove', (_e, id: string) => removeRecord(db, id))
}

function registerFileHandlers() {
  ipcMain.handle('zoolander:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open JSON Schema',
      filters: [{ name: 'JSON Schema', extensions: ['json'] }],
      properties: ['openFile'],
    })
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    return { path: file, text: await fs.readFile(file, 'utf8') }
  })

  ipcMain.handle('zoolander:save', async (_event, text: string, existingPath?: string) => {
    let target = existingPath
    if (!target) {
      const result = await dialog.showSaveDialog({
        title: 'Save JSON Schema',
        defaultPath: 'model.schema.json',
        filters: [{ name: 'JSON Schema', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return null
      target = result.filePath
    }
    await fs.writeFile(target, text, 'utf8')
    return target
  })

  ipcMain.handle('zoolander:choose-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose project folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('zoolander:read-dir', async (_event, dir: string) => {
    try {
      const entries = await fs.readdir(dir)
      const files: Record<string, string> = {}
      for (const entry of entries) {
        if (!entry.endsWith('.schema.json')) continue
        files[entry] = await fs.readFile(path.join(dir, entry), 'utf8')
      }
      return files
    } catch (err) {
      console.error(`read-dir failed: ${String(err)}`)
      return null
    }
  })

  ipcMain.handle(
    'zoolander:export-archive',
    async (_event, defaultName: string, files: Record<string, string>) => {
      const result = await dialog.showSaveDialog({
        title: 'Export archive',
        defaultPath: `${defaultName}.zip`,
        filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      })
      if (result.canceled || !result.filePath) return null
      const zip = new AdmZip()
      for (const [name, text] of Object.entries(files)) {
        zip.addFile(name, Buffer.from(text, 'utf8'))
      }
      zip.writeZip(result.filePath)
      return result.filePath
    },
  )

  ipcMain.handle('zoolander:write-files', async (_event, dir: string, files: Record<string, string>) => {
    try {
      await fs.mkdir(dir, { recursive: true })
      for (const [name, text] of Object.entries(files)) {
        await fs.writeFile(path.join(dir, name), text, 'utf8')
      }
      return true
    } catch (err) {
      console.error(`write-files failed: ${String(err)}`)
      return false
    }
  })
}

async function createWindow() {
  const win = (mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Zoolander',
    // Stay hidden until first paint is ready — no blank-window flash.
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff',
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }))

  win.once('ready-to-show', () => {
    if (!SMOKE) win.show()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  let renderErrors = 0
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') {
      renderErrors += 1
      console.error(`[renderer] ${event.message}`)
    }
  })

  if (DEV_URL) {
    await win.loadURL(DEV_URL)
  } else {
    await win.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'))
  }

  if (SMOKE) {
    // Give React a beat to mount, then report and exit.
    setTimeout(async () => {
      const smokeTheme = process.env.ZOOLANDER_SMOKE_THEME
      if (smokeTheme === 'light' || smokeTheme === 'dark') {
        await win.webContents.executeJavaScript(
          `document.documentElement.classList.toggle('dark', ${smokeTheme === 'dark'})`,
        )
      }
      if (process.env.ZOOLANDER_SHOT) {
        // Hidden windows never repaint or measure nodes — screenshots need a
        // real (unfocused) window, or capturePage returns a stale frame.
        win.showInactive()
        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      if (process.env.ZOOLANDER_SMOKE_VIEW === 'data') {
        await win.webContents.executeJavaScript(
          `document.querySelectorAll('[role="tab"]')[1]?.dispatchEvent(new MouseEvent('click', {bubbles: true}))`,
        )
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (process.env.ZOOLANDER_SMOKE_NEW === '1') {
          await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('New '))?.dispatchEvent(new MouseEvent('click', {bubbles: true}))`,
          )
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        if (process.env.ZOOLANDER_SMOKE_SUBMIT === '1') {
          await win.webContents.executeJavaScript(`(() => {
            const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            const inputs = [...document.querySelectorAll('[role="dialog"] input[type="text"], [role="dialog"] input[type="email"], [role="dialog"] input:not([type])')]
            inputs.forEach((el, i) => {
              setValue.call(el, i === 0 ? 'Ada Lovelace' : 'ada@example.com')
              el.dispatchEvent(new Event('input', { bubbles: true }))
            })
            const submit = [...document.querySelectorAll('[role="dialog"] button[type="submit"]')].at(-1)
            submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          })()`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      if (process.env.ZOOLANDER_SMOKE_INSPECT) {
        // Select a canvas node by name so screenshots capture its inspector.
        await win.webContents.executeJavaScript(`(async () => {
          const name = ${JSON.stringify(process.env.ZOOLANDER_SMOKE_INSPECT)}
          const node = [...document.querySelectorAll('.react-flow__node')]
            .find((n) => n.textContent.includes(name))
          node?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 500))
        })()`)
      }
      if (process.env.ZOOLANDER_SMOKE_LINK === '1') {
        // Record links must navigate to the target resource's table and
        // highlight the linked row.
        const linkReport = await win.webContents.executeJavaScript(`(async () => {
          const link = [...document.querySelectorAll('main table button')]
            .find((b) => b.textContent === 'Earth')
          if (!link) return { ok: false, reason: 'no Earth link in table' }
          link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 600))
          const heading = document.querySelector('main h2')?.textContent
          const highlighted = document.querySelectorAll('tr[class*="bg-primary"]').length
          return { ok: heading === 'World' && highlighted === 1, heading, highlighted }
        })()`)
        console.log(`[smoke] link ${JSON.stringify(linkReport)}`)
        if (!linkReport?.ok) renderErrors += 1
      }
      if (process.env.ZOOLANDER_SMOKE_DRAG === '1') {
        // Interaction smoke: nodes must follow the cursor mid-drag and the
        // selection ring must always agree with the inspector.
        const dragReport = await win.webContents.executeJavaScript(`(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
          const mouse = (target, type, x, y) =>
            target.dispatchEvent(new MouseEvent(type, {
              bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y,
            }))
          const addBtn = document.querySelector('[aria-label="Add resource"]')
          addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await sleep(150)
          addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await sleep(400)
          const nodes = [...document.querySelectorAll('.react-flow__node')]
          if (nodes.length < 2) return { ok: false, reason: 'expected 2 nodes, got ' + nodes.length }

          // Drag node 0 by 80px and sample its transform mid-drag.
          const el = nodes[0]
          const rect = el.getBoundingClientRect()
          const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2
          const before = el.style.transform
          mouse(el, 'mousedown', cx, cy)
          await sleep(50)
          mouse(document, 'mousemove', cx + 40, cy + 40)
          await sleep(100)
          mouse(document, 'mousemove', cx + 80, cy + 80)
          await sleep(100)
          const during = el.style.transform
          mouse(document, 'mouseup', cx + 80, cy + 80)
          await sleep(300)
          const movedLive = during !== before

          // Ring follows selection: dragged node should be the one ringed,
          // and its name should match the inspector's Name field.
          const ringed = [...document.querySelectorAll('.react-flow__node')]
            .filter((n) => n.querySelector('.ring-2'))
          const inspectorName = document.querySelector('aside input')?.value ?? null
          const ringMatchesInspector =
            ringed.length === 1 && ringed[0].textContent.includes(inspectorName)

          // Pane click clears the ring.
          const pane = document.querySelector('.react-flow__pane')
          mouse(pane, 'click', 20, window.innerHeight / 2)
          await sleep(200)
          const ringsAfterPaneClick =
            [...document.querySelectorAll('.react-flow__node .ring-2')].length
          return { ok: movedLive && ringMatchesInspector && ringsAfterPaneClick === 0,
            movedLive, before, during, ringMatchesInspector, inspectorName, ringsAfterPaneClick }
        })()`)
        console.log(`[smoke] drag ${JSON.stringify(dragReport)}`)
        if (!dragReport?.ok) renderErrors += 1
      }
      const rootChildren = await win.webContents.executeJavaScript(
        'document.getElementById("root")?.children.length ?? 0',
      )
      const timing = await win.webContents.executeJavaScript(`(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')
        return JSON.stringify({
          domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? -1),
          load: Math.round(nav?.loadEventEnd ?? -1),
          firstContentfulPaint: Math.round(fcp?.startTime ?? -1),
        })
      })()`)
      console.log(`[smoke] timing ${timing}`)
      const shotPath = process.env.ZOOLANDER_SHOT
      if (shotPath) {
        const image = await win.webContents.capturePage()
        await fs.writeFile(shotPath, image.toPNG())
      }
      console.log(`[smoke] root children: ${rootChildren}, renderer errors: ${renderErrors}`)
      app.exit(rootChildren > 0 && renderErrors === 0 ? 0 : 1)
    }, 3000)
  }
}

app.whenReady().then(() => {
  registerDbHandlers(openDatabase())
  registerFileHandlers()
  registerMenuHandlers()
  rebuildMenu()
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || SMOKE) app.quit()
})
