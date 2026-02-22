import Konva from 'konva'
import { Line, Rect, Text } from 'react-konva'

import {
  getAnchorPointForObject,
  normalizeAnchorKind,
} from '../lib/boardGeometry'
import type {
  BoardObject,
  ConnectorStyle,
  ShapeKind,
} from '../types/board'
import type { BoardLinkAccess, BoardMeta } from './boardPageTypes'

export const BOARD_HEADER_HEIGHT = 64
export const CONNECTOR_SNAP_THRESHOLD_PX = 36
export const CONNECTOR_HANDLE_RADIUS = 7
export const TIMER_DEFAULT_MS = 5 * 60 * 1000
export const PRESENCE_AWAY_THRESHOLD_MS = 25_000
export const DRAG_PUBLISH_INTERVAL_MS = 100
export const MIN_ZOOM_SCALE = 0.25
export const MAX_ZOOM_SCALE = 3
export const AI_COMMAND_POINTER_MAX_AGE_MS = 5_000
export const ZOOM_MOMENTUM_SMOOTHING = 0.24
export const ZOOM_MOMENTUM_EPSILON_SCALE = 0.0015
export const ZOOM_MOMENTUM_EPSILON_POSITION = 0.8
export const MAX_EXPORT_PIXEL_COUNT = 16_000_000
export const MAX_PDF_EDGE_PX = 4_096
export const MIN_OBJECT_WIDTH = 56
export const MIN_OBJECT_HEIGHT = 40
export const RESIZE_HANDLE_SIZE = 14
export const ROTATION_HANDLE_SIZE = 14
export const ROTATION_HANDLE_OFFSET = 30
export const STICKY_DROP_DURATION_SECONDS = 0.55
export const VOTE_CONFETTI_PARTICLE_COUNT = 12
export const VOTE_CONFETTI_GRAVITY = 0.16
export const VOTE_CONFETTI_DECAY = 0.035
export const VOTE_CONFETTI_COLORS = ['#f59e0b', '#14b8a6', '#fb7185', '#60a5fa', '#f97316', '#22c55e']
const normalizeAiApiBaseUrl = (value: unknown) => String(value || '').trim().replace(/\/$/, '')
const sharedAiApiBaseUrl = normalizeAiApiBaseUrl(import.meta.env.VITE_AI_API_BASE_URL)
const devAiApiBaseUrl = normalizeAiApiBaseUrl(import.meta.env.VITE_AI_API_BASE_URL_DEV)
const prodAiApiBaseUrl = normalizeAiApiBaseUrl(import.meta.env.VITE_AI_API_BASE_URL_PROD)
export const aiApiBaseUrl = import.meta.env.DEV
  ? devAiApiBaseUrl || sharedAiApiBaseUrl
  : prodAiApiBaseUrl || sharedAiApiBaseUrl
