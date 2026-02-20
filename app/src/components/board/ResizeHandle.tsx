import { Rect } from 'react-konva'

type Size = {
  width: number
  height: number
}

type ResizeHandleProps = {
  x: number
  y: number
  handleSize: number
  minWidth: number
  minHeight: number
  onResizeStart: () => void
  onResizePreview: (size: Size) => void
  onResizeCommit: (size: Size) => void | Promise<void>
  'data-testid'?: string
}

const getNextSize = (
  target: { x: () => number; y: () => number },
  handleSize: number,
  minWidth: number,
  minHeight: number,
): Size => ({
  width: Math.max(minWidth, target.x() + handleSize),
  height: Math.max(minHeight, target.y() + handleSize),
})

export const ResizeHandle = ({
  x,
  y,
  handleSize,
  minWidth,
  minHeight,
  onResizeStart,
  onResizePreview,
  onResizeCommit,
  'data-testid': dataTestId,
}: ResizeHandleProps) => (
  <Rect
    x={x}
    y={y}
    width={handleSize}
    height={handleSize}
    fill="#ffffff"
    stroke="#1d4ed8"
    strokeWidth={2}
    cornerRadius={3}
    draggable
    onMouseDown={(event) => {
      event.cancelBubble = true
    }}
    onDragStart={(event) => {
      onResizeStart()
      event.cancelBubble = true
    }}
    onDragMove={(event) => {
      onResizePreview(getNextSize(event.target, handleSize, minWidth, minHeight))
      event.cancelBubble = true
    }}
    onDragEnd={(event) => {
      void onResizeCommit(getNextSize(event.target, handleSize, minWidth, minHeight))
      event.cancelBubble = true
    }}
    data-testid={dataTestId}
  />
)
