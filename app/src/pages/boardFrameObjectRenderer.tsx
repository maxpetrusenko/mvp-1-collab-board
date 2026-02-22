import type { Dispatch, MutableRefObject, ReactElement, SetStateAction } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type Konva from 'konva'

import type { LocalPositionOverride } from '../hooks/useObjectSync'
import { getContrastingTextColor } from '../lib/contrast'
import { nowMs } from '../lib/time'
import type { BoardObject, Point } from '../types/board'
import type { InlineEditorDraft } from './boardPageTypes'
import type {
  CommentBadgeRenderer,
  FrameBoardObject,
  ObjectPatchHandler,
  ObjectSelectionHandler,
  VoteBadgeRenderer,
} from './boardObjectRendererShared'

type FrameDragSnapshot = Record<string, { frameStart: Point; members: Array<{ id: string; start: Point }> }>
type MultiDragSnapshot = Record<string, { anchor: Point; members: Array<{ id: string; start: Point }> }>

interface RenderFrameObjectArgs {
  boardObject: FrameBoardObject
  position: Point
  size: { width: number; height: number }
  selected: boolean
  hovered: boolean
  canEditBoard: boolean
  selectionMode: 'select' | 'area'
  resizingObjectId: string | null
  rotatingObjectId: string | null
  inlineEditor: InlineEditorDraft | null
  selectedIdsCount: number
  selectedIdSet: Set<string>
  localObjectPositions: Record<string, LocalPositionOverride>
  localObjectRotations: Record<string, number>
  localObjectRotationsRef: MutableRefObject<Record<string, number>>
  liveDragPositionsRef: MutableRefObject<Record<string, Point>>
  objectsRef: MutableRefObject<BoardObject[]>
  frameDragSnapshotRef: MutableRefObject<FrameDragSnapshot>
  multiDragSnapshotRef: MutableRefObject<MultiDragSnapshot>
  setDraggingObjectId: Dispatch<SetStateAction<string | null>>
  setHoveredObjectId: Dispatch<SetStateAction<string | null>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setResizingObjectId: Dispatch<SetStateAction<string | null>>
  setRotatingObjectId: Dispatch<SetStateAction<string | null>>
  handleObjectSelection: ObjectSelectionHandler
  startInlineEdit: (boardObject: BoardObject, field: InlineEditorDraft['field']) => void
  beginObjectDrag: (boardObject: BoardObject, anchor: Point) => void
  moveObjectDrag: (boardObject: BoardObject, point: Point) => void
  endObjectDrag: (boardObject: BoardObject, point: Point, actionLabel: string) => Promise<void>
  resizeObjectLocal: (boardObject: BoardObject, size: { width: number; height: number }) => void
  commitResizeObject: (boardObject: BoardObject, size: { width: number; height: number }) => Promise<void>
  getObjectDragPublisher: (objectId: string) => (patch: Partial<BoardObject>) => void
  calculateRotationFromHandleTarget: (
    target: Konva.Node,
    objectWidth: number,
    objectHeight: number,
  ) => number | null
  setLocalRotation: (objectId: string, rotation: number) => void
  clearLocalRotation: (objectId: string) => void
  patchObject: ObjectPatchHandler
  renderVoteBadge: VoteBadgeRenderer
  renderCommentBadge: CommentBadgeRenderer
  getVoteBadgeWidth: (voteCount: number) => number
  minObjectWidth: number
  minObjectHeight: number
  resizeHandleSize: number
  rotationHandleOffset: number
  rotationHandleSize: number
}

