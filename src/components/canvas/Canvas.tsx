import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
  type OnConnectStart,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { deriveFlow, useStore, type ObjectNodeType, type RelationEdgeType } from '@/state/store'
import { ObjectNode } from './ObjectNode'
import { RelationEdge, RelationMarkerDefs } from './RelationEdge'

const nodeTypes = { object: ObjectNode }
const edgeTypes = { relation: RelationEdge }

export interface CanvasProps {
  onConnectRequest: (sourceId: string, targetId: string) => void
}

export function Canvas({ onConnectRequest }: CanvasProps) {
  const model = useStore((s) => s.model)
  const moveObject = useStore((s) => s.moveObject)
  const select = useStore((s) => s.select)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const searchQuery = useStore((s) => s.searchQuery)
  const lastAction = useStore((s) => s.lastAction)
  const minimap = useStore((s) => s.minimap)
  const grid = useStore((s) => s.grid)
  const objectCount = model.objects.length
  const projectId = useStore((s) => s.projectId)
  const { fitView } = useReactFlow()

  // Fit the viewport once per project. The `fitView` prop can't do this — it
  // fires at init and races the async model load. Calling fitView() eagerly is
  // safe: React Flow queues it until the project's nodes have been measured.
  const fittedProject = useRef<string | null>(null)
  useEffect(() => {
    if (projectId === null || fittedProject.current === projectId) return
    fittedProject.current = projectId
    void fitView({ padding: 0.15, maxZoom: 1.25 })
  }, [projectId, fitView])

  // Center on freshly added objects — they may land outside the viewport.
  useEffect(() => {
    const id = useStore.getState().selectedObjectId
    if (lastAction !== 'addObject' || !id) return
    void fitView({ nodes: [{ id }], duration: 250, maxZoom: 1 })
  }, [lastAction, objectCount, fitView])

  // The store is the source of truth; local React Flow state exists so the
  // library's interaction changes (live drag positions, selection) apply
  // between store commits. Without onNodesChange applying them, controlled
  // nodes never move during a drag and selection rings go stale.
  const derived = useMemo(
    () => deriveFlow(model, selectedObjectId, searchQuery),
    [model, searchQuery, selectedObjectId],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<ObjectNodeType>(derived.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationEdgeType>(derived.edges)
  useEffect(() => setNodes(derived.nodes), [derived.nodes, setNodes])
  useEffect(() => setEdges(derived.edges), [derived.edges, setEdges])

  const onNodeDragStart: OnNodeDrag<ObjectNodeType> = useCallback(
    (_event, node) => select(node.id),
    [select],
  )

  const onNodeDragStop: OnNodeDrag<ObjectNodeType> = useCallback(
    (_event, node) => moveObject(node.id, node.position),
    [moveObject],
  )

  const onNodeClick: NodeMouseHandler<ObjectNodeType> = useCallback(
    (_event, node) => select(node.id),
    [select],
  )

  // React Flow normalizes connections to source-handle → target-handle, which
  // can invert the user's gesture. Track where the drag started so the dialog
  // always reads drag-start → drag-end.
  const connectStartNode = useRef<string | null>(null)
  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartNode.current = params.nodeId
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const start = connectStartNode.current
      if (start === connection.target) onConnectRequest(connection.target, connection.source)
      else onConnectRequest(connection.source, connection.target)
    },
    [onConnectRequest],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onPaneClick={() => select(null)}
      onConnectStart={onConnectStart}
      onConnect={onConnect}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <RelationMarkerDefs />
      {grid && (
        <Background
          gap={24}
          size={2}
          color="color-mix(in oklab, var(--color-muted-foreground) 50%, transparent)"
        />
      )}
      {minimap && <MiniMap pannable zoomable />}
      <Controls />
    </ReactFlow>
  )
}
