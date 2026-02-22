import type { ReactElement } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'

import { normalizeShapeKind } from '../lib/boardGeometry'
import { getContrastingTextColor } from '../lib/contrast'
import { getDragLabel, type CommonRenderArgs, type ShapeBoardObject } from './boardObjectRendererShared'

export const renderShapeObject = (args: CommonRenderArgs<ShapeBoardObject>): ReactElement => {
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
    handleObjectSelection,
    startInlineEdit,
    setHoveredObjectId,
    beginObjectDrag,
    moveObjectDrag,
    endObjectDrag,
    localObjectRotations,
    localObjectRotationsRef,
    setResizingObjectId,
    resizeObjectLocal,
    commitResizeObject,
    setRotatingObjectId,
    calculateRotationFromHandleTarget,
    setLocalRotation,
    patchObject,
    clearLocalRotation,
    minObjectWidth,
    minObjectHeight,
    resizeHandleSize,
    rotationHandleOffset,
    rotationHandleSize,
    getVoteBadgeWidth,
    renderVoteBadge,
    renderCommentBadge,
    themeMode,
  } = args

  const shapeType = normalizeShapeKind(boardObject.shapeType)
  const isInlineShapeTextEditing = inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'text'
  const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
  const defaultStrokeColor = themeMode === 'dark' ? '#e2e8f0' : '#0f172a'
  const strokeColor = selected ? '#1d4ed8' : hovered ? '#0f766e' : defaultStrokeColor
  const strokeWidth = selected ? 2 : hovered ? 2 : 1
  const voteCount = Object.keys(boardObject.votesByUser || {}).length
  const commentCount = boardObject.comments?.length || 0

  return (
    <Group
      key={boardObject.id}
      id={`shape-${boardObject.id}`}
      x={position.x}
      y={position.y}
      rotation={rotation}
      draggable={
        canEditBoard &&
        selectionMode === 'select' &&
        resizingObjectId !== boardObject.id &&
        rotatingObjectId !== boardObject.id
      }
      onClick={(event) => handleObjectSelection(boardObject, Boolean(event.evt.shiftKey))}
      onTap={() => handleObjectSelection(boardObject)}
      onDblClick={() => {
        if (!canEditBoard) {
          return
        }
        startInlineEdit(boardObject, 'text')
      }}
      onMouseEnter={() => {
        setHoveredObjectId(boardObject.id)
      }}
      onMouseLeave={() => {
        setHoveredObjectId((previous) => (previous === boardObject.id ? null : previous))
      }}
      onDragStart={(event) => {
        beginObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() })
      }}
      onDragMove={(event) => {
        moveObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() })
      }}
      onDragEnd={(event) => {
        void endObjectDrag(
          boardObject,
          { x: event.target.x(), y: event.target.y() },
          getDragLabel(selectedIdsCount, 'shape'),
        )
      }}
    >
      {shapeType === 'circle' ? (
        <Circle
          x={size.width / 2}
          y={size.height / 2}
          radius={Math.min(size.width, size.height) / 2}
          fill={boardObject.color}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          shadowBlur={hovered ? 10 : 6}
          shadowOpacity={hovered ? 0.3 : 0.2}
        />
      ) : null}
      {shapeType === 'diamond' ? (
        <Line
          points={[size.width / 2, 0, size.width, size.height / 2, size.width / 2, size.height, 0, size.height / 2]}
          closed
          fill={boardObject.color}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineJoin="round"
          shadowBlur={hovered ? 10 : 6}
          shadowOpacity={hovered ? 0.3 : 0.2}
        />
      ) : null}
      {shapeType === 'triangle' ? (
        <Line
          points={[size.width / 2, 0, size.width, size.height, 0, size.height]}
          closed
          fill={boardObject.color}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineJoin="round"
          shadowBlur={hovered ? 10 : 6}
          shadowOpacity={hovered ? 0.3 : 0.2}
        />
      ) : null}
      {shapeType === 'rectangle' ? (
        <Rect
          width={size.width}
          height={size.height}
          fill={boardObject.color}
          cornerRadius={8}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          shadowBlur={hovered ? 10 : 6}
          shadowOpacity={hovered ? 0.3 : 0.2}
        />
      ) : null}
      {!isInlineShapeTextEditing && boardObject.text ? (
        <Text
          text={boardObject.text}
          x={shapeType === 'rectangle' ? 8 : 12}
          y={shapeType === 'rectangle' ? 8 : 10}
          width={Math.max(40, size.width - (shapeType === 'rectangle' ? 16 : 24))}
          height={Math.max(24, size.height - (shapeType === 'rectangle' ? 16 : 20))}
          fontSize={shapeType === 'rectangle' ? 16 : 14}
          fill={getContrastingTextColor(boardObject.color)}
          wrap="word"
          align={shapeType === 'rectangle' ? 'left' : 'center'}
          verticalAlign={shapeType === 'rectangle' ? 'top' : 'middle'}
        />
      ) : null}
      {renderVoteBadge({
        voteCount,
        x: size.width - getVoteBadgeWidth(voteCount) - 8,
        y: 8,
      })}
      {renderCommentBadge({ commentCount, x: 8, y: 8 })}
      {!selected && hovered ? (
        <Rect
          width={size.width}
          height={size.height}
          stroke="#0f766e"
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={shapeType === 'rectangle' ? 8 : 0}
          listening={false}
        />
      ) : null}
      {selected ? (
        <Rect
          width={size.width}
          height={size.height}
          stroke="#1d4ed8"
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={shapeType === 'rectangle' ? 8 : 0}
          listening={false}
        />
      ) : null}
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
