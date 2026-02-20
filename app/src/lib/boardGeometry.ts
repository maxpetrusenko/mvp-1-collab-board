import type { AnchorKind, BoardObject, ConnectorStyle, Point, ShapeKind } from '../types/board'

export type ConnectorPatch = {
  start: Point
  end: Point
  position: Point
  size: { width: number; height: number }
  fromObjectId: string | null
  toObjectId: string | null
  fromAnchor: AnchorKind | null
  toAnchor: AnchorKind | null
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const cloneBoardObject = (boardObject: BoardObject): BoardObject =>
  JSON.parse(JSON.stringify(boardObject)) as BoardObject

export const isFinitePoint = (candidate: unknown): candidate is Point =>
  Boolean(
    candidate &&
      typeof candidate === 'object' &&
      'x' in candidate &&
      'y' in candidate &&
      Number.isFinite((candidate as Point).x) &&
      Number.isFinite((candidate as Point).y),
  )

export const overlaps = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y

export const toConnectorBounds = (start: Point, end: Point) => ({
  position: {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  },
  size: {
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  },
})

export const toConnectorPatch = (args: {
  start: Point
  end: Point
  fromObjectId: string | null
  toObjectId: string | null
  fromAnchor: AnchorKind | null
  toAnchor: AnchorKind | null
}): ConnectorPatch => ({
  start: args.start,
  end: args.end,
  ...toConnectorBounds(args.start, args.end),
  fromObjectId: args.fromObjectId,
  toObjectId: args.toObjectId,
  fromAnchor: args.fromAnchor,
  toAnchor: args.toAnchor,
})

export const normalizeAnchorKind = (candidate: unknown): AnchorKind | null => {
  if (
    candidate === 'top' ||
    candidate === 'right' ||
    candidate === 'bottom' ||
    candidate === 'left' ||
    candidate === 'center'
  ) {
    return candidate
  }
  return null
}

export const getAnchorPointForObject = (boardObject: BoardObject, anchor: AnchorKind): Point | null => {
  if (boardObject.type === 'connector') {
    return null
  }

  const left = boardObject.position.x
  const top = boardObject.position.y
  const width = boardObject.size.width
  const height = boardObject.size.height
  const cx = left + width / 2
  const cy = top + height / 2

  if (anchor === 'top') {
    return { x: cx, y: top }
  }
  if (anchor === 'right') {
    return { x: left + width, y: cy }
  }
  if (anchor === 'bottom') {
    return { x: cx, y: top + height }
  }
  if (anchor === 'left') {
    return { x: left, y: cy }
  }
  return { x: cx, y: cy }
}

export const getObjectAnchors = (boardObject: BoardObject): Array<{
  objectId: string
  anchor: AnchorKind
  point: Point
}> => {
  if (boardObject.type === 'connector') {
    return []
  }

  const left = boardObject.position.x
  const top = boardObject.position.y
  const width = boardObject.size.width
  const height = boardObject.size.height
  const cx = left + width / 2
  const cy = top + height / 2

  return [
    { objectId: boardObject.id, anchor: 'top', point: { x: cx, y: top } },
    { objectId: boardObject.id, anchor: 'right', point: { x: left + width, y: cy } },
    { objectId: boardObject.id, anchor: 'bottom', point: { x: cx, y: top + height } },
    { objectId: boardObject.id, anchor: 'left', point: { x: left, y: cy } },
    { objectId: boardObject.id, anchor: 'center', point: { x: cx, y: cy } },
  ]
}

export const normalizeShapeKind = (candidate: unknown): ShapeKind => {
  if (candidate === 'circle' || candidate === 'diamond' || candidate === 'triangle') {
    return candidate
  }
  return 'rectangle'
}

export const normalizeConnectorStyle = (candidate: unknown): ConnectorStyle =>
  candidate === 'line' ? 'line' : 'arrow'

export const getObjectBounds = (boardObject: BoardObject, objectById?: Map<string, BoardObject>) => {
  if (boardObject.type === 'connector') {
    const fromObject =
      objectById && boardObject.fromObjectId ? objectById.get(boardObject.fromObjectId) : null
    const toObject =
      objectById && boardObject.toObjectId ? objectById.get(boardObject.toObjectId) : null
    const fromAnchor = normalizeAnchorKind(boardObject.fromAnchor)
    const toAnchor = normalizeAnchorKind(boardObject.toAnchor)
    const start =
      fromObject && fromAnchor ? getAnchorPointForObject(fromObject, fromAnchor) || boardObject.start : boardObject.start
    const end = toObject && toAnchor ? getAnchorPointForObject(toObject, toAnchor) || boardObject.end : boardObject.end

    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxX = Math.max(start.x, end.x)
    const maxY = Math.max(start.y, end.y)
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
  }

  return {
    x: boardObject.position.x,
    y: boardObject.position.y,
    width: boardObject.size.width,
    height: boardObject.size.height,
  }
}
