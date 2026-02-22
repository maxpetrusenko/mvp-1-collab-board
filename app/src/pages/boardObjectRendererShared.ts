import type { Dispatch, MutableRefObject, ReactElement, SetStateAction } from 'react'
import type Konva from 'konva'

import type { BoardObject, Point } from '../types/board'
import type { InlineEditorDraft } from './boardPageTypes'

export type StickyBoardObject = Extract<BoardObject, { type: 'stickyNote' }>
export type ShapeBoardObject = Extract<BoardObject, { type: 'shape' }>
export type ConnectorBoardObject = Extract<BoardObject, { type: 'connector' }>
export type FrameBoardObject = Extract<BoardObject, { type: 'frame' }>
export type TextBoardObject = Extract<BoardObject, { type: 'text' }>
export type SelectionMode = 'select' | 'area'

export type ObjectSelectionHandler = (
  boardObject: BoardObject,
  additive?: boolean,
  inlineEditField?: 'text' | 'title' | null,
) => void

export type ObjectPatchHandler = (
  objectId: string,
  patch: Partial<BoardObject>,
  options?: { actionLabel?: string },
) => Promise<void>

export type VoteBadgeRenderer = (args: { voteCount: number; x: number; y: number }) => ReactElement | null
export type CommentBadgeRenderer = (args: { commentCount: number; x: number; y: number }) => ReactElement | null

export interface CommonRenderArgs<T extends BoardObject> {
  boardObject: T
  position: Point
  size: { width: number; height: number }
  selected: boolean
  hovered: boolean
  canEditBoard: boolean
  selectionMode: SelectionMode
  resizingObjectId: string | null
  rotatingObjectId: string | null
  inlineEditor: InlineEditorDraft | null
  selectedIdsCount: number
  handleObjectSelection: ObjectSelectionHandler
  startInlineEdit: (boardObject: BoardObject, field: InlineEditorDraft['field']) => void
  setHoveredObjectId: Dispatch<SetStateAction<string | null>>
  beginObjectDrag: (boardObject: BoardObject, anchor: Point) => void
  moveObjectDrag: (boardObject: BoardObject, point: Point) => void
  endObjectDrag: (boardObject: BoardObject, point: Point, actionLabel: string) => Promise<void>
  localObjectRotations: Record<string, number>
  localObjectRotationsRef: MutableRefObject<Record<string, number>>
  setResizingObjectId: Dispatch<SetStateAction<string | null>>
  resizeObjectLocal: (boardObject: BoardObject, size: { width: number; height: number }) => void
  commitResizeObject: (boardObject: BoardObject, size: { width: number; height: number }) => Promise<void>
  setRotatingObjectId: Dispatch<SetStateAction<string | null>>
  calculateRotationFromHandleTarget: (
    target: Konva.Node,
    objectWidth: number,
    objectHeight: number,
  ) => number | null
  setLocalRotation: (objectId: string, rotation: number) => void
  patchObject: ObjectPatchHandler
  clearLocalRotation: (objectId: string) => void
  minObjectWidth: number
  minObjectHeight: number
  resizeHandleSize: number
  rotationHandleOffset: number
  rotationHandleSize: number
  getVoteBadgeWidth: (voteCount: number) => number
  renderVoteBadge: VoteBadgeRenderer
  renderCommentBadge: CommentBadgeRenderer
  themeMode: 'light' | 'dark'
}

export const getDragLabel = (
  selectedIdsCount: number,
  objectType: 'sticky' | 'shape' | 'text',
) => (selectedIdsCount > 1 ? 'moved selection' : `moved ${objectType}`)
