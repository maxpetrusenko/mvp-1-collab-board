import type Konva from 'konva'
import { Circle, Line } from 'react-konva'

type RotationHandleProps = {
  centerX: number
  handleOffset: number
  handleSize: number
  objectId: string
  objectWidth: number
  objectHeight: number
  fallbackRotation: number
  resolveRotationFromTarget: (
    target: Konva.Node,
    objectWidth: number,
    objectHeight: number,
  ) => number | null
  onRotateStart: (objectId: string) => void
  onRotatePreview: (objectId: string, rotation: number) => void
  onRotateCommit: (objectId: string, rotation: number) => void | Promise<void>
  onRotateEnd: (objectId: string) => void
  'data-testid'?: string
}

export const RotationHandle = ({
  centerX,
  handleOffset,
  handleSize,
  objectId,
  objectWidth,
  objectHeight,
  fallbackRotation,
  resolveRotationFromTarget,
  onRotateStart,
  onRotatePreview,
  onRotateCommit,
  onRotateEnd,
  'data-testid': dataTestId,
}: RotationHandleProps) => (
  <>
    <Line
      x1={centerX}
      y1={0}
      x2={centerX}
      y2={-handleOffset}
      stroke="#1d4ed8"
      strokeWidth={1.5}
      listening={false}
    />
    <Circle
      x={centerX}
      y={-handleOffset}
      radius={handleSize / 2}
      fill="#ffffff"
      stroke="#1d4ed8"
      strokeWidth={2}
      cursor="grab"
      draggable
      onMouseDown={(event) => {
        event.cancelBubble = true
      }}
      onDragStart={(event) => {
        onRotateStart(objectId)
        event.cancelBubble = true
      }}
      onDragMove={(event) => {
        const nextRotation = resolveRotationFromTarget(event.target, objectWidth, objectHeight)
        if (nextRotation === null) {
          return
        }
        onRotatePreview(objectId, nextRotation)
        event.cancelBubble = true
      }}
      onDragEnd={(event) => {
        const resolvedRotation =
          resolveRotationFromTarget(event.target, objectWidth, objectHeight) ?? fallbackRotation
        void onRotateCommit(objectId, resolvedRotation)
        onRotateEnd(objectId)
        event.cancelBubble = true
      }}
      data-testid={dataTestId}
    />
  </>
)
