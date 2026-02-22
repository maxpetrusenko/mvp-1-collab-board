import type {
  BoardObject,
  ConnectorStyle,
  ShapeKind,
} from '../types/board'

export type Viewport = {
  x: number
  y: number
  scale: number
}

export type TimerState = {
  running: boolean
  endsAt: number | null
  remainingMs: number
}

export type BoardLinkAccess = 'restricted' | 'view' | 'edit'

export type VoteConfettiParticle = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  spin: number
  life: number
}

export type InlineEditorDraft = {
  objectId: string
  field: 'text' | 'title'
  value: string
}

export type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  linkAccessRole: BoardLinkAccess
  sharedWith: string[]
  sharedRoles: Record<string, 'edit' | 'view'>
  createdBy: string
  updatedBy?: string
  createdAt?: number
  updatedAt?: number
}

export type AiCommandHistoryEntry = {
  id: string
  command: string
  status: 'queued' | 'running' | 'success' | 'warning' | 'error'
  queuedAt?: number
  completedAt?: number
  error?: string
}

export type BoardAccessRequest = {
  userId: string
  role: 'edit' | 'view'
  email: string
  requestedAt?: number
}

export type CreatePopoverKey = 'shape' | 'connector' | 'text'
export type TemplateKey = 'retro' | 'mindmap' | 'kanban'

export type CommandPaletteCommand = {
  id: string
  label: string
  description: string
  keywords: string[]
  shortcut?: string
  run: () => void | Promise<void>
}

export type HistoryEntry =
  | { type: 'create'; object: BoardObject }
  | { type: 'delete'; object: BoardObject }
  | {
      type: 'patch'
      objectId: string
      before: Partial<BoardObject>
      after: Partial<BoardObject>
    }

export type ShapeDraft = {
  shapeType: ShapeKind
  color: string
  text: string
}

export type ConnectorDraft = {
  style: ConnectorStyle
  color: string
}

export type TextDraft = {
  text: string
  color: string
  fontSize: number
}