export const renderFrameObject = (args: RenderFrameObjectArgs): ReactElement => {
  const {
    boardObject,
    position,
    size,
    selected,
    hovered,
    canEditBoard,
    selectionMode,
    resizingObjectId,
    rotatingObjectId,
    inlineEditor,
    selectedIdsCount,
    selectedIdSet,
    localObjectPositions,
    localObjectRotations,
    localObjectRotationsRef,
    liveDragPositionsRef,
    objectsRef,
    frameDragSnapshotRef,
    multiDragSnapshotRef,
    setDraggingObjectId,
    setHoveredObjectId,
    setLocalObjectPositions,
    setResizingObjectId,
    setRotatingObjectId,
    handleObjectSelection,
    startInlineEdit,
    beginObjectDrag,
    moveObjectDrag,
    endObjectDrag,
    resizeObjectLocal,
    commitResizeObject,
    getObjectDragPublisher,
    calculateRotationFromHandleTarget,
    setLocalRotation,
    clearLocalRotation,
    patchObject,
    renderVoteBadge,
    renderCommentBadge,
    getVoteBadgeWidth,
    minObjectWidth,
    minObjectHeight,
    resizeHandleSize,
    rotationHandleOffset,
    rotationHandleSize,
  } = args

  const frameStroke = selected ? '#1d4ed8' : hovered ? '#0f766e' : '#334155'
  const isInlineFrameTitleEditing = inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'title'
  const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
  const voteCount = Object.keys(boardObject.votesByUser || {}).length
  const commentCount = boardObject.comments?.length || 0

  return (
    <Group
      key={boardObject.id}
      x={position.x}
      y={position.y}
      rotation={rotation}
      draggable={canEditBoard && selectionMode === 'select' && resizingObjectId !== boardObject.id && rotatingObjectId !== boardObject.id}
      onClick={(event) => handleObjectSelection(boardObject, Boolean(event.evt.shiftKey))}
      onTap={() => handleObjectSelection(boardObject)}
      onDblClick={() => {
        if (!canEditBoard) {
          return
        }
        startInlineEdit(boardObject, 'title')
      }}
      onMouseEnter={() => {
        setHoveredObjectId(boardObject.id)
      }}
      onMouseLeave={() => {
        setHoveredObjectId((previous) => (previous === boardObject.id ? null : previous))
      }}
      onDragStart={(event) => {
        if (selectedIdSet.has(boardObject.id) && selectedIdsCount > 1) {
          delete frameDragSnapshotRef.current[boardObject.id]
          beginObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() })
          return
        }

        liveDragPositionsRef.current[boardObject.id] = { x: event.target.x(), y: event.target.y() }
        setDraggingObjectId(boardObject.id)
        const members = objectsRef.current
          .filter(
            (candidate) =>
              candidate.id !== boardObject.id &&
              candidate.type !== 'connector' &&
              candidate.type !== 'frame' &&
              candidate.frameId === boardObject.id,
          )
          .map((candidate) => ({
            id: candidate.id,
            start: localObjectPositions[candidate.id]?.point || candidate.position,
          }))
        frameDragSnapshotRef.current[boardObject.id] = {
          frameStart: { x: position.x, y: position.y },
          members,
        }
      }}
      onDragMove={(event) => {
        if (multiDragSnapshotRef.current[boardObject.id]) {
          moveObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() })
          return
        }

        const nextFramePos = { x: event.target.x(), y: event.target.y() }
        liveDragPositionsRef.current[boardObject.id] = nextFramePos
        getObjectDragPublisher(boardObject.id)({ position: nextFramePos })
        const snapshot = frameDragSnapshotRef.current[boardObject.id]
        if (snapshot) {
          const dx = nextFramePos.x - snapshot.frameStart.x
          const dy = nextFramePos.y - snapshot.frameStart.y
          snapshot.members.forEach((member) => {
            const memberPosition = {
              x: member.start.x + dx,
              y: member.start.y + dy,
            }
            liveDragPositionsRef.current[member.id] = memberPosition
            getObjectDragPublisher(member.id)({ position: memberPosition })
          })
        }
      }}
      onDragEnd={(event) => {
        if (multiDragSnapshotRef.current[boardObject.id]) {
          void endObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() }, 'moved selection')
          return
        }

        const finalFramePos = { x: event.target.x(), y: event.target.y() }
        const snapshot = frameDragSnapshotRef.current[boardObject.id]
        delete frameDragSnapshotRef.current[boardObject.id]
        delete liveDragPositionsRef.current[boardObject.id]
        const nextLocal: Record<string, LocalPositionOverride> = {
          [boardObject.id]: {
            point: finalFramePos,
            mode: 'pending',
            updatedAt: nowMs(),
          },
        }
        if (snapshot) {
          const dx = finalFramePos.x - snapshot.frameStart.x
          const dy = finalFramePos.y - snapshot.frameStart.y
          snapshot.members.forEach((member) => {
            const memberFinal = {
              x: member.start.x + dx,
              y: member.start.y + dy,
            }
            delete liveDragPositionsRef.current[member.id]
            nextLocal[member.id] = {
              point: memberFinal,
              mode: 'pending',
              updatedAt: nowMs(),
            }
            void patchObject(member.id, { position: memberFinal }, { logEvent: false, recordHistory: false })
          })
        }

        setLocalObjectPositions((previous) => ({
          ...previous,
          ...nextLocal,
        }))
        setDraggingObjectId(null)
        void patchObject(boardObject.id, { position: finalFramePos }, { actionLabel: 'moved frame' })
      }}
    >
      <Rect
        width={size.width}
        height={size.height}
        fill={boardObject.color}
        opacity={hovered ? 0.32 : 0.25}
        stroke={frameStroke}
        strokeWidth={selected ? 2 : hovered ? 1.4 : 1}
        dash={[8, 6]}
        cornerRadius={12}
      />
      <Rect
        width={size.width}
        height={32}
        fill={boardObject.color}
        opacity={0.9}
        cornerRadius={[12, 12, 0, 0]}
      />
      {!isInlineFrameTitleEditing ? (
        <Text
          text={boardObject.title || 'Frame'}
          x={10}
          y={8}
          width={size.width - 20}
          fontSize={14}
          fontStyle="bold"
          fill={getContrastingTextColor(boardObject.color)}
        />
      ) : null}
      {renderVoteBadge({
        voteCount,
        x: size.width - getVoteBadgeWidth(voteCount) - 8,
        y: 8,
      })}
      {renderCommentBadge({
        commentCount,
        x: voteCount > 0 ? size.width - getVoteBadgeWidth(voteCount) - 8 - 24 : size.width - 18 - 8,
        y: 8,
      })}
      {selected && canEditBoard ? (
        <Rect
          x={size.width - resizeHandleSize}
          y={size.height - resizeHandleSize}
          width={resizeHandleSize}
          height={resizeHandleSize}
          fill="#ffffff"
          stroke="#1d4ed8"
          strokeWidth={2}
          cornerRadius={3}
          draggable
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onDragStart={(event) => {
            setResizingObjectId(boardObject.id)
            event.cancelBubble = true
          }}
          onDragMove={(event) => {
            const nextSize = {
              width: Math.max(minObjectWidth, event.target.x() + resizeHandleSize),
              height: Math.max(minObjectHeight, event.target.y() + resizeHandleSize),
            }
            resizeObjectLocal(boardObject, nextSize)
            event.cancelBubble = true
          }}
          onDragEnd={(event) => {
            const nextSize = {
              width: Math.max(minObjectWidth, event.target.x() + resizeHandleSize),
              height: Math.max(minObjectHeight, event.target.y() + resizeHandleSize),
            }
            void commitResizeObject(boardObject, nextSize)
            event.cancelBubble = true
          }}
          data-testid={`resize-handle-${boardObject.id}`}
        />
      ) : null}
      {selected && canEditBoard ? (
        <>
          <Line
            x1={size.width / 2}
            y1={0}
            x2={size.width / 2}
            y2={-rotationHandleOffset}
            stroke="#1d4ed8"
            strokeWidth={1.5}
            listening={false}
          />
          <Circle
            x={size.width / 2}
            y={-rotationHandleOffset}
            radius={rotationHandleSize / 2}
            fill="#ffffff"
            stroke="#1d4ed8"
            strokeWidth={2}
            cursor="grab"
            draggable
            onMouseDown={(event) => {
              event.cancelBubble = true
            }}
            onDragStart={(event) => {
              setRotatingObjectId(boardObject.id)
              event.cancelBubble = true
            }}
            onDragMove={(event) => {
              const newRotation = calculateRotationFromHandleTarget(event.target, size.width, size.height)
              if (newRotation === null) {
                return
              }

              setLocalRotation(boardObject.id, newRotation)
              event.cancelBubble = true
            }}
            onDragEnd={(event) => {
              const finalRotation =
                calculateRotationFromHandleTarget(event.target, size.width, size.height) ??
                localObjectRotationsRef.current[boardObject.id] ??
                boardObject.rotation ??
                0
              void patchObject(
                boardObject.id,
                { rotation: finalRotation },
                { actionLabel: `rotated ${boardObject.type}` },
              )
              clearLocalRotation(boardObject.id)
              setRotatingObjectId(null)
              event.cancelBubble = true
            }}
            data-testid={`rotation-handle-${boardObject.id}`}
          />
        </>
      ) : null}
    </Group>
  )
}
