import type { Dispatch, ReactElement, SetStateAction } from 'react'
import { Arrow, Circle, Group, Line } from 'react-konva'

import type { LocalConnectorOverride, LocalPositionOverride, LocalSizeOverride } from '../hooks/useObjectSync'
import {
  getAnchorPointForObject,
  normalizeAnchorKind,
  normalizeConnectorStyle,
  toConnectorPatch,
  type ConnectorPatch,
} from '../lib/boardGeometry'
import { nowMs } from '../lib/time'
import type { AnchorKind, BoardObject, Point } from '../types/board'
import type {
  CommentBadgeRenderer,
  ConnectorBoardObject,
  ObjectPatchHandler,
  ObjectSelectionHandler,
  VoteBadgeRenderer,
} from './boardObjectRendererShared'

type ResolvedSnappedEndpoint = {
  anchor: AnchorKind | null
  objectId: string | null
  point: Point
}

type BoundBoardObject = Exclude<BoardObject, { type: 'connector' }>

interface RenderConnectorObjectArgs {
  boardObject: ConnectorBoardObject
  canEditBoard: boolean
  connectorHandleRadius: number
  getConnectorPublisher: (objectId: string) => (patch: ConnectorPatch) => void
  handleObjectSelection: ObjectSelectionHandler
  hovered: boolean
  localConnectorGeometry: Record<string, LocalConnectorOverride>
  localObjectPositions: Record<string, LocalPositionOverride>
  localObjectSizes: Record<string, LocalSizeOverride>
  objectsById: Map<string, BoardObject>
  patchObject: ObjectPatchHandler
  renderCommentBadge: CommentBadgeRenderer
  renderVoteBadge: VoteBadgeRenderer
  resolveSnappedEndpoint: (point: Point) => ResolvedSnappedEndpoint
  selected: boolean
  setDraggingConnectorId: Dispatch<SetStateAction<string | null>>
  setHoveredObjectId: Dispatch<SetStateAction<string | null>>
  setLocalConnectorGeometry: Dispatch<SetStateAction<Record<string, LocalConnectorOverride>>>
  themeMode: 'light' | 'dark'
}

const inferConnectorAnchorsBetweenObjects = (
  fromObject: BoundBoardObject,
  toObject: BoundBoardObject,
): { fromAnchor: Exclude<AnchorKind, 'center'>; toAnchor: Exclude<AnchorKind, 'center'> } => {
  const fromCenter = {
    x: fromObject.position.x + fromObject.size.width / 2,
    y: fromObject.position.y + fromObject.size.height / 2,
  }
  const toCenter = {
    x: toObject.position.x + toObject.size.width / 2,
    y: toObject.position.y + toObject.size.height / 2,
  }
  const deltaX = toCenter.x - fromCenter.x
  const deltaY = toCenter.y - fromCenter.y

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { fromAnchor: 'right', toAnchor: 'left' }
      : { fromAnchor: 'left', toAnchor: 'right' }
  }

  return deltaY >= 0
    ? { fromAnchor: 'bottom', toAnchor: 'top' }
    : { fromAnchor: 'top', toAnchor: 'bottom' }
}

const resolveBoundObject = (
  candidate: BoardObject | undefined,
  localObjectPositions: Record<string, LocalPositionOverride>,
  localObjectSizes: Record<string, LocalSizeOverride>,
): BoundBoardObject | null => {
  if (!candidate || candidate.type === 'connector') {
    return null
  }

  return {
    ...candidate,
    position: localObjectPositions[candidate.id]?.point || candidate.position,
    size: localObjectSizes[candidate.id]?.size || candidate.size,
  }
}

