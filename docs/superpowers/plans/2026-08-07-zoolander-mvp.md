# Zoolander MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual JSON Schema data modeler — graph-db-style canvas with visual editing and schema parsing, as a React SPA wrapped in Electron.

**Architecture:** Pure-TS model core (`src/model`) maps a `DataModel` to/from a JSON Schema 2020-12 document (objects in `$defs`, relations as `$ref` properties, positions in `x-zoolander`). A Zustand store derives React Flow nodes/edges from the model. React Flow renders/edits the graph; shadcn inspector edits objects; AJV validates continuously. Electron adds native file dialogs via a preload bridge; the SPA falls back to browser file input/download.

**Tech Stack:** Bun (pkg manager/scripts/tests), Vite, React 19 + TS, @xyflow/react 12, ajv 8 (2020-12), tailwindcss 4, shadcn/ui, zustand 5, @dagrejs/dagre 3, electron 43.

## Global Constraints

- JSON Schema draft **2020-12** only; AJV imported as `Ajv2020` from `ajv/dist/2020`.
- All tooling through Bun: `bun install`, `bun test`, `bunx`, `bun run`.
- `src/model/**` must not import React, zustand, or Electron.
- Extension keyword is exactly `x-zoolander`; registered with AJV so strict mode passes.
- Property scalar types: `string | number | integer | boolean | object | array`.
- Relations: direct `$ref` → cardinality `one`; `array` + `items.$ref` → `many`; `allOf:[{$ref}]` → `kind: 'inheritance'`.
- Commit after each task with a conventional-commit message ending in the Claude co-author trailer.

---

### Task 1: Scaffold (Vite + React + TS + Tailwind 4 + shadcn + deps)

**Files:**
- Create: entire Vite scaffold at repo root (`package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`), `components.json` (shadcn), `src/lib/utils.ts`, `.gitignore`

**Interfaces:**
- Produces: working `bun run dev` / `bun run build`; `@/` path alias; shadcn `Button`, `Input`, `Label`, `Textarea`, `Dialog`, `Select`, `Checkbox`, `Popover`, `Badge`, `Separator`, `Sonner` components under `src/components/ui/`.

- [ ] **Step 1:** `bun create vite@latest . --template react-ts` (scaffold into existing repo; keep docs/ and .git).
- [ ] **Step 2:** `bun install`, then `bun add @xyflow/react ajv ajv-formats zustand @dagrejs/dagre tailwindcss @tailwindcss/vite` and `bun add -d @types/bun`.
- [ ] **Step 3:** Tailwind 4 wiring: `@import "tailwindcss";` as first line of `src/index.css`; add `tailwindcss()` plugin to `vite.config.ts`; add `@/` alias to vite config + tsconfig (`baseUrl` + `paths`).
- [ ] **Step 4:** `bunx --bun shadcn@latest init -d` then `bunx --bun shadcn@latest add button input label textarea dialog select checkbox popover badge separator sonner`.
- [ ] **Step 5:** Verify `bun run build` succeeds. Commit `feat: scaffold vite react app with tailwind 4 and shadcn`.

### Task 2: Model types + serializer

**Files:**
- Create: `src/model/types.ts`, `src/model/serialize.ts`
- Test: `src/model/serialize.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type ScalarType = 'string'|'number'|'integer'|'boolean'|'object'|'array';
  export interface Property { name: string; type: ScalarType; required: boolean; description?: string; enum?: string[]; format?: string; }
  export interface ModelObject { id: string; name: string; description?: string; properties: Property[]; position: { x: number; y: number }; }
  export interface Relation { id: string; sourceId: string; targetId: string; propertyName: string; cardinality: 'one'|'many'; kind: 'ref'|'inheritance'; }
  export interface DataModel { title: string; objects: ModelObject[]; relations: Relation[]; }
  export const SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema';
  // serialize.ts
  export function serialize(model: DataModel): Record<string, unknown>;
  ```
- Serializer rules: `$defs[obj.name] = { type:'object', title, description?, properties, required? }`; relation `one` → `properties[p] = {$ref:'#/$defs/Target'}`; `many` → `{type:'array', items:{$ref}}`; inheritance → `allOf:[{$ref}]` on source def (propertyName ignored); enum on string props → `{type:'string', enum:[...]}`; positions → `x-zoolander.positions[name] = {x,y}` (rounded).

- [ ] **Step 1:** Write failing tests covering: empty model; single object with scalar props/required/description/enum/format; one-to-one relation; one-to-many relation; inheritance via allOf; positions in `x-zoolander`.
- [ ] **Step 2:** `bun test` → fails (module missing).
- [ ] **Step 3:** Implement `types.ts` + `serialize.ts`.
- [ ] **Step 4:** `bun test` → pass.
- [ ] **Step 5:** Commit `feat: model types and json-schema serializer`.

