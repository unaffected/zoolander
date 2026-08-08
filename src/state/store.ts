import { create } from 'zustand'
import { type Edge, type Node } from '@xyflow/react'
import type { ProjectMeta } from '@/lib/project-store'
import type { DataModel, ModelObject, Property, Relation, RelationEnd } from '@/model/types'
import {
  autoLayout,
  freePosition,
  type LayoutDirection,
  type LayoutSpacing,
} from '@/model/layout'
import { uuidv7 } from '@/model/uuid'
import { serialize } from '@/model/serialize'
import type { ValidationResult } from '@/model/validate'
import { validateSchema } from '@/model/validate'

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

export function emptyModel(): DataModel {
  return { title: 'Untitled Model', objects: [], relations: [] }
}

export type ObjectNodeType = Node<{ object: ModelObject }, 'object'>
export type RelationEdgeType = Edge<{ relation: Relation }, 'relation'>

// Cache flow wrappers per model entity so unchanged objects keep node identity
// across store updates — otherwise React Flow re-renders every node on any edit.
const nodeCache = new WeakMap<ModelObject, ObjectNodeType>()
const edgeCache = new WeakMap<Relation, RelationEdgeType>()

export function toFlow(model: DataModel): { nodes: ObjectNodeType[]; edges: RelationEdgeType[] } {
  return {
    nodes: model.objects.map((object) => {
      let node = nodeCache.get(object)
      if (!node) {
        node = { id: object.id, type: 'object', position: object.position, data: { object } }
        nodeCache.set(object, node)
      }
      return node
    }),
    edges: model.relations.map((relation) => {
      let edge = edgeCache.get(relation)
      if (!edge) {
        // Markers are owned by RelationEdge (cardinality notation per end).
        edge = {
          id: relation.id,
          type: 'relation',
          source: relation.sourceId,
          target: relation.targetId,
          data: { relation },
        }
        edgeCache.set(relation, edge)
      }
      return edge
    }),
  }
}

/**
 * Flow nodes/edges decorated for rendering: `selected` comes from the app's
 * selection (single source of truth — the inspector and canvas ring can never
 * disagree), and search/neighborhood dimming is applied. Always returns fresh
 * node/edge objects: React Flow mutates `selected` on the objects it's handed,
 * so cached objects must never reach it. `data` identity stays stable so
 * memoized node components skip re-rendering.
 */
export function deriveFlow(
  model: DataModel,
  selectedObjectId: string | null,
  searchQuery: string,
): { nodes: ObjectNodeType[]; edges: RelationEdgeType[] } {
  const flow = toFlow(model)
  const matches = searchMatches(model, searchQuery)
  const neighborhood = selectedObjectId
    ? new Set([
        selectedObjectId,
        ...model.relations
          .filter((r) => r.sourceId === selectedObjectId || r.targetId === selectedObjectId)
          .flatMap((r) => [r.sourceId, r.targetId]),
      ])
    : null
  const dimNode = (id: string) =>
    (matches !== null && !matches.has(id)) || (neighborhood !== null && !neighborhood.has(id))
  return {
    nodes: flow.nodes.map((n) => ({
      ...n,
      selected: n.id === selectedObjectId,
      style: dimNode(n.id) ? { opacity: 0.25 } : undefined,
    })),
    edges: flow.edges.map((e) => {
      const touchesSelection =
        selectedObjectId !== null && (e.source === selectedObjectId || e.target === selectedObjectId)
      if (touchesSelection && !dimNode(e.source) && !dimNode(e.target)) {
        return { ...e, style: { stroke: 'var(--color-primary)', strokeWidth: 2 } }
      }
      if (dimNode(e.source) || dimNode(e.target)) return { ...e, style: { opacity: 0.15 } }
      return { ...e }
    }),
  }
}