export const renderConnectorObject = (args: RenderConnectorObjectArgs): ReactElement => {
  const {
    boardObject,
    canEditBoard,
    connectorHandleRadius,
    getConnectorPublisher,
    handleObjectSelection,
    hovered,
    localConnectorGeometry,
    localObjectPositions,
    localObjectSizes,
    objectsById,
    patchObject,
    renderCommentBadge,
    renderVoteBadge,
    resolveSnappedEndpoint,
    selected,
    setDraggingConnectorId,
    setHoveredObjectId,
    setLocalConnectorGeometry,
    themeMode,
  } = args

  const baseConnectorGeometry = localConnectorGeometry[boardObject.id] || {
    start: boardObject.start,
    end: boardObject.end,
    fromObjectId: boardObject.fromObjectId ?? null,
    toObjectId: boardObject.toObjectId ?? null,
    fromAnchor: boardObject.fromAnchor ?? null,
    toAnchor: boardObject.toAnchor ?? null,
  }

  const fromObject = resolveBoundObject(
    baseConnectorGeometry.fromObjectId ? objectsById.get(baseConnectorGeometry.fromObjectId) : undefined,
    localObjectPositions,
    localObjectSizes,
  )
  const toObject = resolveBoundObject(
    baseConnectorGeometry.toObjectId ? objectsById.get(baseConnectorGeometry.toObjectId) : undefined,
    localObjectPositions,
    localObjectSizes,
  )

  const explicitFromAnchor = normalizeAnchorKind(baseConnectorGeometry.fromAnchor)
  const explicitToAnchor = normalizeAnchorKind(baseConnectorGeometry.toAnchor)
  const inferredAnchors = fromObject && toObject ? inferConnectorAnchorsBetweenObjects(fromObject, toObject) : null

  const resolvedFromAnchor = fromObject
    ? explicitFromAnchor && explicitFromAnchor !== 'center'
      ? explicitFromAnchor
      : inferredAnchors?.fromAnchor || explicitFromAnchor || 'center'
    : null
  const resolvedToAnchor = toObject
    ? explicitToAnchor && explicitToAnchor !== 'center'
      ? explicitToAnchor
      : inferredAnchors?.toAnchor || explicitToAnchor || 'center'
    : null

  const connectorGeometry = {
    ...baseConnectorGeometry,
    start:
      fromObject && resolvedFromAnchor
        ? getAnchorPointForObject(fromObject, resolvedFromAnchor) || baseConnectorGeometry.start
        : baseConnectorGeometry.start,
    end:
      toObject && resolvedToAnchor
        ? getAnchorPointForObject(toObject, resolvedToAnchor) || baseConnectorGeometry.end
        : baseConnectorGeometry.end,
    fromAnchor: resolvedFromAnchor,
    toAnchor: resolvedToAnchor,
  }

  const connectorDefaultColor = themeMode === 'dark' ? '#e2e8f0' : '#0f172a'
  const rawConnectorColor = typeof boardObject.color === 'string' ? boardObject.color.toLowerCase().trim() : ''
  const connectorBaseColor =
    themeMode === 'dark' && rawConnectorColor === '#0f172a'
      ? connectorDefaultColor
      : boardObject.color || connectorDefaultColor
  const connectorStroke = selected ? '#1d4ed8' : hovered ? '#0f766e' : connectorBaseColor
  const connectorOutlineColor = themeMode === 'dark' ? 'rgba(248, 250, 252, 0.72)' : 'rgba(15, 23, 42, 0.24)'
  const connectorStrokeWidth = selected ? 3 : hovered ? 2.6 : 2
  const connectorOutlineWidth = connectorStrokeWidth + 2.2
  const connectorStyle = normalizeConnectorStyle(boardObject.style)
  const voteCount = Object.keys(boardObject.votesByUser || {}).length
  const commentCount = boardObject.comments?.length || 0
  const connectorPoints = [
    connectorGeometry.start.x,
    connectorGeometry.start.y,
    connectorGeometry.end.x,
    connectorGeometry.end.y,
  ]
  const connectorMidpoint = {
    x: (connectorGeometry.start.x + connectorGeometry.end.x) / 2,
    y: (connectorGeometry.start.y + connectorGeometry.end.y) / 2,
  }

  const persistLocalConnectorPatch = (
    next: ConnectorPatch,
    mode: LocalConnectorOverride['mode'],
  ) => {
    setLocalConnectorGeometry((previous) => ({
      ...previous,
      [boardObject.id]: {
        start: next.start,
        end: next.end,
        fromObjectId: next.fromObjectId,
        toObjectId: next.toObjectId,
        fromAnchor: next.fromAnchor,
        toAnchor: next.toAnchor,
        mode,
        updatedAt: nowMs(),
      },
    }))
  }

  return (
    <Group
      key={boardObject.id}
      onClick={(event) => handleObjectSelection(boardObject, Boolean(event.evt.shiftKey))}
      onTap={() => handleObjectSelection(boardObject)}
      onMouseEnter={() => {
        setHoveredObjectId(boardObject.id)
      }}
      onMouseLeave={() => {
        setHoveredObjectId((previous) => (previous === boardObject.id ? null : previous))
      }}
    >
      {connectorStyle === 'arrow' ? (
        <>
          <Arrow
            points={connectorPoints}
            pointerLength={13}
            pointerWidth={12}
            fill={connectorOutlineColor}
            stroke={connectorOutlineColor}
            strokeWidth={connectorOutlineWidth}
            lineCap="round"
            lineJoin="round"
            listening={false}
            hitStrokeWidth={0}
          />
          <Arrow
            points={connectorPoints}
            pointerLength={12}
            pointerWidth={11}
            fill={connectorStroke}
            stroke={connectorStroke}
            strokeWidth={connectorStrokeWidth}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={16}
          />
        </>
      ) : (
        <>
          <Line
            points={connectorPoints}
            stroke={connectorOutlineColor}
            strokeWidth={connectorOutlineWidth}
            lineCap="round"
            lineJoin="round"
            listening={false}
            hitStrokeWidth={0}
          />
          <Line
            points={connectorPoints}
            stroke={connectorStroke}
            strokeWidth={connectorStrokeWidth}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={16}
          />
        </>
      )}
      {renderVoteBadge({
        voteCount,
        x: connectorMidpoint.x + 6,
        y: connectorMidpoint.y - 23,
      })}
      {renderCommentBadge({
        commentCount,
        x:
          connectorMidpoint.x +
          6 -
          (commentCount > 0 && voteCount > 0 ? 24 : 0) -
          (voteCount > 0 ? 0 : 12),
        y: connectorMidpoint.y - 23,
      })}
      {selected && canEditBoard ? (
        <>
          <Circle
            x={connectorGeometry.start.x}
            y={connectorGeometry.start.y}
            radius={connectorHandleRadius}
            fill="#ffffff"
            stroke="#1d4ed8"
            strokeWidth={2}
            draggable
            onDragStart={() => {
              setDraggingConnectorId(boardObject.id)
            }}
            onDragMove={(event) => {
              const snapped = resolveSnappedEndpoint({
                x: event.target.x(),
                y: event.target.y(),
              })
              const next = toConnectorPatch({
                start: snapped.point,
                end: connectorGeometry.end,
                fromObjectId: snapped.objectId,
                fromAnchor: snapped.anchor,
                toObjectId: connectorGeometry.toObjectId,
                toAnchor: connectorGeometry.toAnchor,
              })
              persistLocalConnectorPatch(next, 'dragging')
              getConnectorPublisher(boardObject.id)(next)
            }}
            onDragEnd={(event) => {
              const snapped = resolveSnappedEndpoint({
                x: event.target.x(),
                y: event.target.y(),
              })
              const next = toConnectorPatch({
                start: snapped.point,
                end: connectorGeometry.end,
                fromObjectId: snapped.objectId,
                fromAnchor: snapped.anchor,
                toObjectId: connectorGeometry.toObjectId,
                toAnchor: connectorGeometry.toAnchor,
              })
              persistLocalConnectorPatch(next, 'pending')
              setDraggingConnectorId(null)
              void patchObject(boardObject.id, next)
            }}
          />
          <Circle
            x={connectorGeometry.end.x}
            y={connectorGeometry.end.y}
            radius={connectorHandleRadius}
            fill="#ffffff"
            stroke="#1d4ed8"
            strokeWidth={2}
            draggable
            onDragStart={() => {
              setDraggingConnectorId(boardObject.id)
            }}
            onDragMove={(event) => {
              const snapped = resolveSnappedEndpoint({
                x: event.target.x(),
                y: event.target.y(),
              })
              const next = toConnectorPatch({
                start: connectorGeometry.start,
                end: snapped.point,
                fromObjectId: connectorGeometry.fromObjectId,
                fromAnchor: connectorGeometry.fromAnchor,
                toObjectId: snapped.objectId,
                toAnchor: snapped.anchor,
              })
              persistLocalConnectorPatch(next, 'dragging')
              getConnectorPublisher(boardObject.id)(next)
            }}
            onDragEnd={(event) => {
              const snapped = resolveSnappedEndpoint({
                x: event.target.x(),
                y: event.target.y(),
              })
              const next = toConnectorPatch({
                start: connectorGeometry.start,
                end: snapped.point,
                fromObjectId: connectorGeometry.fromObjectId,
                fromAnchor: connectorGeometry.fromAnchor,
                toObjectId: snapped.objectId,
                toAnchor: snapped.anchor,
              })
              persistLocalConnectorPatch(next, 'pending')
              setDraggingConnectorId(null)
              void patchObject(boardObject.id, next)
            }}
          />
        </>
      ) : null}
    </Group>
  )
}
