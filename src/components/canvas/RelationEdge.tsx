import { memo } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { RelationEdgeType } from '@/state/store'

/**
 * Crow's-foot markers referenced by RelationEdge. Rendered once by Canvas;
 * url(#…) references resolve document-wide.
 */
export function RelationMarkerDefs() {
  const stroke = 'var(--color-muted-foreground)'
  return (
    <svg aria-hidden width={0} height={0} className="absolute">
      <defs>
        <marker
          id="zl-one"
          viewBox="0 0 12 12"
          markerWidth={12}
          markerHeight={12}
          markerUnits="userSpaceOnUse"
          refX={9}
          refY={6}
          orient="auto-start-reverse"
        >
          <path d="M5,1.5 L5,10.5" fill="none" stroke={stroke} strokeWidth={1.5} />
        </marker>
        <marker
          id="zl-many"
          viewBox="0 0 12 12"
          markerWidth={12}
          markerHeight={12}
          markerUnits="userSpaceOnUse"
          refX={11}
          refY={6}
          orient="auto-start-reverse"
        >
          <path
            d="M1,6 L11,1.5 M1,6 L11,6 M1,6 L11,10.5"
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
          />
        </marker>
        <marker
          id="zl-arrow"
          viewBox="0 0 12 12"
          markerWidth={14}
          markerHeight={14}
          markerUnits="userSpaceOnUse"
          refX={11}
          refY={6}
          orient="auto-start-reverse"
        >
          <path d="M1,1.5 L11,6 L1,10.5 Z" fill={stroke} stroke="none" />
        </marker>
      </defs>
    </svg>
  )
}

const markerFor = (cardinality: 'one' | 'many') =>
  cardinality === 'many' ? 'url(#zl-many)' : 'url(#zl-one)'

export const RelationEdge = memo(function RelationEdge(props: EdgeProps<RelationEdgeType>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const relation = data?.relation
  const isInheritance = relation?.kind === 'inheritance'

  // Traditional notation: the marker at each end shows how many of that end's
  // object participate — target end from the forward cardinality, source end
  // from the inverse (when defined).
  const markerEnd = isInheritance ? 'url(#zl-arrow)' : markerFor(relation?.cardinality ?? 'one')
  const markerStart =
    !isInheritance && relation?.inverse ? markerFor(relation.inverse.cardinality) : undefined

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={{
        strokeWidth: selected ? 2.5 : 1.5,
        stroke: 'var(--color-muted-foreground)',
        strokeDasharray: isInheritance ? '6 4' : undefined,
      }}
    />
  )
})
