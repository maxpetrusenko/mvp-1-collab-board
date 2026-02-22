import type { ReactElement } from 'react'
import { Group, Rect, Text } from 'react-konva'

import { getDragLabel, type CommonRenderArgs, type TextBoardObject } from './boardObjectRendererShared'

interface RenderTextObjectArgs extends Omit<CommonRenderArgs<TextBoardObject>, 'minObjectWidth' | 'minObjectHeight'> {
  minTextWidth: number
  minTextHeight: number
}

export const renderTextObject = (args: RenderTextObjectArgs): ReactElement => {
  const {
    boardObject,
    position,
    size,
    selected,
    hovered,
    canEditBoard,
    selectionMode,
    resizingObjectId,
    inlineEditor,
    selectedIdsCount,
    handleObjectSelection,
    startInlineEdit,
    setHoveredObjectId,
    beginObjectDrag,
    moveObjectDrag,
    endObjectDrag,
    resizeObjectLocal,
    commitResizeObject,
    setResizingObjectId,
    resizeHandleSize,
    getVoteBadgeWidth,
    renderVoteBadge,
    renderCommentBadge,
    minTextWidth,
    minTextHeight,
    themeMode,
  } = args

  const isInlineTextObjectEditing = inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'text'
  const fontSize = Math.max(12, boardObject.fontSize || 24)
  const voteCount = Object.keys(boardObject.votesByUser || {}).length
  const commentCount = boardObject.comments?.length || 0
  const textWidth = Math.max(minTextWidth, size.width)
  const textHeight = Math.max(minTextHeight, size.height)

  const defaultStrokeColor = themeMode === 'dark' ? '#94a3b8' : '#cbd5e1'
  const strokeColor = selected ? '#1d4ed8' : hovered ? '#0f766e' : defaultStrokeColor
  const fillColor = themeMode === 'dark' ? '#1e293b' : '#ffffff'
  const textColor = themeMode === 'dark' ? '#f1f5f9' : '#0f172a'

  return (
    <Group
      key={boardObject.id}
      x={position.x}
      y={position.y}
      draggable={
        canEditBoard &&
        selectionMode === 'select' &&
        resizingObjectId !== boardObject.id
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
          getDragLabel(selectedIdsCount, 'text'),
        )
      }}
    >
      <Rect
        x={0}
        y={0}
        width={textWidth}
        height={textHeight}
        fill={fillColor}
        cornerRadius={4}
        stroke={strokeColor}
        strokeWidth={selected ? 2 : hovered ? 2 : 1}
        shadowBlur={hovered ? 10 : 6}
        shadowOpacity={hovered ? 0.3 : 0.2}
      />
      {!isInlineTextObjectEditing ? (
        <Text
          text={boardObject.text}
          x={8}
          y={8}
          width={Math.max(40, textWidth - 16)}
          height={Math.max(16, textHeight - 16)}
          fontSize={fontSize}
          fontFamily="Inter, system-ui, sans-serif"
          fill={textColor}
          align="left"
          verticalAlign="middle"
          ellipsis={true}
          wrap="word"
          listening={false}
        />
      ) : null}
      {voteCount > 0 || commentCount > 0 ? (
        <Group x={textWidth - 8} y={0}>
          {commentCount > 0 ? renderCommentBadge({ commentCount, x: 0, y: 0 }) : null}
          {voteCount > 0 ? (
            <Group x={commentCount > 0 ? -getVoteBadgeWidth(voteCount) - 4 : 0} y={0}>
              {renderVoteBadge({ voteCount, x: 0, y: 0 })}
            </Group>
          ) : null}
        </Group>
      ) : null}
      {selected && canEditBoard ? (
        <Rect
          x={textWidth - resizeHandleSize}
          y={textHeight - resizeHandleSize}
          width={resizeHandleSize}
          height={resizeHandleSize}
          fill="#1d4ed8"
          cornerRadius={2}
          cursor="nwse-resize"
          draggable
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onDragStart={(event) => {
            setResizingObjectId(boardObject.id)
            event.cancelBubble = true
          }}
          onDragMove={(event) => {
            const newSize = {
              width: Math.max(minTextWidth, event.target.x()),
              height: Math.max(minTextHeight, event.target.y()),
            }
            resizeObjectLocal(boardObject, newSize)
            event.cancelBubble = true
          }}
          onDragEnd={(event) => {
            const finalSize = {
              width: Math.max(minTextWidth, event.target.x()),
              height: Math.max(minTextHeight, event.target.y()),
            }
            void commitResizeObject(boardObject, finalSize)
            setResizingObjectId(null)
            event.cancelBubble = true
          }}
          data-testid={`resize-handle-${boardObject.id}`}
        />
      ) : null}
    </Group>
  )
}
