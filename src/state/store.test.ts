import { beforeEach, describe, expect, test } from 'bun:test'
import { deriveFlow, emptyModel, toFlow, useStore } from './store'

beforeEach(() => {
  useStore.getState().loadModel(emptyModel())
})

describe('store actions', () => {
  test('addObject creates auto-named objects', () => {
    useStore.getState().addObject()
    useStore.getState().addObject()
    const names = useStore.getState().model.objects.map((o) => o.name)
    expect(names).toEqual(['Resource1', 'Resource2'])
    expect(useStore.getState().validation.valid).toBe(true)
  })

  test('renameObject rejects duplicates, empty, and invalid names', () => {
    const s = useStore.getState()
    s.addObject()
    s.addObject()
    const [a] = useStore.getState().model.objects
    expect(useStore.getState().renameObject(a!.id, 'Resource2')).toBe(false)
    expect(useStore.getState().renameObject(a!.id, '')).toBe(false)
    expect(useStore.getState().renameObject(a!.id, 'has/slash')).toBe(false)
    expect(useStore.getState().renameObject(a!.id, 'User')).toBe(true)
    expect(useStore.getState().model.objects[0]!.name).toBe('User')
  })

  test('deleteObject cascades its relations', () => {
    const s = useStore.getState()
    s.addObject()
    s.addObject()
    const [a, b] = useStore.getState().model.objects
    expect(useStore.getState().addRelation(a!.id, b!.id, 'items', 'many')).toBe(true)
    expect(useStore.getState().model.relations).toHaveLength(1)
    useStore.getState().deleteObject(b!.id)
    expect(useStore.getState().model.relations).toHaveLength(0)
    expect(useStore.getState().model.objects).toHaveLength(1)
  })

  test('addRelation rejects a property name that collides', () => {
    const s = useStore.getState()
    s.addObject()
    s.addObject()
    const [a, b] = useStore.getState().model.objects
    useStore.getState().addProperty(a!.id)
    const propName = useStore.getState().model.objects[0]!.properties[0]!.name
    expect(useStore.getState().addRelation(a!.id, b!.id, propName, 'one')).toBe(false)
    expect(useStore.getState().addRelation(a!.id, b!.id, 'other', 'one')).toBe(true)
    expect(useStore.getState().addRelation(a!.id, b!.id, 'other', 'many')).toBe(false)
  })

  test('updateProperty rejects duplicate names within an object', () => {
    const s = useStore.getState()
    s.addObject()
    const id = useStore.getState().model.objects[0]!.id
    useStore.getState().addProperty(id)
    useStore.getState().addProperty(id)
    const obj = useStore.getState().model.objects[0]!
    const second = obj.properties[1]!
    expect(useStore.getState().updateProperty(id, 1, { ...second, name: obj.properties[0]!.name })).toBe(false)
    expect(useStore.getState().updateProperty(id, 1, { ...second, name: 'renamed', type: 'integer' })).toBe(true)
    expect(useStore.getState().model.objects[0]!.properties[1]!.type).toBe('integer')
  })

  test('validation recomputes on mutation', () => {
    useStore.getState().addObject()
    expect(useStore.getState().validation.valid).toBe(true)
    expect(useStore.getState().validation.errors).toEqual([])
  })
})

describe('undo/redo', () => {
  test('undo reverts the last mutation and redo reapplies it', () => {
    useStore.getState().addObject()
    expect(useStore.getState().model.objects).toHaveLength(1)
    useStore.getState().undo()
    expect(useStore.getState().model.objects).toHaveLength(0)
    useStore.getState().redo()
    expect(useStore.getState().model.objects).toHaveLength(1)
  })

  test('a new mutation clears the redo stack', () => {
    useStore.getState().addObject()
    useStore.getState().addObject()
    useStore.getState().undo()
    useStore.getState().addObject()
    useStore.getState().redo()
    expect(useStore.getState().model.objects).toHaveLength(2)
  })

  test('undo with empty history is a no-op', () => {
    const before = useStore.getState().model
    useStore.getState().undo()
    expect(useStore.getState().model).toBe(before)
  })

  test('node moves are undoable', () => {
    useStore.getState().addObject()
    const id = useStore.getState().model.objects[0]!.id
    const origin = useStore.getState().model.objects[0]!.position
    useStore.getState().moveObject(id, { x: 500, y: 500 })
    useStore.getState().undo()
    expect(useStore.getState().model.objects[0]!.position).toEqual(origin)
  })

  test('loadModel resets history', () => {
    useStore.getState().addObject()
    useStore.getState().loadModel(emptyModel())
    useStore.getState().undo()
    expect(useStore.getState().model.objects).toHaveLength(0)
  })
})