### Task 3: Parser (schema → model) + round-trip

**Files:**
- Create: `src/model/parse.ts`
- Test: `src/model/parse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParseResult { model: DataModel; warnings: string[]; }
  export function parse(schema: Record<string, unknown>): ParseResult; // throws Error on non-object/def-less garbage? No: returns empty model + warnings; only throws on non-object input
  ```
- Ids: object id = def name (stable); relation id = `${source}.${propertyName}` / `${source}->extends->${target}`.
- Unknown constructs (e.g. `oneOf` at def level, non-`$defs` refs) → warning strings, skipped.
- Missing positions → `{x:0,y:0}` (layout applied later by caller).

- [ ] **Step 1:** Write failing tests: parses each serializer fixture; **round-trip** `serialize(parse(s).model)` deep-equals normalized `s` for full fixture, and `parse(serialize(m)).model` equals `m` (ids from names); unknown construct yields warning not crash; refs to missing defs yield warning; non-object input throws.
- [ ] **Step 2:** `bun test` → fail. **Step 3:** Implement. **Step 4:** `bun test` → pass. **Step 5:** Commit `feat: json-schema parser with round-trip guarantee`.

### Task 4: AJV validation wrapper

**Files:**
- Create: `src/model/validate.ts`
- Test: `src/model/validate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ValidationResult { valid: boolean; errors: string[]; }
  export function validateSchema(schema: Record<string, unknown>): ValidationResult; // meta-validation + compile check
  ```
- Uses `Ajv2020` with `ajv-formats`, `keyword: 'x-zoolander'` registered as no-op, `strict: true`, `allErrors: true`. `valid` requires: meta-schema validation passes AND `ajv.compile` succeeds. Errors formatted `instancePath: message`.

- [ ] **Step 1:** Failing tests: valid serialized fixture → valid; schema with `type: 'strang'` → invalid with error mention; `x-zoolander` present → still valid; dangling `$ref` → invalid (compile throws captured).
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass → **Step 5:** Commit `feat: ajv 2020-12 validation wrapper`.

### Task 5: Auto-layout (dagre)

**Files:**
- Create: `src/model/layout.ts`
- Test: `src/model/layout.test.ts`

**Interfaces:**
- Produces: `export function autoLayout(model: DataModel): DataModel;` — returns copy with positions assigned left-to-right (`rankdir: 'LR'`, node size 240×(60+24·props)), never mutates input.

- [ ] Steps: failing test (two related objects get distinct finite positions; input unmutated) → implement → pass → Commit `feat: dagre auto-layout`.