export const aiCommandEndpoint = `${aiApiBaseUrl}/api/ai/command`
export const shareBoardEndpoint = `${aiApiBaseUrl}/api/boards/share`
export const STICKY_COLOR_OPTIONS = ['#fde68a', '#fdba74', '#fca5a5', '#86efac', '#93c5fd']
export const SHAPE_COLOR_OPTIONS = ['#93c5fd', '#67e8f9', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd']
export const FRAME_COLOR_OPTIONS = ['#e2e8f0', '#dbeafe', '#dcfce7', '#fee2e2', '#fef3c7']
export const CONNECTOR_COLOR_OPTIONS = ['#1d4ed8', '#0f172a', '#dc2626', '#0f766e', '#6d28d9']
export const TEXT_COLOR_OPTIONS = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']
export const CONNECTOR_STYLE_OPTIONS: Array<{ value: ConnectorStyle; label: string }> = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'line', label: 'Line' },
]
export const ROTATION_STEP_DEGREES = 15
export const BOARD_DUPLICATE_BATCH_LIMIT = 400
export const NEW_OBJECT_OFFSET_STEP = 20
export const OBJECT_DUPLICATE_OFFSET = 20
export const THEME_STORAGE_KEY = 'collabboard-theme'
export const LAST_BOARD_STORAGE_PREFIX = 'collabboard-last-board-id'
export const COLOR_LABELS: Record<string, string> = {
  '#fde68a': 'yellow',
  '#fdba74': 'orange',
  '#fca5a5': 'red',
  '#86efac': 'green',
  '#93c5fd': 'blue',
  '#c4b5fd': 'purple',
  '#67e8f9': 'cyan',
  '#fcd34d': 'amber',
  '#e2e8f0': 'slate',
  '#dbeafe': 'sky',
  '#dcfce7': 'mint',
  '#fee2e2': 'rose',
  '#fef3c7': 'cream',
  '#0f172a': 'charcoal',
  '#1d4ed8': 'royal blue',
  '#dc2626': 'crimson',
  '#0f766e': 'teal',
  '#6d28d9': 'violet',
}
export const DEFAULT_SHAPE_SIZES: Record<ShapeKind, { width: number; height: number }> = {
  rectangle: { width: 180, height: 110 },
  circle: { width: 130, height: 130 },
  diamond: { width: 170, height: 120 },
  triangle: { width: 170, height: 120 },
}
export const DEFAULT_FRAME_SIZE = { width: 520, height: 320 }
export const DEFAULT_TEXT_SIZE = { width: 220, height: 52 }
export const SHAPE_TYPE_OPTIONS: Array<{ kind: ShapeKind; label: string }> = [
  { kind: 'rectangle', label: 'Rect' },
  { kind: 'circle', label: 'Circle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'triangle', label: 'Triangle' },
]

export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export const normalizeRotationDegrees = (value: number) => {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export const calculateRotationAngle = (
  centerX: number,
  centerY: number,
  mouseX: number,
  mouseY: number,
) => {
  const radians = Math.atan2(mouseY - centerY, mouseX - centerX)
  const degrees = radians * (180 / Math.PI)
  return normalizeRotationDegrees(degrees + 90)
}

export const calculateRotationFromHandleTarget = (
  target: Konva.Node,
  objectWidth: number,
  objectHeight: number,
) => {
  const stage = target.getStage()
  if (!stage) {
    return null
  }

  const group = target.getParent()
  if (!group) {
    return null
  }

  const pointer = stage.getPointerPosition()
  if (!pointer) {
    return null
  }

  const center = group.getAbsoluteTransform().point({
    x: objectWidth / 2,
    y: objectHeight / 2,
  })

  return calculateRotationAngle(center.x, center.y, pointer.x, pointer.y)
}

export const getVoteBadgeWidth = (voteCount: number) => (voteCount > 9 ? 34 : 30)

export const renderVoteBadge = (args: {
  voteCount: number
  x: number
  y: number
}) => {
  const { voteCount, x, y } = args
  if (voteCount <= 0) {
    return null
  }

  const badgeWidth = getVoteBadgeWidth(voteCount)
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={badgeWidth}
        height={18}
        fill="#1d4ed8"
        cornerRadius={9}
        shadowBlur={4}
        shadowOpacity={0.18}
        listening={false}
      />
      <Line
        points={[x + 7, y + 10, x + 10, y + 13, x + 15, y + 7]}
        stroke="#ffffff"
        strokeWidth={1.6}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Text
        text={String(voteCount)}
        x={x + 16}
        y={y + 4}
        width={badgeWidth - 16}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fill="#ffffff"
        listening={false}
      />
    </>
  )
}

export const renderCommentBadge = (args: {
  commentCount: number
  x: number
  y: number
}) => {
  const { commentCount, x, y } = args
  if (commentCount <= 0) {
    return null
  }

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={18}
        height={18}
        fill="#0f766e"
        cornerRadius={9}
        shadowBlur={4}
        shadowOpacity={0.18}
        listening={false}
      />
      <Rect
        x={x + 4}
        y={y + 5}
        width={10}
        height={7}
        cornerRadius={2}
        stroke="#ffffff"
        strokeWidth={1.2}
        listening={false}
      />
      <Line
        points={[x + 8, y + 12, x + 7, y + 15, x + 10, y + 12]}
        stroke="#ffffff"
        strokeWidth={1.2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    </>
  )
}

export const getObjectBounds = (
  boardObject: BoardObject,
  objectById?: Map<string, BoardObject>,
) => {
  if (boardObject.type === 'connector') {
    const fromObject =
      objectById && boardObject.fromObjectId ? objectById.get(boardObject.fromObjectId) : null
    const toObject =
      objectById && boardObject.toObjectId ? objectById.get(boardObject.toObjectId) : null
    const fromAnchor = normalizeAnchorKind(boardObject.fromAnchor)
    const toAnchor = normalizeAnchorKind(boardObject.toAnchor)
    const start =
      fromObject && fromAnchor
        ? getAnchorPointForObject(fromObject, fromAnchor) || boardObject.start
        : boardObject.start
    const end =
      toObject && toAnchor
        ? getAnchorPointForObject(toObject, toAnchor) || boardObject.end
        : boardObject.end

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

export const formatTimerLabel = (ms: number) => {
  const clamped = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const parseTimerLabelToMs = (inputValue: string): number | null => {
  const trimmed = inputValue.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const minutes = Number(match[1])
  const seconds = Number(match[2])
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) {
    return null
  }
  if (minutes < 0 || minutes > 99 || seconds < 0 || seconds > 59) {
    return null
  }

  return (minutes * 60 + seconds) * 1000
}

export const notifyExportComplete = (detail: {
  format: 'png' | 'pdf'
  scope: 'full' | 'selection'
  fileBase: string
}) => {
  window.dispatchEvent(new CustomEvent('board-export-complete', { detail }))
}

export const getColorLabel = (color: string) => COLOR_LABELS[color.toLowerCase()] || color

export const normalizeSharedWith = (candidate: unknown): string[] => {
  if (!Array.isArray(candidate)) {
    return []
  }
  return candidate
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

export const normalizeSharedRoles = (
  candidate: unknown,
  sharedWith: string[],
): Record<string, 'edit' | 'view'> => {
  const normalized: Record<string, 'edit' | 'view'> = {}
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    Object.entries(candidate as Record<string, unknown>).forEach(
      ([userId, roleValue]) => {
        if (!sharedWith.includes(userId)) {
          return
        }
        normalized[userId] = roleValue === 'view' ? 'view' : 'edit'
      },
    )
  }
  sharedWith.forEach((userId) => {
    if (!normalized[userId]) {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}

export const normalizeLinkAccessRole = (candidate: unknown): BoardLinkAccess => {
  if (candidate === 'edit' || candidate === 'view') {
    return candidate
  }
  return 'restricted'
}

export const toBoardMeta = (
  id: string,
  data: Partial<BoardMeta> & {
    id?: string
    ownerId?: unknown
    linkAccessRole?: unknown
    sharedWith?: unknown
    sharedRoles?: unknown
    deleted?: boolean
  },
): BoardMeta | null => {
  if (data.deleted) {
    return null
  }

  const ownerIdCandidate =
    typeof data.ownerId === 'string' && data.ownerId.trim() ? data.ownerId.trim() : ''
  const createdByCandidate =
    typeof data.createdBy === 'string' && data.createdBy.trim()
      ? data.createdBy.trim()
      : ''
  const ownerId = ownerIdCandidate || createdByCandidate
  if (!ownerId) {
    return null
  }

  const createdBy = createdByCandidate || ownerId
  const linkAccessRole = normalizeLinkAccessRole(data.linkAccessRole)
  const sharedWith = normalizeSharedWith(data.sharedWith).filter(
    (entry) => entry !== ownerId,
  )
  const sharedRoles = normalizeSharedRoles(data.sharedRoles, sharedWith)

  return {
    id: (
      typeof data.id === 'string' && data.id.trim() ? data.id : id
    ).trim(),
    name: (
      typeof data.name === 'string' && data.name.trim()
        ? data.name
        : `Board ${id.slice(0, 8)}`
    ).trim(),
    description: typeof data.description === 'string' ? data.description : '',
    ownerId,
    linkAccessRole,
    sharedWith,
    sharedRoles,
    createdBy,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
  }
}

export const canAccessBoardMeta = (boardMeta: BoardMeta, userId: string) =>
  boardMeta.ownerId === userId ||
  boardMeta.sharedWith.includes(userId) ||
  boardMeta.linkAccessRole === 'view' ||
  boardMeta.linkAccessRole === 'edit'

export const canEditBoardMeta = (boardMeta: BoardMeta, userId: string) => {
  if (boardMeta.ownerId === userId) {
    return true
  }
  if (boardMeta.sharedWith.includes(userId)) {
    return (boardMeta.sharedRoles[userId] || 'edit') !== 'view'
  }
  return boardMeta.linkAccessRole === 'edit'
}