describe('toFlow', () => {
  test('maps objects to nodes and relations to edges', () => {
    const s = useStore.getState()
    s.addObject()
    s.addObject()
    const [a, b] = useStore.getState().model.objects
    useStore.getState().addRelation(a!.id, b!.id, 'links', 'many')
    const { nodes, edges } = toFlow(useStore.getState().model)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]!.type).toBe('object')
    expect(edges).toHaveLength(1)
    expect(edges[0]!.type).toBe('relation')
    expect(edges[0]!.source).toBe(a!.id)
    expect(edges[0]!.target).toBe(b!.id)
  })
})

describe('addObject with explicit name', () => {
  test('creates with the given name and returns its id', () => {
    useStore.getState().loadModel({ title: 'T', objects: [], relations: [] })
    const id = useStore.getState().addObject('World')
    expect(id).not.toBeNull()
    const obj = useStore.getState().model.objects.find((o) => o.id === id)
    expect(obj?.name).toBe('World')
  })

  test('rejects duplicate or invalid names', () => {
    useStore.getState().loadModel({ title: 'T', objects: [], relations: [] })
    useStore.getState().addObject('World')
    expect(useStore.getState().addObject('World')).toBeNull()
    expect(useStore.getState().addObject('bad name!')).toBeNull()
    expect(useStore.getState().model.objects).toHaveLength(1)
  })
})

describe('deriveFlow', () => {
  const setup = () => {
    useStore.getState().loadModel({ title: 'T', objects: [], relations: [] })
    const s = useStore.getState()
    const a = s.addObject('World')!
    const b = useStore.getState().addObject('Region')!
    const c = useStore.getState().addObject('Island')!
    useStore.getState().addRelation(a, b, 'regions', 'many')
    return { a, b, c }
  }

  test('marks exactly the app-selected node as selected', () => {
    const { a } = setup()
    const { nodes } = deriveFlow(useStore.getState().model, a, '')
    expect(nodes.find((n) => n.id === a)?.selected).toBe(true)
    expect(nodes.filter((n) => n.selected)).toHaveLength(1)
  })

  test('no selection means no node is selected', () => {
    setup()
    const { nodes } = deriveFlow(useStore.getState().model, null, '')
    expect(nodes.every((n) => !n.selected)).toBe(true)
  })

  test('never hands React Flow the cached node objects (RF mutates selected in place)', () => {
    const { a } = setup()
    const model = useStore.getState().model
    const first = deriveFlow(model, a, '')
    // Simulate React Flow's internal selection mutation hack.
    first.nodes.forEach((n) => { n.selected = true })
    const second = deriveFlow(model, null, '')
    expect(second.nodes.every((n) => !n.selected)).toBe(true)
  })

  test('keeps data identity stable so memoized nodes skip re-render', () => {
    const { a } = setup()
    const model = useStore.getState().model
    const first = deriveFlow(model, a, '')
    const second = deriveFlow(model, null, '')
    expect(second.nodes[0]!.data).toBe(first.nodes[0]!.data)
  })

  test('dims nodes outside the selection neighborhood', () => {
    const { a, c } = setup()
    const { nodes } = deriveFlow(useStore.getState().model, a, '')
    expect(nodes.find((n) => n.id === c)?.style?.opacity).toBe(0.25)
    expect(nodes.find((n) => n.id === a)?.style?.opacity).toBeUndefined()
  })

  test('dims nodes not matching the search query', () => {
    const { a, b } = setup()
    const { nodes } = deriveFlow(useStore.getState().model, null, 'world')
    expect(nodes.find((n) => n.id === a)?.style?.opacity).toBeUndefined()
    expect(nodes.find((n) => n.id === b)?.style?.opacity).toBe(0.25)
  })

  test('highlights edges touching the selection', () => {
    const { a } = setup()
    const { edges } = deriveFlow(useStore.getState().model, a, '')
    expect(edges[0]!.style?.stroke).toBe('var(--color-primary)')
  })
})