### Task 6: Zustand store

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ZoolanderState {
    model: DataModel; selectedObjectId: string | null; validation: ValidationResult;
    addObject(): void;                       // "Object1", "Object2", … auto-name, offset position
    deleteObject(id: string): void;          // also drops its relations
    renameObject(id: string, name: string): boolean;   // false on dup/empty
    setObjectDescription(id: string, d: string): void;
    addProperty(objectId: string): void;     // "field1" auto-name
    updateProperty(objectId: string, index: number, p: Property): boolean; // false on dup name
    deleteProperty(objectId: string, index: number): void;
    addRelation(sourceId: string, targetId: string, propertyName: string, cardinality: 'one'|'many'): boolean;
    deleteRelation(id: string): void;
    moveObject(id: string, pos: {x:number;y:number}): void;
    select(id: string | null): void;
    setTitle(title: string): void;
    loadModel(m: DataModel): void;
    applyAutoLayout(): void;
  }
  export const useStore: UseBoundStore<StoreApi<ZoolanderState>>;
  export function toFlow(model: DataModel): { nodes: Node[]; edges: Edge[] }; // pure helper
  ```
- Every mutation recomputes `validation` via `validateSchema(serialize(model))`.
- `toFlow`: node `{id, type:'object', position, data:{object, isSelected? no—selection via store}}`; edge `{id, source, target, type:'relation', data:{relation}}`.

- [ ] Steps: failing tests (add/rename/dup-rejection/delete cascades relations/addRelation dup property name rejected/validation updates) → implement → pass → Commit `feat: zustand store with model actions`.

### Task 7: Canvas components

**Files:**
- Create: `src/components/canvas/ObjectNode.tsx`, `src/components/canvas/RelationEdge.tsx`, `src/components/canvas/Canvas.tsx`

**Interfaces:**
- Consumes: `useStore`, `toFlow`.
- Produces: `<Canvas/>` — full-size ReactFlow with custom node type `object`, edge type `relation`, MiniMap, Controls, Background; node drag → `moveObject`; node click → `select`; `onConnect` opens the relation dialog (callback prop `onConnectRequest(source, target)`); handles on left (target) and right (source) of each node.
- ObjectNode: card styled with Tailwind; header = name (+ badge with property count); rows = property name, type badge, `*` when required. Inheritance edge dashed with hollow arrow; relation edge labeled `propertyName` with `1` / `N` marker, `many` gets marker label `∗`.

- [ ] Steps: implement components → `bun run build` passes → Commit `feat: react-flow canvas with object nodes and relation edges`.

### Task 8: Inspector, toolbar, dialogs

**Files:**
- Create: `src/components/inspector/Inspector.tsx`, `src/components/Toolbar.tsx`, `src/components/dialogs/ImportDialog.tsx`, `src/components/dialogs/ExportDialog.tsx`, `src/components/dialogs/RelationDialog.tsx`, `src/components/ValidationStatus.tsx`, `src/lib/file-io.ts`

**Interfaces:**
- Consumes: store actions, `parse`, `serialize`, `validateSchema`, `autoLayout`.
- Produces:
  - `Inspector` — right panel when `selectedObjectId`; edits name (inline validation), description, property list (name/type select/required checkbox/delete), add-property button, outgoing relations list with delete.
  - `Toolbar` — app title (editable model title), buttons: Add Object, Auto Layout, Import, Export, Open, Save; `ValidationStatus` chip (green "Valid" / red "N errors" popover listing them).
  - `ImportDialog` — textarea paste + file pick; on submit: JSON.parse → `validateSchema` → `parse` → positions-all-zero ⇒ `autoLayout` → `loadModel`; errors/warnings shown inline (toast for warnings).
  - `ExportDialog` — pretty-printed schema, copy-to-clipboard, download.
  - `RelationDialog` — property name input + cardinality select, confirms `addRelation`.
  - `file-io.ts` — `openSchemaFile(): Promise<{text:string, path?:string}|null>`, `saveSchemaFile(text: string, path?: string): Promise<string|null>`; uses `window.zoolander` bridge when present, else browser input/download.
- [ ] Steps: implement → `bun run build` passes → Commit `feat: inspector, toolbar, import/export dialogs`.

### Task 9: App shell wiring

**Files:**
- Modify: `src/App.tsx`, `src/index.css`, `index.html` (title), `src/main.tsx`
- Create: `src/types/bridge.d.ts` (`window.zoolander` typing)

**Interfaces:**
- Produces: layout = toolbar top, canvas fill, inspector right; sonner `<Toaster/>`; seeded demo model on first load (two objects, one relation) so canvas isn't empty; dark-mode-aware via system preference.

- [ ] Steps: wire → `bun test` && `bun run build` pass → run dev server, screenshot-verify canvas renders (use `run` skill if needed) → Commit `feat: app shell wiring with demo model`.

### Task 10: Electron shell

**Files:**
- Create: `electron/main.ts`, `electron/preload.ts`, `electron/tsconfig.json`
- Modify: `package.json` (scripts: `dev`, `build`, `electron:dev`, `electron:build`; `main` field), `vite.config.ts` (`base: './'`)

**Interfaces:**
- Produces: `bun run electron:dev` → builds electron TS (esbuild via `bun build --target=node` or `tsc`), launches `bunx electron .` pointed at Vite dev server URL (`ZOOLANDER_DEV_URL`) or `dist/index.html`; preload exposes `window.zoolander = { openFile(): Promise<{path,text}|null>, saveFile(text, path?): Promise<string|null> }` over `ipcRenderer.invoke('zoolander:open'|'zoolander:save')`; main registers `ipcMain.handle` for both using `dialog.showOpenDialog`/`showSaveDialog` + `fs`.
- [ ] Steps: implement → verify `bun run build && bun run electron:smoke` opens window (headless check: electron launches and loads without error, close after) → Commit `feat: electron shell with native file dialogs`.

### Task 11: Final verification + README

**Files:**
- Create: `README.md`
- [ ] Steps: `bun test` all pass; `bun run build` clean; electron smoke; README documents stack, commands, schema mapping table; Commit `docs: readme`.

## Self-Review

- Spec coverage: canvas/editing (T7/T8), parsing/import (T3/T8), export (T2/T8), validation (T4/T6/ValidationStatus), auto-layout (T5), Electron (T10), browser fallback (T8 file-io), tests (T2–T6), round-trip (T3). Covered.
- Type consistency: `Property.enum` is `string[]`; store `updateProperty` takes full `Property`; `toFlow` edge/node types `relation`/`object` used in T7. Consistent.
