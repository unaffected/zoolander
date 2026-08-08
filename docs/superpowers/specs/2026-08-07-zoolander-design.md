# Zoolander — Visual JSON Schema Data Modeler

**Date:** 2026-08-07
**Status:** Approved (autonomous /goal session; constraints supplied by user)

## Purpose

A desktop/web tool for visually modeling data: object types and their relations rendered
as a graph-database-style diagram. Users can **edit visually** (add objects, properties,
relations on a canvas) and **parse** existing JSON Schema documents into the same
visualization. The single source of truth interchange format is **JSON Schema draft
2020-12**, validated with **AJV**.

## User-supplied constraints

- React SPA + Electron desktop shell
- Bun (not Node) for tooling: package manager, scripts, tests
- JSON Schema (modern draft: 2020-12) + AJV at the center
- Best existing React graph library
- TailwindCSS + shadcn/ui

## Approaches considered

1. **React Flow (`@xyflow/react` v12)** — *chosen.* The industry-standard React library
   for interactive, editable node graphs. Nodes are ordinary React components, so shadcn
   components render inside them; built-in drag, pan/zoom, edge creation, selection,
   minimap, controls.
2. Cytoscape.js / reagraph — strong for large read-only graph analytics (canvas/WebGL),
   but nodes are not React components, making rich in-node editing UI impractical.
3. Custom SVG + d3 — maximal control, unjustifiable effort. Rejected (YAGNI).

## Data model

### Core concepts (pure TypeScript, no React dependencies)

- **DataModel** — `{ title, objects: ModelObject[], relations: Relation[] }`
- **ModelObject** — `{ id, name, description?, properties: Property[], position: {x,y} }`
- **Property** — `{ name, type, required, description?, enum?, format? }` where `type` is
  one of `string | number | integer | boolean | object | array` (scalar/simple types;
  relation-typed properties are represented as Relations, not Properties)
- **Relation** — `{ id, sourceId, targetId, propertyName, cardinality: 'one' | 'many', kind: 'ref' | 'inheritance' }`

### JSON Schema mapping (round-trippable)

One schema document per model:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:zoolander:model",
  "title": "My Model",
  "$defs": {
    "User": {
      "type": "object",
      "title": "User",
      "properties": {
        "name": { "type": "string" },
        "posts": { "type": "array", "items": { "$ref": "#/$defs/Post" } },  // one-to-many
        "avatar": { "$ref": "#/$defs/Image" }                                // one-to-one
      },
      "required": ["name"]
    },
    "Admin": { "allOf": [{ "$ref": "#/$defs/User" }], "type": "object", "properties": {} } // inheritance
  },
  "x-zoolander": { "positions": { "User": { "x": 0, "y": 0 } } }
}
```

- Each object type is an entry in `$defs`.
- Relations are `$ref` properties: direct `$ref` → cardinality `one`; `array` with
  `items.$ref` → cardinality `many`; `allOf: [{$ref}]` → inheritance edge.
- Canvas positions persist under the `x-zoolander` extension keyword, registered with AJV
  as a no-op keyword so validation stays strict otherwise.
- **Parser** (`schema → DataModel`) and **serializer** (`DataModel → schema`) are inverse
  functions; round-trip is covered by tests.
- Parsing tolerates real-world schemas: unknown/unsupported constructs on a def are
  preserved best-effort or skipped with a reported warning list, never a crash. A schema
  that fails AJV meta-validation is rejected with its error list shown to the user.

## Architecture

```
src/
  model/        # pure TS core: types.ts, parse.ts, serialize.ts, validate.ts (AJV 2020-12)
  state/        # zustand store: DataModel <-> React Flow nodes/edges mapping, undoable actions
  components/   # canvas/ (ObjectNode, RelationEdge, Canvas), inspector/, toolbar, dialogs
  lib/          # shadcn utils
electron/
  main.ts       # BrowserWindow, native open/save dialogs over IPC
  preload.ts    # contextBridge exposing { openFile, saveFile }
```

- **`src/model`** has zero React/Electron imports and is fully unit-tested with `bun test`.
- **Zustand** store holds the DataModel plus derived React Flow `nodes`/`edges`; all
  mutations go through named actions (addObject, updateProperty, addRelation, …).
- **Electron detection**: the SPA checks for `window.zoolander` (preload bridge). Present →
  native dialogs; absent (plain browser) → `<input type=file>` and download fallback, so
  the SPA works standalone.
- Bun runs everything (`bun install`, `bun test`, `bun run dev/build`). Electron's own
  runtime is bundled Node by design; Bun is the toolchain.

## Features (MVP)

1. **Canvas** — object nodes showing name + property rows (name, type, required marker);
   relation edges labeled with property name and cardinality; inheritance edges styled
   distinctly (dashed). Pan/zoom, minimap, controls, dark-mode-aware styling.
2. **Visual editing** — add/delete objects; edit name/description; add/edit/delete
   properties in a shadcn inspector side panel (opens on node select); create relation by
   dragging between node handles (prompts for property name + cardinality); delete
   relations; drag nodes (positions persist).
3. **Parsing/import** — Open file (Electron dialog or browser file input) or paste schema
   text into a dialog; AJV meta-validation; parse to graph; auto-layout via dagre when the
   schema has no stored positions.
4. **Export/save** — serialize to JSON Schema 2020-12; save to file or copy to clipboard.
5. **Live validation** — the current model is serialized and compiled with AJV on change;
   status indicator (valid / N errors) with an error list popover.
6. **Auto-layout** — toolbar button re-runs dagre layout.
7. **Electron shell** — desktop window, native file dialogs, standard title.

Out of scope (YAGNI for MVP): multiple schema files/projects, instance-data validation UI,
undo/redo, many-to-many join modeling, non-`$defs` schema layouts, collaborative editing.

## Error handling

- Import: meta-schema failures → dialog stays open, AJV errors listed; unsupported
  constructs → warnings toast, best-effort parse.
- Editing: duplicate object names and duplicate property names within an object are
  rejected inline in the inspector; relation property names collide with scalar property
  names → rejected.
- Serialization is total: any editor state produces a valid schema (guaranteed by tests).

## Testing

- `bun test` on `src/model`: parser cases (each relation shape, inheritance, positions,
  invalid schema rejection), serializer cases, **round-trip property**: for each fixture
  model, `parse(serialize(m))` equals `m` (modulo ids), and `serialize(parse(s))` equals
  normalized `s`.
- Store action tests (zustand is plain TS).
- `bun run build` type-checks and bundles the SPA; Electron packaging smoke via
  `bun run electron` in dev.

## Stack versions (latest at design time)

@xyflow/react 12.11.x · ajv 8.20.x (2020-12 mode) · tailwindcss 4.3.x · shadcn/ui (CLI
latest) · electron 43.x · vite 8.x · zustand 5.x · @dagrejs/dagre 3.1.x · React 19 · TS 5.x
