# Zoolander desktop rework — design

**Date:** 2026-08-07
**Status:** Approved direction (decomposition, persistence semantics, service layer, and toolbar layout confirmed with Cody via Q&A).

Zoolander will never be hosted as a web app; it is build-and-release desktop software (Electron). This rework has three sub-projects, built in order, each with its own plan:

- **A. Native menu + minimal toolbar** — move app-level actions into the macOS menu bar; toolbar keeps canvas-centric controls.
- **B. SQLite (WAL) persistence backbone** — packaged local DB with ordered migrations, event log + snapshots, JSON-only import/export.
- **C. Relation modeling UX** — relations appear in the node field list as properties; the relation dialog defines both ends at once; connection-point markers reflect cardinality (traditional data-modeling notation).
- **D. Generated CRUD forms** — RJSF v6 + `@rjsf/shadcn` forms generated from the modeled schemas; records stored in the same DB.

Confirmed decisions:

- Build order **A → B → C → D** (C inserted by Cody mid-build; forms moved to D).
- Persistence: **events + snapshots** — mutations are labeled in the store (`lastAction`); the autosave debounce (250 ms) coalesces rapid same-project commits and writes one event row (action + coalesced count) plus one full-model snapshot row per flush. Snapshots are the load path, pruned to the last 20 per project. Not full replay-based event sourcing.
- **SQLite is the sole source of truth.** No localStorage, no back-compat machinery — the app is pre-release. Plain-browser dev (never shipped) gets a throwaway in-memory store.
- **Thin typed IPC service layer**, no FeathersJS — Feathers-compatible method shape (`find/get/create/patch/remove`) so it could be swapped later.
- Toolbar layout: **Minimal + undo/redo** (see A).

## A. Native menu + minimal toolbar

### Menu bar

Built in the Electron main process (`Menu.setApplicationMenu`) from a pure, unit-testable template function `buildMenuTemplate(state)` in `electron/menu.ts`:

- **App** — standard macOS roles (About, Quit).
- **File** — New Project (⌘N) · Open Project ▸ (submenu of projects, checkmark on current) · Import JSON… (⇧⌘I) · Export JSON… (⇧⌘E) · Delete Project….
- **Edit** — Undo (⌘Z) · Redo (⇧⌘Z) · standard cut/copy/paste/select-all roles.
- **View** — standard zoom/fullscreen roles; reload/devtools in dev only.
- **Model** — Add Object (⌘⇧N) · Auto Layout (⌘⇧L) · Find (⌘F → focuses toolbar search).
- **Window** — standard roles.

### IPC

- **Main → renderer:** menu clicks send `menu:action` (`{action: string, payload?}`); preload exposes `onMenuAction(cb)`; one renderer dispatcher routes to store/session functions. Import/Export/other dialogs stay in `App.tsx`, opened by menu events.
- **Renderer → main:** `menu:sync` pushes `{projects, currentProjectId, canUndo, canRedo}` on change (store subscription); main rebuilds the menu.
- Undo nuance: with a custom Undo item, ⌘Z always routes to the menu. The renderer dispatcher checks `document.activeElement`; text inputs get native text undo, otherwise model undo. The old global keydown handler in `App.tsx` remains only as a no-bridge (plain browser dev) fallback.

### Toolbar

`[Project ▾] [Model title] ··· [Undo][Redo] | [Search] [+ Object] [Layout] [Validation]`

Removed: Delete-project button, Sync-folder button, Import/Export buttons (`onImport`/`onExport` props die). Consistent `h-8` control heights, fixed widths, tooltips showing shortcuts.

### Scope guards

- Plain-browser `bun run dev` loses menu-only actions; `electron:dev` is the dev loop. Acceptable: build/release only.
- No persistence changes in A; folder-sync machinery is removed in B.
- Verify: `bun test` (template tests), `bun run build`, `electron:smoke`.

## B. SQLite (WAL) persistence backbone

### Engine and packaging

`node:sqlite` (`DatabaseSync`) in the Electron main process — built into the bundled Node 24.18 runtime, so **no native modules, no rebuild step, no install script**. DB file: `app.getPath('userData')/zoolander.db`.

Pragmas on open: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `foreign_keys=ON`.

### Migrations

`electron/migrations.ts` exports an ordered array `[{version, name, up(db)}]`. On every app start (i.e. also after any update), a runner records applied versions in `schema_migrations` and applies pending ones in order inside a transaction. The updater story is exactly this: ship new migrations appended to the array; startup applies them in order.

### Schema (initial migration)

- `projects(id TEXT PK, name TEXT, created_at, updated_at)`
- `events(id INTEGER PK AUTOINCREMENT, project_id → projects, action TEXT, payload TEXT NULL, created_at)` — per-mutation audit log.
- `snapshots(id INTEGER PK AUTOINCREMENT, project_id → projects, model TEXT (JSON), created_at)` — debounced full-model saves; pruned to last N (default 20) per project.
- `settings(key TEXT PK, value TEXT)` — e.g. current project id.

### Service layer

Thin typed IPC channels (`db:*`) exposed on the bridge: project CRUD, `loadModel(projectId)` (latest snapshot), `saveSnapshot(projectId, model)`, `appendEvent(projectId, action)`, current-project get/set. Renderer `src/lib/projects.ts` becomes async bridge calls; `project-session.ts` and `persistence-bus.ts` go async accordingly. The store gains an action label on `commit()` so events carry what happened.

### Removals

- Folder-sync removed entirely: no linked dirs, no disk replication in the persistence bus.
- Import/Export is JSON files only (existing dialogs, file open/save IPC stays).
- No localStorage persistence anywhere; pre-release, so migrations start from one idempotent initial-schema migration (currently version 3; next is 4).

## C. Relation modeling UX

- **Relations as properties:** a node's field list shows relation-backed properties alongside scalar ones (e.g. `worlds → World`, with Single/Multiple indicated), so a related object is never rendered as "no properties".
- **Both ends at once:** the relation dialog defines the forward property (source → target, name + cardinality) and optionally the inverse property (target → source, name + cardinality) in one step.
- **Cardinality markers:** edge endpoints render traditional data-modeling notation — distinct markers for one vs many at each end (crow's-foot style) instead of a single arrowhead.

## D. Generated CRUD forms

A **Data** mode next to the Model canvas: pick an object type, browse its records in a table, create/edit via forms generated from the object's JSON Schema (`serializeObjectDef`) using RJSF v6 with the official `@rjsf/shadcn` theme (+ `@rjsf/validator-ajv8`).

- Records: `records(id TEXT PK, project_id, object_id, data TEXT (JSON), created_at, updated_at)`; IPC service with Feathers-compatible shape (`find/get/create/patch/remove`). Records key on the object's **stable id — never its name** (migration 3 renamed the column and remapped name-keyed rows via each project's latest snapshot).
- Mode switch lives in the toolbar (segmented Model | Data); View menu gets matching items.
- Relations render as reference pickers (dropdown of target-object records) for `one`, multi-select for `many` — stored as record ids.
- **No orphaning.** Every minted id (objects, relations, projects, records) is a UUIDv7 (`src/model/uuid.ts`). Object ids persist through export/import via `x-zoolander` (`ids` map in the single-doc format, `id` per file in the project format), so re-importing a project never regenerates ids. Renaming an object cannot orphan its records.

## Testing strategy

Pure modules (`menu.ts` template, migration runner against an in-memory `DatabaseSync`, record service) get `bun test` coverage. End-to-end: `electron:smoke` must stay green; manual screenshot checks for toolbar/data views.