export interface ZoolanderState {
  model: DataModel
  selectedObjectId: string | null
  validation: ValidationResult
  /** Label of the mutation that produced the current model; drives the event log. */
  lastAction: string | null
  past: DataModel[]
  future: DataModel[]
  undo: () => void
  redo: () => void
  searchQuery: string
  setSearch: (query: string) => void
  view: 'model' | 'data'
  setView: (view: 'model' | 'data') => void
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  minimap: boolean
  toggleMinimap: () => void
  grid: boolean
  toggleGrid: () => void
  layoutDirection: LayoutDirection
  setLayoutDirection: (direction: LayoutDirection) => void
  layoutSpacing: LayoutSpacing
  setLayoutSpacing: (spacing: LayoutSpacing) => void
  projectId: string | null
  projects: ProjectMeta[]
  setProjectContext: (projectId: string | null, projects: ProjectMeta[]) => void
  /** Add an object (auto-named unless a name is given); returns its id, or null if the name is invalid/taken. */
  addObject: (name?: string) => string | null
  deleteObject: (id: string) => void
  renameObject: (id: string, name: string) => boolean
  setObjectDescription: (id: string, description: string) => void
  addProperty: (objectId: string) => void
  updateProperty: (objectId: string, index: number, prop: Property) => boolean
  deleteProperty: (objectId: string, index: number) => void
  addRelation: (
    sourceId: string,
    targetId: string,
    propertyName: string,
    cardinality: 'one' | 'many',
    inverse?: RelationEnd,
  ) => boolean
  deleteRelation: (id: string) => void
  moveObject: (id: string, position: { x: number; y: number }) => void
  select: (id: string | null) => void
  setTitle: (title: string) => void
  loadModel: (model: DataModel, source?: 'load' | 'import') => void
  applyAutoLayout: () => void
}

function validate(model: DataModel): ValidationResult {
  return validateSchema(serialize(model))
}

function propertyNamesInUse(model: DataModel, objectId: string): Set<string> {
  const names = new Set<string>()
  const obj = model.objects.find((o) => o.id === objectId)
  for (const p of obj?.properties ?? []) names.add(p.name)
  for (const r of model.relations) {
    if (r.sourceId === objectId && r.kind === 'ref') names.add(r.propertyName)
    if (r.targetId === objectId && r.kind === 'ref' && r.inverse) names.add(r.inverse.propertyName)
  }
  return names
}

const HISTORY_LIMIT = 100

// UI prefs survive restarts; guarded so the store loads under bun tests.
function uiPref(key: string, fallback: string): string {
  return typeof localStorage === 'undefined'
    ? fallback
    : (localStorage.getItem(`zoolander.ui.${key}`) ?? fallback)
}

function setUiPref(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(`zoolander.ui.${key}`, value)
}

/**
 * Relation-backed field rows for an object's node card, encoded as
 * "name|TypeLabel" strings so a shallow-equality selector stays stable.
 */
export function relationRows(model: DataModel, objectId: string): string[] {
  const nameById = new Map(model.objects.map((o) => [o.id, o.name]))
  const label = (name: string, cardinality: 'one' | 'many') =>
    cardinality === 'many' ? `${name}[]` : name
  const rows: string[] = []
  for (const rel of model.relations) {
    if (rel.kind !== 'ref') continue
    if (rel.sourceId === objectId) {
      const target = nameById.get(rel.targetId)
      if (target) rows.push(`${rel.propertyName}|${label(target, rel.cardinality)}`)
    }
    if (rel.targetId === objectId && rel.inverse) {
      const source = nameById.get(rel.sourceId)
      if (source) rows.push(`${rel.inverse.propertyName}|${label(source, rel.inverse.cardinality)}`)
    }
  }
  return rows
}

/** Object ids whose name or property names match the query (empty query → null). */
export function searchMatches(model: DataModel, query: string): Set<string> | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return new Set(
    model.objects
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.properties.some((p) => p.name.toLowerCase().includes(q)),
      )
      .map((o) => o.id),
  )
}

