export type BoardObjectKind = 'stickyNote' | 'shape' | 'frame' | 'connector'
export type ShapeKind = 'rectangle' | 'circle' | 'diamond' | 'triangle'
export type AnchorKind = 'top' | 'right' | 'bottom' | 'left' | 'center'

export type Point = {
  x: number
  y: number
}

export type Size = {
  width: number
  height: number
}

export type BoardComment = {
  id: string
  text: string
  createdBy: string
  createdByName: string
  createdAt: number
}

type BoardObjectBase = {
  id: string
  boardId: string
  type: BoardObjectKind
  position: Point
  size: Size
  zIndex: number
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
  version: number
  comments?: BoardComment[]
  votesByUser?: Record<string, true>
  deleted?: boolean
}

export type StickyNoteObject = BoardObjectBase & {
  type: 'stickyNote'
  text: string
  color: string
}

export type ShapeObject = BoardObjectBase & {
  type: 'shape'
  shapeType: ShapeKind
  color: string
  text?: string
}

export type FrameObject = BoardObjectBase & {
  type: 'frame'
  title: string
  color: string
}

export type ConnectorObject = BoardObjectBase & {
  type: 'connector'
  start: Point
  end: Point
  color: string
  fromObjectId?: string | null
  toObjectId?: string | null
  fromAnchor?: AnchorKind | null
  toAnchor?: AnchorKind | null
}

export type BoardObject = StickyNoteObject | ShapeObject | FrameObject | ConnectorObject

export type BoardActivityEvent = {
  id: string
  boardId: string
  actorId: string
  actorName: string
  action: string
  targetId?: string | null
  targetType?: BoardObjectKind | null
  createdAt: number
}

export type CursorPresence = {
  boardId: string
  userId: string
  displayName: string
  color: string
  x: number
  y: number
  lastSeen: number
  connectionId: string
}
