import dagre from '@dagrejs/dagre'
import type { DataModel } from './types'

export const NODE_WIDTH = 240

export function nodeHeight(propertyCount: number): number {
  return 60 + 24 * propertyCount
}

/**
 * First grid slot that doesn't overlap an existing node (with margin), scanning
 * rows left-to-right from the model's top-left corner. Keeps new objects from
 * stacking on top of existing ones.
 */
export function freePosition(model: DataModel): { x: number; y: number } {
  if (model.objects.length === 0) return { x: 80, y: 80 }
  const MARGIN = 40
  const rects = model.objects.map((o) => ({
    x: o.position.x,
    y: o.position.y,
    w: NODE_WIDTH,
    h: nodeHeight(o.properties.length),
  }))
  const originX = Math.min(...rects.map((r) => r.x))
  const originY = Math.min(...rects.map((r) => r.y))
  const stepX = NODE_WIDTH + 2 * MARGIN
  const stepY = nodeHeight(3) + 2 * MARGIN
  const candidate = { w: NODE_WIDTH, h: nodeHeight(3) }
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 40; col++) {
      const x = originX + col * stepX
      const y = originY + row * stepY
      const collides = rects.some(
        (r) =>
          x < r.x + r.w + MARGIN &&
          x + candidate.w + MARGIN > r.x &&
          y < r.y + r.h + MARGIN &&
          y + candidate.h + MARGIN > r.y,
      )
      if (!collides) return { x, y }
    }
  }
  return { x: originX, y: Math.max(...rects.map((r) => r.y + r.h)) + MARGIN }
}

export type LayoutDirection = 'LR' | 'TB'
export type LayoutSpacing = 'compact' | 'comfortable' | 'spacious'

export interface LayoutOptions {
  direction?: LayoutDirection
  spacing?: LayoutSpacing
}

const SPACING: Record<LayoutSpacing, { nodesep: number; ranksep: number }> = {
  compact: { nodesep: 30, ranksep: 50 },
  comfortable: { nodesep: 60, ranksep: 100 },
  spacious: { nodesep: 110, ranksep: 170 },
}

export function autoLayout(model: DataModel, options: LayoutOptions = {}): DataModel {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({
    rankdir: options.direction ?? 'LR',
    ...SPACING[options.spacing ?? 'comfortable'],
  })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const obj of model.objects) {
    graph.setNode(obj.id, { width: NODE_WIDTH, height: nodeHeight(obj.properties.length) })
  }
  for (const rel of model.relations) {
    graph.setEdge(rel.sourceId, rel.targetId)
  }

  dagre.layout(graph)

  return {
    ...model,
    objects: model.objects.map((obj) => {
      const node = graph.node(obj.id)
      return {
        ...obj,
        position: {
          x: Math.round(node.x - NODE_WIDTH / 2),
          y: Math.round(node.y - nodeHeight(obj.properties.length) / 2),
        },
      }
    }),
  }
}