export const useStore = create<ZoolanderState>((set, get) => {
  const commit = (model: DataModel, action: string, options?: { skipValidation?: boolean }) => {
    const { model: previous, past, validation } = get()
    set({
      model,
      lastAction: action,
      validation: options?.skipValidation ? validation : validate(model),
      past: [...past.slice(-(HISTORY_LIMIT - 1)), previous],
      future: [],
    })
  }

  return {
    model: emptyModel(),
    selectedObjectId: null,
    validation: { valid: true, errors: [] },
    lastAction: null,
    past: [],
    future: [],
    searchQuery: '',
    projectId: null,
    projects: [],

    setSearch: (searchQuery) => set({ searchQuery }),

    view: 'model',
    setView: (view) => set({ view }),

    // Applied/persisted by App; kept here so the menu stays in sync.
    theme: 'system',
    setTheme: (theme) => set({ theme }),

    minimap: uiPref('minimap', '1') !== '0',
    toggleMinimap: () => {
      const minimap = !get().minimap
      set({ minimap })
      setUiPref('minimap', minimap ? '1' : '0')
    },

    grid: uiPref('grid', '1') !== '0',
    toggleGrid: () => {
      const grid = !get().grid
      set({ grid })
      setUiPref('grid', grid ? '1' : '0')
    },

    layoutDirection: uiPref('layoutDirection', 'LR') === 'TB' ? 'TB' : 'LR',
    setLayoutDirection: (layoutDirection) => {
      set({ layoutDirection })
      setUiPref('layoutDirection', layoutDirection)
    },

    layoutSpacing: (['compact', 'comfortable', 'spacious'] as const).includes(
      uiPref('layoutSpacing', 'comfortable') as LayoutSpacing,
    )
      ? (uiPref('layoutSpacing', 'comfortable') as LayoutSpacing)
      : 'comfortable',
    setLayoutSpacing: (layoutSpacing) => {
      set({ layoutSpacing })
      setUiPref('layoutSpacing', layoutSpacing)
    },

    setProjectContext: (projectId, projects) => set({ projectId, projects }),

    undo: () => {
      const { past, future, model } = get()
      const previous = past.at(-1)
      if (!previous) return
      set({
        model: previous,
        lastAction: 'undo',
        past: past.slice(0, -1),
        future: [model, ...future],
        validation: validate(previous),
      })
    },

    redo: () => {
      const { past, future, model } = get()
      const next = future[0]
      if (!next) return
      set({
        model: next,
        lastAction: 'redo',
        past: [...past, model],
        future: future.slice(1),
        validation: validate(next),
      })
    },

    addObject: (requestedName) => {
      const { model } = get()
      const existing = new Set(model.objects.map((o) => o.name))
      let name: string
      if (requestedName !== undefined) {
        if (!NAME_PATTERN.test(requestedName) || existing.has(requestedName)) return null
        name = requestedName
      } else {
        let i = 0
        do {
          i += 1
          name = `Resource${i}`
        } while (existing.has(name))
      }
      const id = uuidv7()
      const object: ModelObject = { id, name, properties: [], position: freePosition(model) }
      commit({ ...model, objects: [...model.objects, object] }, 'addObject')
      set({ selectedObjectId: id })
      return id
    },

    deleteObject: (id) => {
      const { model, selectedObjectId } = get()
      commit(
        {
          ...model,
          objects: model.objects.filter((o) => o.id !== id),
          relations: model.relations.filter((r) => r.sourceId !== id && r.targetId !== id),
        },
        'deleteObject',
      )
      if (selectedObjectId === id) set({ selectedObjectId: null })
    },

    renameObject: (id, name) => {
      const { model } = get()
      if (!NAME_PATTERN.test(name)) return false
      if (model.objects.some((o) => o.id !== id && o.name === name)) return false
      commit(
        { ...model, objects: model.objects.map((o) => (o.id === id ? { ...o, name } : o)) },
        'renameObject',
      )
      return true
    },

    setObjectDescription: (id, description) => {
      const { model } = get()
      commit(
        {
          ...model,
          objects: model.objects.map((o) =>
            o.id === id ? { ...o, description: description || undefined } : o,
          ),
        },
        'setObjectDescription',
      )
    },

    addProperty: (objectId) => {
      const { model } = get()
      const used = propertyNamesInUse(model, objectId)
      let i = 0
      let name: string
      do {
        i += 1
        name = `field${i}`
      } while (used.has(name))
      const prop: Property = { name, type: 'string', required: false }
      commit(
        {
          ...model,
          objects: model.objects.map((o) =>
            o.id === objectId ? { ...o, properties: [...o.properties, prop] } : o,
          ),
        },
        'addProperty',
      )
    },

    updateProperty: (objectId, index, prop) => {
      const { model } = get()
      const obj = model.objects.find((o) => o.id === objectId)
      if (!obj || !obj.properties[index]) return false
      if (!NAME_PATTERN.test(prop.name)) return false
      const used = propertyNamesInUse(model, objectId)
      used.delete(obj.properties[index].name)
      if (used.has(prop.name)) return false
      commit(
        {
          ...model,
          objects: model.objects.map((o) =>
            o.id === objectId
              ? { ...o, properties: o.properties.map((p, i) => (i === index ? prop : p)) }
              : o,
          ),
        },
        'updateProperty',
      )
      return true
    },

    deleteProperty: (objectId, index) => {
      const { model } = get()
      commit(
        {
          ...model,
          objects: model.objects.map((o) =>
            o.id === objectId ? { ...o, properties: o.properties.filter((_, i) => i !== index) } : o,
          ),
        },
        'deleteProperty',
      )
    },

    addRelation: (sourceId, targetId, propertyName, cardinality, inverse) => {
      const { model } = get()
      if (!NAME_PATTERN.test(propertyName)) return false
      if (propertyNamesInUse(model, sourceId).has(propertyName)) return false
      if (!model.objects.some((o) => o.id === sourceId) || !model.objects.some((o) => o.id === targetId)) return false
      if (inverse) {
        if (!NAME_PATTERN.test(inverse.propertyName)) return false
        if (propertyNamesInUse(model, targetId).has(inverse.propertyName)) return false
        if (sourceId === targetId && inverse.propertyName === propertyName) return false
      }
      const relation: Relation = {
        id: uuidv7(),
        sourceId,
        targetId,
        propertyName,
        cardinality,
        kind: 'ref',
        ...(inverse ? { inverse } : {}),
      }
      commit({ ...model, relations: [...model.relations, relation] }, 'addRelation')
      return true
    },

    deleteRelation: (id) => {
      const { model } = get()
      commit({ ...model, relations: model.relations.filter((r) => r.id !== id) }, 'deleteRelation')
    },

    moveObject: (id, position) => {
      const { model } = get()
      // Position changes don't affect schema validity; skip revalidation.
      commit(
        {
          ...model,
          objects: model.objects.map((o) => (o.id === id ? { ...o, position } : o)),
        },
        'moveObject',
        { skipValidation: true },
      )
    },

    select: (id) => set({ selectedObjectId: id }),

    setTitle: (title) => {
      const { model } = get()
      commit({ ...model, title: title || 'Untitled Model' }, 'setTitle')
    },

    loadModel: (model, source = 'load') => {
      set({
        model,
        lastAction: source,
        validation: validate(model),
        selectedObjectId: null,
        past: [],
        future: [],
      })
    },

    applyAutoLayout: () => {
      const { model, layoutDirection, layoutSpacing } = get()
      commit(
        autoLayout(model, { direction: layoutDirection, spacing: layoutSpacing }),
        'autoLayout',
        { skipValidation: true },
      )
    },
  }
})
