import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import Konva from 'konva'
import {
  Circle as CircleShapeIcon,
  Copy,
  Diamond,
  Download,
  Eye,
  FileText,
  Keyboard,
  LayoutGrid,
  LogOut,
  Moon,
  MousePointer2,
  Pause,
  Play,
  Sun,
  Redo2,
  RotateCcw,
  Share2,
  Square,
  SquareDashed,
  SquareDashedMousePointer,
  StickyNote,
  Pencil,
  Timer,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Vote,
  Waypoints,
  X,
} from 'lucide-react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { onValue, ref, set } from 'firebase/database'

import { defaultBoardId, syncBackend } from '../config/env'
import { auth, db, rtdb } from '../firebase/client'
import { useAuth } from '../state/AuthContext'
import { YjsPilotMirror } from '../collab/yjs'
import type {
  AnchorKind,
  BoardActivityEvent,
  BoardComment,
  BoardObject,
  ConnectorStyle,
  CursorPresence,
  Point,
  ShapeKind,
} from '../types/board'
import { AICommandPanel } from '../components/AICommandPanel'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { usePresence } from '../hooks/usePresence'
import {
  useObjectSync,
  type LocalConnectorOverride,
  type LocalPositionOverride,
  type LocalSizeOverride,
} from '../hooks/useObjectSync'
import { getContrastingTextColor } from '../lib/contrast'

type Viewport = {
  x: number
  y: number
  scale: number
}

type ConnectorPatch = {
  start: Point
  end: Point
  position: Point
  size: { width: number; height: number }
  fromObjectId: string | null
  toObjectId: string | null
  fromAnchor: AnchorKind | null
  toAnchor: AnchorKind | null
}

type TimerState = {
  running: boolean
  endsAt: number | null
  remainingMs: number
}

type VoteConfettiParticle = {
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

type InlineEditorDraft = {
  objectId: string
  field: 'text' | 'title'
  value: string
}

type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  sharedWith: string[]
  sharedRoles: Record<string, 'edit' | 'view'>
  createdBy: string
  updatedBy?: string
  createdAt?: number
  updatedAt?: number
}

type AiCommandHistoryEntry = {
  id: string
  command: string
  status: 'queued' | 'running' | 'success' | 'error'
  queuedAt?: number
  completedAt?: number
  error?: string
}

type CreatePopoverKey = 'shape' | 'connector' | 'text'
type TemplateKey = 'retro' | 'mindmap' | 'kanban'

type CommandPaletteCommand = {
  id: string
  label: string
  description: string
  keywords: string[]
  shortcut?: string
  run: () => void | Promise<void>
}

type HistoryEntry =
  | { type: 'create'; object: BoardObject }
  | { type: 'delete'; object: BoardObject }
  | {
      type: 'patch'
      objectId: string
      before: Partial<BoardObject>
      after: Partial<BoardObject>
    }

const BOARD_HEADER_HEIGHT = 64
const CONNECTOR_SNAP_THRESHOLD_PX = 36
const CONNECTOR_HANDLE_RADIUS = 7
const TIMER_DEFAULT_MS = 5 * 60 * 1000
const PRESENCE_AWAY_THRESHOLD_MS = 25_000
const MIN_ZOOM_SCALE = 0.25
const MAX_ZOOM_SCALE = 3
const ZOOM_MOMENTUM_SMOOTHING = 0.24
const ZOOM_MOMENTUM_EPSILON_SCALE = 0.0015
const ZOOM_MOMENTUM_EPSILON_POSITION = 0.8
const MAX_EXPORT_PIXEL_COUNT = 16_000_000
const MAX_PDF_EDGE_PX = 4_096
const MIN_OBJECT_WIDTH = 56
const MIN_OBJECT_HEIGHT = 40
const RESIZE_HANDLE_SIZE = 14
const ROTATION_HANDLE_SIZE = 14
const ROTATION_HANDLE_OFFSET = 30
const STICKY_DROP_DURATION_SECONDS = 0.55
const VOTE_CONFETTI_PARTICLE_COUNT = 12
const VOTE_CONFETTI_GRAVITY = 0.16
const VOTE_CONFETTI_DECAY = 0.035
const VOTE_CONFETTI_COLORS = ['#f59e0b', '#14b8a6', '#fb7185', '#60a5fa', '#f97316', '#22c55e']
const aiApiBaseUrl = (import.meta.env.VITE_AI_API_BASE_URL || '').replace(/\/$/, '')
const aiCommandEndpoint = `${aiApiBaseUrl}/api/ai/command`
const shareBoardEndpoint = `${aiApiBaseUrl}/api/boards/share`
const STICKY_COLOR_OPTIONS = ['#fde68a', '#fdba74', '#fca5a5', '#86efac', '#93c5fd']
const SHAPE_COLOR_OPTIONS = ['#93c5fd', '#67e8f9', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd']
const FRAME_COLOR_OPTIONS = ['#e2e8f0', '#dbeafe', '#dcfce7', '#fee2e2', '#fef3c7']
const CONNECTOR_COLOR_OPTIONS = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']
const TEXT_COLOR_OPTIONS = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']
const CONNECTOR_STYLE_OPTIONS: Array<{ value: ConnectorStyle; label: string }> = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'line', label: 'Line' },
]
const ROTATION_STEP_DEGREES = 15
const BOARD_DUPLICATE_BATCH_LIMIT = 400
const THEME_STORAGE_KEY = 'collabboard-theme'
const LAST_BOARD_STORAGE_PREFIX = 'collabboard-last-board-id'
const COLOR_LABELS: Record<string, string> = {
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
const DEFAULT_SHAPE_SIZES: Record<ShapeKind, { width: number; height: number }> = {
  rectangle: { width: 180, height: 110 },
  circle: { width: 130, height: 130 },
  diamond: { width: 170, height: 120 },
  triangle: { width: 170, height: 120 },
}
const DEFAULT_FRAME_SIZE = { width: 520, height: 320 }
const DEFAULT_TEXT_SIZE = { width: 220, height: 52 }
const SHAPE_TYPE_OPTIONS: Array<{ kind: ShapeKind; label: string }> = [
  { kind: 'rectangle', label: 'Rect' },
  { kind: 'circle', label: 'Circle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'triangle', label: 'Triangle' },
]

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const isFinitePoint = (candidate: unknown): candidate is Point =>
  Boolean(
    candidate &&
      typeof candidate === 'object' &&
      'x' in candidate &&
      'y' in candidate &&
      Number.isFinite((candidate as Point).x) &&
      Number.isFinite((candidate as Point).y),
  )
const normalizeRotationDegrees = (value: number) => {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}
const calculateRotationAngle = (centerX: number, centerY: number, mouseX: number, mouseY: number) => {
  const radians = Math.atan2(mouseY - centerY, mouseX - centerX)
  const degrees = radians * (180 / Math.PI)
  return normalizeRotationDegrees(degrees + 90) // +90 because handle is at top (-90 degrees)
}
const calculateRotationFromHandleTarget = (
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
const overlaps = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y
const toConnectorBounds = (start: Point, end: Point) => ({
  position: {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  },
  size: {
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  },
})
const toConnectorPatch = (args: {
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
const normalizeAnchorKind = (candidate: unknown): AnchorKind | null => {
  if (candidate === 'top' || candidate === 'right' || candidate === 'bottom' || candidate === 'left' || candidate === 'center') {
    return candidate
  }
  return null
}
const getAnchorPointForObject = (boardObject: BoardObject, anchor: AnchorKind): Point | null => {
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
const getObjectAnchors = (boardObject: BoardObject): Array<{
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

const normalizeShapeKind = (candidate: unknown): ShapeKind => {
  if (candidate === 'circle' || candidate === 'diamond' || candidate === 'triangle') {
    return candidate
  }
  return 'rectangle'
}
const normalizeConnectorStyle = (candidate: unknown): ConnectorStyle =>
  candidate === 'line' ? 'line' : 'arrow'

const getObjectBounds = (boardObject: BoardObject, objectById?: Map<string, BoardObject>) => {
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
const formatTimerLabel = (ms: number) => {
  const clamped = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
const nowMs = () => Date.now()
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const notifyExportComplete = (detail: { format: 'png' | 'pdf'; scope: 'full' | 'selection'; fileBase: string }) => {
  window.dispatchEvent(new CustomEvent('board-export-complete', { detail }))
}
const getColorLabel = (color: string) => COLOR_LABELS[color.toLowerCase()] || color
const normalizeSharedWith = (candidate: unknown): string[] => {
  if (!Array.isArray(candidate)) {
    return []
  }
  return candidate
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}
const normalizeSharedRoles = (
  candidate: unknown,
  sharedWith: string[],
): Record<string, 'edit' | 'view'> => {
  const normalized: Record<string, 'edit' | 'view'> = {}
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    Object.entries(candidate as Record<string, unknown>).forEach(([userId, roleValue]) => {
      if (!sharedWith.includes(userId)) {
        return
      }
      normalized[userId] = roleValue === 'view' ? 'view' : 'edit'
    })
  }
  sharedWith.forEach((userId) => {
    if (!normalized[userId]) {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}
const toBoardMeta = (
  id: string,
  data: Partial<BoardMeta> & {
    id?: string
    ownerId?: unknown
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
    typeof data.createdBy === 'string' && data.createdBy.trim() ? data.createdBy.trim() : ''
  const ownerId = ownerIdCandidate || createdByCandidate
  if (!ownerId) {
    return null
  }

  const createdBy = createdByCandidate || ownerId
  const sharedWith = normalizeSharedWith(data.sharedWith).filter((entry) => entry !== ownerId)
  const sharedRoles = normalizeSharedRoles(data.sharedRoles, sharedWith)

  return {
    id: (typeof data.id === 'string' && data.id.trim() ? data.id : id).trim(),
    name: (typeof data.name === 'string' && data.name.trim() ? data.name : `Board ${id.slice(0, 8)}`).trim(),
    description: typeof data.description === 'string' ? data.description : '',
    ownerId,
    sharedWith,
    sharedRoles,
    createdBy,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
  }
}
const canAccessBoardMeta = (boardMeta: BoardMeta, userId: string) =>
  boardMeta.ownerId === userId || boardMeta.sharedWith.includes(userId)

export const BoardPage = () => {
  const { boardId: boardIdParam } = useParams()
  const navigate = useNavigate()
  const { user, signOutUser } = useAuth()
  const userId = user?.uid || ''

  const boardId = boardIdParam || defaultBoardId

  const [objects, setObjects] = useState<BoardObject[]>([])
  const objectsRef = useRef<BoardObject[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [clipboardObject, setClipboardObject] = useState<BoardObject | null>(null)
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null)
  const [resizingObjectId, setResizingObjectId] = useState<string | null>(null)
  const [rotatingObjectId, setRotatingObjectId] = useState<string | null>(null)
  const [localObjectRotations, setLocalObjectRotations] = useState<Record<string, number>>({})
  const localObjectRotationsRef = useRef<Record<string, number>>({})
  const [draggingConnectorId, setDraggingConnectorId] = useState<string | null>(null)
  const [localObjectPositions, setLocalObjectPositions] = useState<
    Record<string, LocalPositionOverride>
  >({})
  const [localObjectSizes, setLocalObjectSizes] = useState<Record<string, LocalSizeOverride>>({})
  const [localConnectorGeometry, setLocalConnectorGeometry] = useState<
    Record<string, LocalConnectorOverride>
  >({})
  const [activityEvents, setActivityEvents] = useState<BoardActivityEvent[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [showTimelinePanel, setShowTimelinePanel] = useState(false)
  const [isVotingMode, setIsVotingMode] = useState(false)
  const [timerState, setTimerState] = useState<TimerState>({
    running: false,
    endsAt: null,
    remainingMs: TIMER_DEFAULT_MS,
  })
  const [inlineEditor, setInlineEditor] = useState<InlineEditorDraft | null>(null)
  const [nowMsValue, setNowMsValue] = useState(Date.now())
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [isTimelineReplaying, setIsTimelineReplaying] = useState(false)
  const [replayingEventId, setReplayingEventId] = useState<string | null>(null)
  const [, setYjsPilotMetrics] = useState({ objects: 0, bytes: 0 })
  const connectionStatus = useConnectionStatus()
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [boardAccessState, setBoardAccessState] = useState<'checking' | 'granted' | 'denied'>('checking')
  const [boardAccessError, setBoardAccessError] = useState<string | null>(null)
  const [showBoardsPanel, setShowBoardsPanel] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardDescription, setNewBoardDescription] = useState('')
  const [boardFormError, setBoardFormError] = useState<string | null>(null)
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null)
  const [renameBoardName, setRenameBoardName] = useState('')
  const [renameBoardError, setRenameBoardError] = useState<string | null>(null)
  const [shareDialogBoardId, setShareDialogBoardId] = useState<string | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [shareRole, setShareRole] = useState<'edit' | 'view'>('edit')
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [isShareSubmitting, setIsShareSubmitting] = useState(false)
  const [aiCommandHistory, setAiCommandHistory] = useState<AiCommandHistoryEntry[]>([])
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [interactionMode, setInteractionMode] = useState<'edit' | 'view'>('edit')
  const [selectionMode, setSelectionMode] = useState<'select' | 'area'>('select')
  const [showTemplateChooser, setShowTemplateChooser] = useState(false)
  const [activeCreatePopover, setActiveCreatePopover] = useState<CreatePopoverKey | null>(null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('')
  const [commandPaletteActiveIndex, setCommandPaletteActiveIndex] = useState(0)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [shapeCreateDraft, setShapeCreateDraft] = useState<{
    shapeType: ShapeKind
    color: string
    text: string
  }>({
    shapeType: 'rectangle',
    color: SHAPE_COLOR_OPTIONS[0],
    text: 'New shape',
  })
  const [connectorCreateDraft, setConnectorCreateDraft] = useState<{
    style: ConnectorStyle
    color: string
  }>({
    style: 'arrow',
    color: CONNECTOR_COLOR_OPTIONS[0],
  })
  const [textCreateDraft, setTextCreateDraft] = useState<{
    text: string
    color: string
    fontSize: number
  }>({
    text: '',
    color: TEXT_COLOR_OPTIONS[0],
    fontSize: 24,
  })
  const [selectionBox, setSelectionBox] = useState<{
    active: boolean
    start: Point
    end: Point
  } | null>(null)
  const [voteConfettiParticles, setVoteConfettiParticles] = useState<VoteConfettiParticle[]>([])
  const roleCanEditBoard = useMemo(() => {
    if (!userId) {
      return false
    }
    const activeBoardMeta = boards.find((boardMeta) => boardMeta.id === boardId)
    if (!activeBoardMeta) {
      return true
    }
    if (activeBoardMeta.ownerId === userId) {
      return true
    }
    return (activeBoardMeta.sharedRoles[userId] || 'edit') !== 'view'
  }, [boardId, boards, userId])
  const canEditBoard = interactionMode === 'edit' && roleCanEditBoard
  const boardCanvasBackground = themeMode === 'dark' ? '#0f172a' : '#f8fafc'
  const hasLiveBoardAccess = boardAccessState === 'granted'
  const { cursors, publishCursorPosition } = usePresence({
    rtdb,
    boardId,
    user,
    enabled: hasLiveBoardAccess,
  })

  const stageRef = useRef<Konva.Stage | null>(null)
  const replayAbortRef = useRef(false)
  const [stageSize, setStageSize] = useState({
    width: window.innerWidth,
    height: Math.max(320, window.innerHeight - BOARD_HEADER_HEIGHT),
  })
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 })

  const timerRef = useRef<ReturnType<typeof ref> | null>(null)
  const yjsPilotMirrorRef = useRef<YjsPilotMirror | null>(
    syncBackend === 'yjs-pilot' ? new YjsPilotMirror() : null,
  )

  const liveDragPositionsRef = useRef<Record<string, Point>>({})
  const connectorPublishersRef = useRef<Record<string, (patch: ConnectorPatch) => void>>({})
  const historyPastRef = useRef<HistoryEntry[]>([])
  const historyFutureRef = useRef<HistoryEntry[]>([])
  const isApplyingHistoryRef = useRef(false)
  const pendingStickyDropIdsRef = useRef<Set<string>>(new Set())
  const stickyDropTweensRef = useRef<Record<string, Konva.Tween>>({})
  const selectionScanLayerRef = useRef<Konva.Layer | null>(null)
  const selectionScanRectRef = useRef<Konva.Rect | null>(null)
  const selectionScanAnimationRef = useRef<Konva.Animation | null>(null)
  const zoomMomentumFrameRef = useRef<number | null>(null)
  const zoomMomentumTargetRef = useRef<Viewport | null>(null)
  const confettiFrameRef = useRef<number | null>(null)
  const confettiLastTimestampRef = useRef<number | null>(null)
  const inlineTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const inlineInputRef = useRef<HTMLInputElement | null>(null)
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null)
  const boardNavigationTimeoutRef = useRef<number | null>(null)
  const createPopoverContainerRef = useRef<HTMLDivElement | null>(null)
  const frameDragSnapshotRef = useRef<
    Record<
      string,
      {
        frameStart: Point
        members: Array<{ id: string; start: Point }>
      }
    >
  >({})
  const multiDragSnapshotRef = useRef<Record<string, { anchor: Point; members: Array<{ id: string; start: Point }> }>>(
    {},
  )
  const rotationOverlayDragRef = useRef<{
    objectId: string
    objectType: BoardObject['type']
    centerX: number
    centerY: number
    latestRotation: number
  } | null>(null)

  useEffect(() => {
    localObjectRotationsRef.current = localObjectRotations
  }, [localObjectRotations])
  useEffect(() => {
    const handleResize = () => {
      setStageSize({
        width: window.innerWidth,
        height: Math.max(320, window.innerHeight - BOARD_HEADER_HEIGHT),
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])
  useEffect(() => {
    if (!user || boardAccessState !== 'granted') {
      return
    }
    window.localStorage.setItem(`${LAST_BOARD_STORAGE_PREFIX}:${user.uid}`, boardId)
  }, [boardAccessState, boardId, user])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.length === 0) {
        return prev
      }
      const objectIdSet = new Set(objects.map((boardObject) => boardObject.id))
      const next = prev.filter((id) => objectIdSet.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [objects])
  useEffect(() => {
    if (roleCanEditBoard || interactionMode === 'view') {
      return
    }
    setInteractionMode('view')
  }, [interactionMode, roleCanEditBoard])
  useEffect(() => {
    if (canEditBoard) {
      return
    }

    setActiveCreatePopover(null)
    setShowTemplateChooser(false)
    setInlineEditor(null)
    setSelectionBox(null)
    setResizingObjectId(null)
    setDraggingObjectId(null)
    setDraggingConnectorId(null)
  }, [canEditBoard])
  useEffect(() => {
    if (!hoveredObjectId) {
      return
    }
    if (!objects.some((boardObject) => boardObject.id === hoveredObjectId)) {
      setHoveredObjectId(null)
    }
  }, [hoveredObjectId, objects])
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) {
      return
    }

    if (hoveredObjectId && selectionMode === 'select') {
      container.style.cursor = 'pointer'
      return
    }

    container.style.cursor = ''
  }, [hoveredObjectId, selectionMode])

  useEffect(() => {
    if (!db || !user) {
      return
    }

    let cancelled = false
    setBoardAccessState('checking')
    setBoardAccessError(null)

    const boardRef = doc(db, 'boards', boardId)
    void (async () => {
      try {
        const snapshot = await getDoc(boardRef)
        if (!snapshot.exists()) {
          await setDoc(boardRef, {
            id: boardId,
            name: `Board ${boardId.slice(0, 8)}`,
            description: 'Untitled board',
            ownerId: user.uid,
            sharedWith: [],
            sharedRoles: {},
            createdBy: user.uid,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          if (!cancelled) {
            setBoardAccessState('granted')
          }
          return
        }

        const boardMeta = toBoardMeta(
          snapshot.id,
          snapshot.data() as Partial<BoardMeta> & {
            ownerId?: unknown
            sharedWith?: unknown
            sharedRoles?: unknown
            deleted?: boolean
          },
        )
        if (!boardMeta || !canAccessBoardMeta(boardMeta, user.uid)) {
          if (!cancelled) {
            setBoardAccessState('denied')
            setBoardAccessError("You don't have permission to access this board.")
          }
          return
        }

        if (!cancelled) {
          setBoardAccessState('granted')
        }

        const rawData = snapshot.data() as Partial<BoardMeta> & {
          ownerId?: unknown
          sharedWith?: unknown
          sharedRoles?: unknown
        }
        const requiresBackfill =
          typeof rawData.ownerId !== 'string' ||
          !Array.isArray(rawData.sharedWith) ||
          !rawData.sharedRoles ||
          typeof rawData.sharedRoles !== 'object' ||
          Array.isArray(rawData.sharedRoles) ||
          typeof rawData.createdBy !== 'string' ||
          rawData.createdBy.trim().length === 0
        if (requiresBackfill && boardMeta.ownerId === user.uid) {
          await setDoc(
            boardRef,
            {
              createdBy: boardMeta.createdBy,
              ownerId: boardMeta.ownerId,
              sharedWith: boardMeta.sharedWith,
              sharedRoles: boardMeta.sharedRoles,
              updatedBy: user.uid,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )
        }
      } catch (error) {
        const errorCode =
          typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : ''
        if (errorCode.includes('permission-denied')) {
          if (!cancelled) {
            setBoardAccessState('denied')
            setBoardAccessError("You don't have permission to access this board.")
          }
          return
        }

        console.error('Failed to resolve board access', error)
        if (!cancelled) {
          setBoardAccessState('denied')
          setBoardAccessError('Unable to open this board right now.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [boardId, user])

  useEffect(() => {
    if (!db || !user) {
      return
    }

    let ownedBoards: BoardMeta[] = []
    let legacyOwnedBoards: BoardMeta[] = []
    let sharedBoards: BoardMeta[] = []

    const updateMergedBoards = () => {
      const mergedById = new Map<string, BoardMeta>()
      ;[...ownedBoards, ...legacyOwnedBoards, ...sharedBoards].forEach((candidate) => {
        if (!canAccessBoardMeta(candidate, user.uid)) {
          return
        }
        const existing = mergedById.get(candidate.id)
        if (!existing || (candidate.updatedAt || 0) >= (existing.updatedAt || 0)) {
          mergedById.set(candidate.id, candidate)
        }
      })
      const merged = [...mergedById.values()].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
      setBoards(merged)
    }

    const parseSnapshot = (snapshot: {
      forEach: (callback: (docSnap: { id: string; data: () => unknown }) => void) => void
    }) => {
      const next: BoardMeta[] = []
      snapshot.forEach((docSnap) => {
        const boardMeta = toBoardMeta(
          docSnap.id,
          docSnap.data() as Partial<BoardMeta> & {
            ownerId?: unknown
            sharedWith?: unknown
            sharedRoles?: unknown
            deleted?: boolean
          },
        )
        if (!boardMeta) {
          return
        }
        next.push(boardMeta)
      })
      return next
    }

    const ownerQuery = query(collection(db, 'boards'), where('ownerId', '==', user.uid), firestoreLimit(80))
    const legacyOwnerQuery = query(collection(db, 'boards'), where('createdBy', '==', user.uid), firestoreLimit(80))
    const sharedQuery = query(
      collection(db, 'boards'),
      where('sharedWith', 'array-contains', user.uid),
      firestoreLimit(80),
    )

    const unsubscribeOwner = onSnapshot(
      ownerQuery,
      (snapshot) => {
        ownedBoards = parseSnapshot(snapshot)
        updateMergedBoards()
      },
      (error) => {
        console.warn('Owner boards query failed', error)
      },
    )
    const unsubscribeLegacyOwner = onSnapshot(
      legacyOwnerQuery,
      (snapshot) => {
        legacyOwnedBoards = parseSnapshot(snapshot)
        updateMergedBoards()
      },
      (error) => {
        console.warn('Legacy owner boards query failed', error)
      },
    )
    const unsubscribeShared = onSnapshot(
      sharedQuery,
      (snapshot) => {
        sharedBoards = parseSnapshot(snapshot)
        updateMergedBoards()
      },
      (error) => {
        console.warn('Shared boards query failed', error)
      },
    )

    return () => {
      unsubscribeOwner()
      unsubscribeLegacyOwner()
      unsubscribeShared()
    }
  }, [user])

  useObjectSync({
    db,
    boardId,
    enabled: hasLiveBoardAccess,
    draggingObjectId,
    draggingConnectorId,
    resizingObjectId,
    objectsRef,
    yjsMirrorRef: yjsPilotMirrorRef,
    setYjsPilotMetrics,
    setObjects,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setLocalConnectorGeometry,
  })

  useEffect(() => {
    if (hasLiveBoardAccess) {
      return
    }
    objectsRef.current = []
    setObjects([])
    setSelectedIds([])
  }, [hasLiveBoardAccess])

  useEffect(() => {
    if (voteConfettiParticles.length === 0 || confettiFrameRef.current !== null) {
      return
    }

    const tick = (timestamp: number) => {
      const previousTimestamp = confettiLastTimestampRef.current ?? timestamp
      const delta = Math.min(40, Math.max(10, timestamp - previousTimestamp))
      const step = delta / 16.67
      confettiLastTimestampRef.current = timestamp

      setVoteConfettiParticles((prev) => {
        const next = prev
          .map((particle) => {
            const nextLife = particle.life - VOTE_CONFETTI_DECAY * step
            if (nextLife <= 0) {
              return null
            }

            const nextVy = particle.vy + VOTE_CONFETTI_GRAVITY * step
            return {
              ...particle,
              x: particle.x + particle.vx * step,
              y: particle.y + nextVy * step,
              vy: nextVy,
              rotation: particle.rotation + particle.spin * step,
              life: nextLife,
            }
          })
          .filter((particle): particle is VoteConfettiParticle => Boolean(particle))

        if (next.length > 0) {
          confettiFrameRef.current = window.requestAnimationFrame(tick)
        } else {
          confettiFrameRef.current = null
          confettiLastTimestampRef.current = null
        }
        return next
      })
    }

    confettiFrameRef.current = window.requestAnimationFrame(tick)
  }, [voteConfettiParticles.length])

  useEffect(
    () => () => {
      if (confettiFrameRef.current !== null) {
        window.cancelAnimationFrame(confettiFrameRef.current)
        confettiFrameRef.current = null
      }
      confettiLastTimestampRef.current = null

      if (selectionScanAnimationRef.current) {
        selectionScanAnimationRef.current.stop()
        selectionScanAnimationRef.current = null
      }

      if (zoomMomentumFrameRef.current !== null) {
        window.cancelAnimationFrame(zoomMomentumFrameRef.current)
        zoomMomentumFrameRef.current = null
      }
      zoomMomentumTargetRef.current = null

      Object.keys(stickyDropTweensRef.current).forEach((objectId) => {
        const tween = stickyDropTweensRef.current[objectId]
        tween?.destroy()
        delete stickyDropTweensRef.current[objectId]
      })
    },
    [],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMsValue(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!rtdb || !hasLiveBoardAccess) {
      return
    }

    const boardTimerRef = ref(rtdb, `controls/${boardId}/timer`)
    timerRef.current = boardTimerRef
    const unsubscribe = onValue(boardTimerRef, (snapshot) => {
      const payload = snapshot.val() as Partial<TimerState> | null
      setTimerState({
        running: Boolean(payload?.running),
        endsAt: typeof payload?.endsAt === 'number' ? payload.endsAt : null,
        remainingMs:
          typeof payload?.remainingMs === 'number'
            ? payload.remainingMs
            : typeof payload?.endsAt === 'number'
              ? Math.max(0, payload.endsAt - Date.now())
              : TIMER_DEFAULT_MS,
      })
    })

    return () => {
      timerRef.current = null
      unsubscribe()
    }
  }, [boardId, hasLiveBoardAccess])

  useEffect(() => {
    if (!db || !hasLiveBoardAccess) {
      return
    }

    const eventsQuery = query(
      collection(db, 'boards', boardId, 'events'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(120),
    )
    const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      const nextEvents: BoardActivityEvent[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<BoardActivityEvent>
        if (!data.id || !data.action || !data.actorId || !data.actorName || !data.createdAt) {
          return
        }
        nextEvents.push(data as BoardActivityEvent)
      })

      setActivityEvents(nextEvents.sort((left, right) => right.createdAt - left.createdAt))
    })

    return unsubscribe
  }, [boardId, hasLiveBoardAccess])

  useEffect(() => {
    if (!db || !hasLiveBoardAccess) {
      return
    }

    const commandsQuery = query(
      collection(db, 'boards', boardId, 'aiCommands'),
      orderBy('queuedAt', 'desc'),
      firestoreLimit(24),
    )
    const unsubscribe = onSnapshot(commandsQuery, (snapshot) => {
      const nextHistory: AiCommandHistoryEntry[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<AiCommandHistoryEntry>
        if (!data.command || !data.status) {
          return
        }
        nextHistory.push({
          id: docSnap.id,
          command: data.command,
          status: data.status,
          queuedAt: data.queuedAt,
          completedAt: data.completedAt,
          error: data.error,
        })
      })
      setAiCommandHistory(nextHistory)
    })

    return unsubscribe
  }, [boardId, hasLiveBoardAccess])

  const pushHistory = useCallback((entry: HistoryEntry) => {
    historyPastRef.current = [...historyPastRef.current.slice(-199), entry]
    historyFutureRef.current = []
  }, [])

  const logActivity = useCallback(
    async (entry: Omit<BoardActivityEvent, 'id' | 'boardId' | 'createdAt'>) => {
      if (!db || !hasLiveBoardAccess) {
        return
      }

      const event: BoardActivityEvent = {
        id: crypto.randomUUID(),
        boardId,
        createdAt: Date.now(),
        ...entry,
      }

      await setDoc(doc(db, 'boards', boardId, 'events', event.id), event)
    },
    [boardId, hasLiveBoardAccess],
  )
  const touchBoard = useCallback(() => {
    if (!db || !user || !hasLiveBoardAccess) {
      return
    }
    const targetBoardMeta = boards.find((candidate) => candidate.id === boardId)
    if (!targetBoardMeta || targetBoardMeta.ownerId !== user.uid) {
      return
    }
    void setDoc(
      doc(db, 'boards', boardId),
      {
        id: boardId,
        ownerId: targetBoardMeta.ownerId,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    )
  }, [boardId, boards, hasLiveBoardAccess, user])

  const selectedId = selectedIds[0] || null
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const currentBoardMeta = useMemo(
    () => boards.find((boardMeta) => boardMeta.id === boardId) || null,
    [boardId, boards],
  )
  const canManageCurrentBoardSharing = useMemo(
    () => Boolean(userId && currentBoardMeta && currentBoardMeta.ownerId === userId),
    [currentBoardMeta, userId],
  )
  const isRenamingCurrentBoard = Boolean(currentBoardMeta && renamingBoardId === currentBoardMeta.id)
  const showConnectionStatusPill = connectionStatus !== 'connected'
  const ownedBoards = useMemo(
    () => (userId ? boards.filter((boardMeta) => boardMeta.ownerId === userId) : []),
    [boards, userId],
  )
  const sharedBoards = useMemo(
    () => (userId ? boards.filter((boardMeta) => boardMeta.ownerId !== userId) : []),
    [boards, userId],
  )
  const objectsById = useMemo(() => new Map(objects.map((boardObject) => [boardObject.id, boardObject])), [objects])
  const shareDialogBoardMeta = useMemo(
    () => boards.find((boardMeta) => boardMeta.id === shareDialogBoardId) || null,
    [boards, shareDialogBoardId],
  )
  const selectedObject = useMemo(
    () => objects.find((boardObject) => boardObject.id === selectedId) || null,
    [objects, selectedId],
  )
  const renderObjects = useMemo(() => {
    if (objects.length <= 160) {
      const frames: BoardObject[] = []
      const nonFrames: BoardObject[] = []

      objects.forEach((boardObject) => {
        if (boardObject.type === 'frame') {
          frames.push(boardObject)
          return
        }
        nonFrames.push(boardObject)
      })

      return [...frames, ...nonFrames]
    }

    const viewportBounds = {
      x: -viewport.x / viewport.scale,
      y: -viewport.y / viewport.scale,
      width: stageSize.width / viewport.scale,
      height: stageSize.height / viewport.scale,
    }
    const padding = 260 / Math.max(0.35, viewport.scale)
    const expandedViewport = {
      x: viewportBounds.x - padding,
      y: viewportBounds.y - padding,
      width: viewportBounds.width + padding * 2,
      height: viewportBounds.height + padding * 2,
    }

    const visibleChildrenByFrameId = new Set<string>()
    const visible: BoardObject[] = []

    objects.forEach((boardObject) => {
      if (selectedIdSet.has(boardObject.id)) {
        visible.push(boardObject)
        if (boardObject.frameId) {
          visibleChildrenByFrameId.add(boardObject.frameId)
        }
        return
      }

      if (boardObject.type === 'frame') {
        return
      }

      const bounds = getObjectBounds(boardObject, objectsById)
      if (!overlaps(expandedViewport, bounds)) {
        return
      }

      visible.push(boardObject)
      if (boardObject.frameId) {
        visibleChildrenByFrameId.add(boardObject.frameId)
      }
    })

    const visibleObjectIds = new Set(visible.map((boardObject) => boardObject.id))
    const frames: BoardObject[] = []
    const nonFrames: BoardObject[] = []

    objects.forEach((boardObject) => {
      if (boardObject.type === 'frame') {
        const isFrameVisible =
          selectedIdSet.has(boardObject.id) ||
          visibleChildrenByFrameId.has(boardObject.id) ||
          overlaps(expandedViewport, getObjectBounds(boardObject, objectsById))
        if (!isFrameVisible) {
          return
        }
        frames.push(boardObject)
        return
      }

      if (visibleObjectIds.has(boardObject.id)) {
        nonFrames.push(boardObject)
      }
    })

    return [...frames, ...nonFrames]
  }, [objects, objectsById, selectedIdSet, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y])
  const selfDisplayName = useMemo(
    () => (user?.displayName || user?.email || 'Anonymous').trim(),
    [user],
  )
  const presenceEntries = useMemo(() => {
    const deduped = new Map<string, CursorPresence>()
    for (const candidate of Object.values(cursors)) {
      if (!candidate || typeof candidate.userId !== 'string') {
        continue
      }
      const userId = candidate.userId.trim()
      const displayName = String(candidate.displayName || '').trim()
      if (!userId || !displayName) {
        continue
      }

      const existing = deduped.get(userId)
      if (!existing || candidate.lastSeen > existing.lastSeen) {
        deduped.set(userId, {
          ...candidate,
          userId,
          displayName,
        })
      }
    }
    return Array.from(deduped.values())
  }, [cursors])
  const remotePresenceEntries = useMemo(
    () => presenceEntries.filter((cursor) => cursor.userId !== user?.uid),
    [presenceEntries, user?.uid],
  )
  const selectedObjects = useMemo(
    () => selectedIds.map((id) => objects.find((boardObject) => boardObject.id === id)).filter(Boolean) as BoardObject[],
    [objects, selectedIds],
  )
  const onlineDisplayNames = useMemo(
    () => [selfDisplayName, ...remotePresenceEntries.map((cursor) => cursor.displayName)],
    [remotePresenceEntries, selfDisplayName],
  )
  const effectiveTimerMs = timerState.running && timerState.endsAt
    ? Math.max(0, timerState.endsAt - nowMsValue)
    : timerState.remainingMs
  const selectedColorOptions = useMemo(() => {
    if (!selectedObject) {
      return [] as string[]
    }

    if (selectedObject.type === 'stickyNote') {
      return STICKY_COLOR_OPTIONS
    }

    if (selectedObject.type === 'shape') {
      return SHAPE_COLOR_OPTIONS
    }

    if (selectedObject.type === 'frame') {
      return FRAME_COLOR_OPTIONS
    }

    if (selectedObject.type === 'text') {
      return TEXT_COLOR_OPTIONS
    }

    return CONNECTOR_COLOR_OPTIONS
  }, [selectedObject])
  const selectedShapeOptions = useMemo(() => {
    if (!selectedObject || (selectedObject.type !== 'shape' && selectedObject.type !== 'stickyNote')) {
      return [] as Array<{ kind: ShapeKind; label: string }>
    }
    return SHAPE_TYPE_OPTIONS
  }, [selectedObject])
  const selectedComments = selectedObject?.comments || []
  const timelineEvents = useMemo(() => activityEvents.slice(0, 20), [activityEvents])
  const inlineEditorTarget = useMemo(() => {
    if (!inlineEditor) {
      return null
    }

    return objects.find((boardObject) => boardObject.id === inlineEditor.objectId) || null
  }, [inlineEditor, objects])
  const inlineEditorLayout = useMemo(() => {
    if (!inlineEditor || !inlineEditorTarget || inlineEditorTarget.type === 'connector') {
      return null
    }

    const objectPosition =
      localObjectPositions[inlineEditorTarget.id]?.point || inlineEditorTarget.position
    const objectLeft = viewport.x + objectPosition.x * viewport.scale
    const objectTop = viewport.y + objectPosition.y * viewport.scale
    const objectRotation = localObjectRotations[inlineEditorTarget.id] ?? inlineEditorTarget.rotation ?? 0
    const withTransform = (layout: {
      left: number
      top: number
      width: number
      height: number
      fontSize: number
      multiline: boolean
    }) => ({
      ...layout,
      rotation: objectRotation,
      transformOriginX: objectLeft - layout.left,
      transformOriginY: objectTop - layout.top,
    })

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'stickyNote') {
      const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
      const objectWidth = inlineEditorTarget.size.width * viewport.scale
      const objectHeight = inlineEditorTarget.size.height * viewport.scale

      if (shapeType === 'rectangle') {
        const inset = 8 * viewport.scale
        return withTransform({
          left: objectLeft + inset,
          top: objectTop + inset,
          width: Math.max(120, objectWidth - inset * 2),
          height: Math.max(48, objectHeight - inset * 2),
          fontSize: Math.max(12, 16 * viewport.scale),
          multiline: true,
        })
      }

      const widthRatio =
        shapeType === 'circle' ? 0.68 : shapeType === 'triangle' ? 0.56 : 0.62
      const heightRatio = shapeType === 'triangle' ? 0.46 : 0.56
      const width = Math.max(96, objectWidth * widthRatio)
      const height = Math.max(42, objectHeight * heightRatio)

      return withTransform({
        left: objectLeft + (objectWidth - width) / 2,
        top: objectTop + (objectHeight - height) / 2,
        width,
        height,
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: true,
      })
    }

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
      const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
      const objectWidth = inlineEditorTarget.size.width * viewport.scale
      const objectHeight = inlineEditorTarget.size.height * viewport.scale

      if (shapeType === 'rectangle') {
        const inset = 10 * viewport.scale
        return withTransform({
          left: objectLeft + inset,
          top: objectTop + inset,
          width: Math.max(120, objectWidth - inset * 2),
          height: Math.max(36, objectHeight - inset * 2),
          fontSize: Math.max(12, 14 * viewport.scale),
          multiline: true,
        })
      }

      const widthRatio =
        shapeType === 'circle' ? 0.68 : shapeType === 'triangle' ? 0.56 : 0.62
      const heightRatio = shapeType === 'triangle' ? 0.46 : 0.56
      const width = Math.max(92, objectWidth * widthRatio)
      const height = Math.max(38, objectHeight * heightRatio)

      return withTransform({
        left: objectLeft + (objectWidth - width) / 2,
        top: objectTop + (objectHeight - height) / 2,
        width,
        height,
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: true,
      })
    }

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'text') {
      return withTransform({
        left: objectLeft,
        top: objectTop,
        width: Math.max(120, inlineEditorTarget.size.width * viewport.scale),
        height: Math.max(36, inlineEditorTarget.size.height * viewport.scale),
        fontSize: Math.max(12, (inlineEditorTarget.fontSize || 24) * viewport.scale),
        multiline: true,
      })
    }

    if (inlineEditor.field === 'title' && inlineEditorTarget.type === 'frame') {
      return withTransform({
        left: objectLeft + 10 * viewport.scale,
        top: objectTop + 6 * viewport.scale,
        width: Math.max(160, inlineEditorTarget.size.width * viewport.scale - 20 * viewport.scale),
        height: Math.max(24, 24 * viewport.scale),
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: false,
      })
    }

    return null
  }, [
    inlineEditor,
    inlineEditorTarget,
    localObjectRotations,
    localObjectPositions,
    viewport.scale,
    viewport.x,
    viewport.y,
  ])
  const inlineEditorAppearance = useMemo(() => {
    if (!inlineEditor || !inlineEditorTarget) {
      return null
    }

    const classNames = ['inline-editor']
    const style: CSSProperties = {}

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'stickyNote') {
      const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
      classNames.push('inline-editor-sticky')

      if (shapeType === 'rectangle') {
        classNames.push('inline-editor-align-left')
        style.backgroundColor = inlineEditorTarget.color
        style.borderColor = 'rgba(15, 23, 42, 0.22)'
      } else {
        classNames.push('inline-editor-align-center')
        style.backgroundColor = 'transparent'
        style.borderColor = 'rgba(15, 23, 42, 0.3)'
      }

      if (shapeType === 'circle') {
        classNames.push('inline-editor-pill')
      }

      style.color = getContrastingTextColor(inlineEditorTarget.color)
      return { className: classNames.join(' '), style }
    }

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
      const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
      classNames.push('inline-editor-shape')

      if (shapeType === 'rectangle') {
        classNames.push('inline-editor-align-left')
        style.backgroundColor = inlineEditorTarget.color
        style.borderColor = 'rgba(15, 23, 42, 0.22)'
      } else {
        classNames.push('inline-editor-align-center')
        style.backgroundColor = 'transparent'
        style.borderColor = 'rgba(15, 23, 42, 0.3)'
      }

      style.color = getContrastingTextColor(inlineEditorTarget.color)
      return { className: classNames.join(' '), style }
    }

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'text') {
      classNames.push('inline-editor-text-object')
      style.backgroundColor = 'transparent'
      style.borderColor = 'transparent'
      style.color = inlineEditorTarget.color
      return { className: classNames.join(' '), style }
    }

    if (inlineEditor.field === 'title' && inlineEditorTarget.type === 'frame') {
      classNames.push('inline-editor-frame', 'inline-editor-align-left')
      style.backgroundColor = inlineEditorTarget.color
      style.borderColor = 'rgba(15, 23, 42, 0.24)'
      style.color = getContrastingTextColor(inlineEditorTarget.color)
      return { className: classNames.join(' '), style }
    }

    return { className: classNames.join(' '), style }
  }, [inlineEditor, inlineEditorTarget])
  const minimapModel = useMemo(() => {
    const miniWidth = 220
    const miniHeight = 140
    const bounds = objects.map((boardObject) => getObjectBounds(boardObject, objectsById))
    const viewportWorld = {
      x: -viewport.x / viewport.scale,
      y: -viewport.y / viewport.scale,
      width: stageSize.width / viewport.scale,
      height: stageSize.height / viewport.scale,
    }

    if (bounds.length === 0) {
      return {
        miniWidth,
        miniHeight,
        world: viewportWorld,
        viewportWorld,
        objects: [] as Array<{ id: string; x: number; y: number; width: number; height: number }>,
      }
    }

    const minX = Math.min(viewportWorld.x, ...bounds.map((item) => item.x))
    const minY = Math.min(viewportWorld.y, ...bounds.map((item) => item.y))
    const maxX = Math.max(
      viewportWorld.x + viewportWorld.width,
      ...bounds.map((item) => item.x + item.width),
    )
    const maxY = Math.max(
      viewportWorld.y + viewportWorld.height,
      ...bounds.map((item) => item.y + item.height),
    )
    const worldWidth = Math.max(1, maxX - minX)
    const worldHeight = Math.max(1, maxY - minY)

    return {
      miniWidth,
      miniHeight,
      world: {
        x: minX,
        y: minY,
        width: worldWidth,
        height: worldHeight,
      },
      viewportWorld,
      objects: bounds.map((item, index) => ({
        id: objects[index]?.id || `obj-${index}`,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      })),
    }
  }, [objects, objectsById, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y])
  const selectionBounds = useMemo(() => {
    if (!selectionBox?.active) {
      return null
    }
    const minX = Math.min(selectionBox.start.x, selectionBox.end.x)
    const minY = Math.min(selectionBox.start.y, selectionBox.end.y)
    const maxX = Math.max(selectionBox.start.x, selectionBox.end.x)
    const maxY = Math.max(selectionBox.start.y, selectionBox.end.y)
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }, [selectionBox])
  const selectObjectId = useCallback((objectId: string, additive = false) => {
    setSelectedIds((prev) => {
      if (!additive) {
        return [objectId]
      }
      if (prev.includes(objectId)) {
        return prev.filter((id) => id !== objectId)
      }
      return [...prev, objectId]
    })
  }, [])
  const resolveObjectPosition = useCallback(
    (boardObject: BoardObject) =>
      liveDragPositionsRef.current[boardObject.id] ||
      localObjectPositions[boardObject.id]?.point ||
      boardObject.position,
    [localObjectPositions],
  )
  const resolveObjectSize = useCallback(
    (boardObject: BoardObject) => localObjectSizes[boardObject.id]?.size || boardObject.size,
    [localObjectSizes],
  )
  const selectedObjectScreenBounds = useMemo(() => {
    if (!selectedObject) {
      return null
    }

    const worldBounds =
      selectedObject.type === 'connector'
        ? getObjectBounds(selectedObject, objectsById)
        : {
            x: resolveObjectPosition(selectedObject).x,
            y: resolveObjectPosition(selectedObject).y,
            width: resolveObjectSize(selectedObject).width,
            height: resolveObjectSize(selectedObject).height,
          }

    return {
      left: viewport.x + worldBounds.x * viewport.scale,
      top: viewport.y + worldBounds.y * viewport.scale,
      right: viewport.x + (worldBounds.x + worldBounds.width) * viewport.scale,
      bottom: viewport.y + (worldBounds.y + worldBounds.height) * viewport.scale,
    }
  }, [objectsById, resolveObjectPosition, resolveObjectSize, selectedObject, viewport.scale, viewport.x, viewport.y])
  const selectedObjectMenuPosition = useMemo(() => {
    if (!selectedObjectScreenBounds) {
      return null
    }

    const left = clamp(selectedObjectScreenBounds.right + 10, 10, Math.max(10, stageSize.width - 260))
    const top = clamp(
      selectedObjectScreenBounds.top - 12,
      BOARD_HEADER_HEIGHT + 10,
      Math.max(BOARD_HEADER_HEIGHT + 10, BOARD_HEADER_HEIGHT + stageSize.height - 120),
    )
    return { left, top }
  }, [selectedObjectScreenBounds, stageSize.height, stageSize.width])
  const projectObjectLocalPoint = useCallback(
    (boardObject: BoardObject, localPoint: Point, rotationOverride?: number) => {
      const position = resolveObjectPosition(boardObject)
      const rotationDegrees =
        rotationOverride ?? localObjectRotationsRef.current[boardObject.id] ?? boardObject.rotation ?? 0
      const rotationRadians = (rotationDegrees * Math.PI) / 180
      const cos = Math.cos(rotationRadians)
      const sin = Math.sin(rotationRadians)
      return {
        x: position.x + localPoint.x * cos - localPoint.y * sin,
        y: position.y + localPoint.x * sin + localPoint.y * cos,
      }
    },
    [resolveObjectPosition],
  )
  const toCanvasLocalPoint = useCallback(
    (worldPoint: Point) => ({
      x: viewport.x + worldPoint.x * viewport.scale,
      y: viewport.y + worldPoint.y * viewport.scale,
    }),
    [viewport.scale, viewport.x, viewport.y],
  )
  const resolveRotationCenterClientPoint = useCallback(
    (boardObject: BoardObject) => {
      const stageContainer = stageRef.current?.container()
      if (!stageContainer) {
        return null
      }

      const size = resolveObjectSize(boardObject)
      const centerWorld = projectObjectLocalPoint(boardObject, {
        x: size.width / 2,
        y: size.height / 2,
      })
      const centerLocal = toCanvasLocalPoint(centerWorld)
      const stageRect = stageContainer.getBoundingClientRect()
      return {
        x: stageRect.left + centerLocal.x,
        y: stageRect.top + centerLocal.y,
      }
    },
    [projectObjectLocalPoint, resolveObjectSize, toCanvasLocalPoint],
  )
  const rotationOverlayHandles = useMemo(() => {
    if (!canEditBoard || selectionMode !== 'select') {
      return [] as Array<{
        objectId: string
        objectType: BoardObject['type']
        left: number
        top: number
        size: number
      }>
    }

    const handleSize = Math.max(12, ROTATION_HANDLE_SIZE * viewport.scale)
    return selectedObjects
      .filter((boardObject) => boardObject.type !== 'connector')
      .map((boardObject) => {
        const size = resolveObjectSize(boardObject)
        const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
        const handleWorld = projectObjectLocalPoint(
          boardObject,
          {
            x: size.width / 2,
            y: -ROTATION_HANDLE_OFFSET,
          },
          rotation,
        )
        const handleLocal = toCanvasLocalPoint(handleWorld)
        return {
          objectId: boardObject.id,
          objectType: boardObject.type,
          left: handleLocal.x - handleSize / 2,
          top: handleLocal.y - handleSize / 2,
          size: handleSize,
        }
      })
  }, [
    canEditBoard,
    localObjectRotations,
    projectObjectLocalPoint,
    resolveObjectSize,
    selectedObjects,
    selectionMode,
    toCanvasLocalPoint,
    viewport.scale,
  ])
  const startRotationOverlayDrag = useCallback(
    (
      boardObject: BoardObject,
      handle: { objectId: string; objectType: BoardObject['type'] },
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      if (!canEditBoard || selectionMode !== 'select') {
        return
      }

      const center = resolveRotationCenterClientPoint(boardObject)
      if (!center) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const initialRotation = localObjectRotationsRef.current[boardObject.id] ?? boardObject.rotation ?? 0
      rotationOverlayDragRef.current = {
        objectId: handle.objectId,
        objectType: handle.objectType,
        centerX: center.x,
        centerY: center.y,
        latestRotation: initialRotation,
      }
      setRotatingObjectId(handle.objectId)
    },
    [canEditBoard, resolveRotationCenterClientPoint, selectionMode],
  )
  const resolveContainingFrameId = useCallback(
    (args: {
      objectId: string
      position: Point
      size: { width: number; height: number }
    }): string | null => {
      const matchingFrames = objectsRef.current
        .filter((candidate): candidate is BoardObject => candidate.type === 'frame' && candidate.id !== args.objectId)
        .filter((frameObject) => {
          const framePosition = resolveObjectPosition(frameObject)
          const frameSize = resolveObjectSize(frameObject)
          const objectRight = args.position.x + args.size.width
          const objectBottom = args.position.y + args.size.height
          const frameRight = framePosition.x + frameSize.width
          const frameBottom = framePosition.y + frameSize.height

          return (
            args.position.x >= framePosition.x &&
            args.position.y >= framePosition.y &&
            objectRight <= frameRight &&
            objectBottom <= frameBottom
          )
        })
        .sort((left, right) => right.zIndex - left.zIndex)

      return matchingFrames[0]?.id || null
    },
    [resolveObjectPosition, resolveObjectSize],
  )
  const resolveWorldPointer = useCallback(
    (stage: Konva.Stage): Point | null => {
      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return null
      }
      return {
        x: (pointer.x - viewport.x) / viewport.scale,
        y: (pointer.y - viewport.y) / viewport.scale,
      }
    },
    [viewport.scale, viewport.x, viewport.y],
  )
  const clearStickyDropTween = useCallback((objectId: string) => {
    const tween = stickyDropTweensRef.current[objectId]
    if (!tween) {
      return
    }

    tween.destroy()
    delete stickyDropTweensRef.current[objectId]
  }, [])
  const playStickyDropAnimation = useCallback(
    (objectId: string) => {
      const stage = stageRef.current
      if (!stage) {
        return false
      }

      const node = stage.findOne(`#sticky-${objectId}`) as Konva.Group | null
      if (!node) {
        return false
      }

      clearStickyDropTween(objectId)
      node.scale({ x: 0.82, y: 0.52 })
      node.opacity(0.78)
      const tween = new Konva.Tween({
        node,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        duration: STICKY_DROP_DURATION_SECONDS,
        easing: Konva.Easings.ElasticEaseOut,
        onFinish: () => {
          delete stickyDropTweensRef.current[objectId]
        },
      })
      stickyDropTweensRef.current[objectId] = tween
      tween.play()
      return true
    },
    [clearStickyDropTween],
  )
  const stopZoomMomentum = useCallback(() => {
    if (zoomMomentumFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomMomentumFrameRef.current)
      zoomMomentumFrameRef.current = null
    }
    zoomMomentumTargetRef.current = null
  }, [])
  const startZoomMomentum = useCallback(() => {
    if (zoomMomentumFrameRef.current !== null) {
      return
    }

    const tick = () => {
      let shouldContinue = false
      setViewport((prev) => {
        const target = zoomMomentumTargetRef.current
        if (!target) {
          return prev
        }

        const next = {
          x: prev.x + (target.x - prev.x) * ZOOM_MOMENTUM_SMOOTHING,
          y: prev.y + (target.y - prev.y) * ZOOM_MOMENTUM_SMOOTHING,
          scale: prev.scale + (target.scale - prev.scale) * ZOOM_MOMENTUM_SMOOTHING,
        }

        const isSettled =
          Math.abs(target.scale - next.scale) < ZOOM_MOMENTUM_EPSILON_SCALE &&
          Math.abs(target.x - next.x) < ZOOM_MOMENTUM_EPSILON_POSITION &&
          Math.abs(target.y - next.y) < ZOOM_MOMENTUM_EPSILON_POSITION

        if (isSettled) {
          return target
        }

        shouldContinue = true
        return next
      })

      if (shouldContinue) {
        zoomMomentumFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      zoomMomentumFrameRef.current = null
      zoomMomentumTargetRef.current = null
    }

    zoomMomentumFrameRef.current = window.requestAnimationFrame(tick)
  }, [])
  const queueZoomMomentum = useCallback(
    (targetViewport: Viewport) => {
      zoomMomentumTargetRef.current = targetViewport
      startZoomMomentum()
    },
    [startZoomMomentum],
  )
  useEffect(() => {
    if (pendingStickyDropIdsRef.current.size === 0) {
      return
    }

    for (const boardObject of objects) {
      if (boardObject.type !== 'stickyNote' || !pendingStickyDropIdsRef.current.has(boardObject.id)) {
        continue
      }

      const started = playStickyDropAnimation(boardObject.id)
      if (started) {
        pendingStickyDropIdsRef.current.delete(boardObject.id)
      }
    }
  }, [objects, playStickyDropAnimation])
  const beginSelectionBox = useCallback(
    (start: Point) => {
      setSelectionBox({
        active: true,
        start,
        end: start,
      })
    },
    [],
  )
  const updateSelectionBox = useCallback((nextPoint: Point) => {
    setSelectionBox((prev) => (prev ? { ...prev, end: nextPoint } : prev))
  }, [])
  const completeSelectionBox = useCallback(
    (additive: boolean) => {
      setSelectionBox((prev) => {
        if (!prev) {
          return prev
        }

        const bounds = {
          x: Math.min(prev.start.x, prev.end.x),
          y: Math.min(prev.start.y, prev.end.y),
          width: Math.abs(prev.end.x - prev.start.x),
          height: Math.abs(prev.end.y - prev.start.y),
        }

        if (bounds.width < 3 && bounds.height < 3) {
          return null
        }

        const hitIds = objects
          .filter((boardObject) => {
            const position = resolveObjectPosition(boardObject)
            const size = resolveObjectSize(boardObject)
            const objectBounds =
              boardObject.type === 'connector'
                ? getObjectBounds(boardObject, objectsById)
                : {
                    x: position.x,
                    y: position.y,
                    width: size.width,
                    height: size.height,
                  }
            return overlaps(bounds, objectBounds)
          })
          .map((boardObject) => boardObject.id)

        if (hitIds.length > 0) {
          setSelectedIds((current) => {
            if (!additive) {
              return hitIds
            }
            const merged = new Set([...current, ...hitIds])
            return [...merged]
          })
        } else if (!additive) {
          setSelectedIds([])
        }

        return null
      })
    },
    [objects, objectsById, resolveObjectPosition, resolveObjectSize],
  )
  const navigateToBoard = useCallback(
    (nextBoardId: string) => {
      if (boardNavigationTimeoutRef.current !== null) {
        window.clearTimeout(boardNavigationTimeoutRef.current)
        boardNavigationTimeoutRef.current = null
      }
      setShareDialogBoardId(null)
      setShareEmail('')
      setShareRole('edit')
      setShareError(null)
      setShareStatus(null)
      setRenamingBoardId(null)
      setRenameBoardName('')
      setRenameBoardError(null)
      setShowCommandPalette(false)
      setCommandPaletteQuery('')
      setCommandPaletteActiveIndex(0)
      setShowTemplateChooser(false)
      setShowBoardsPanel(false)
      setSelectionBox(null)
      setSelectedIds([])
      navigate(`/b/${nextBoardId}`)
    },
    [navigate],
  )
  const clearBoardNavigateTimeout = useCallback(() => {
    if (boardNavigationTimeoutRef.current === null) {
      return
    }
    window.clearTimeout(boardNavigationTimeoutRef.current)
    boardNavigationTimeoutRef.current = null
  }, [])
  const scheduleBoardNavigate = useCallback(
    (targetBoardId: string) => {
      clearBoardNavigateTimeout()
      boardNavigationTimeoutRef.current = window.setTimeout(() => {
        boardNavigationTimeoutRef.current = null
        navigateToBoard(targetBoardId)
      }, 180)
    },
    [clearBoardNavigateTimeout, navigateToBoard],
  )
  useEffect(
    () => () => {
      clearBoardNavigateTimeout()
    },
    [clearBoardNavigateTimeout],
  )
  const createBoard = useCallback(async () => {
    if (!db || !user) {
      return
    }

    const trimmedName = newBoardName.trim()
    if (!trimmedName) {
      setBoardFormError('Board name is required')
      return
    }

    const id = crypto.randomUUID()
    await setDoc(doc(db, 'boards', id), {
      id,
      name: trimmedName,
      description: newBoardDescription.trim(),
      ownerId: user.uid,
      sharedWith: [],
      sharedRoles: {},
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setNewBoardName('')
    setNewBoardDescription('')
    setBoardFormError(null)
    navigateToBoard(id)
  }, [navigateToBoard, newBoardDescription, newBoardName, user])
  const duplicateBoardMeta = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      const dbInstance = db

      const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
      if (!targetBoardMeta) {
        setBoardFormError('Board not found.')
        return
      }

      const duplicateBoardId = crypto.randomUUID()
      const duplicateNameBase = `${targetBoardMeta.name} (Copy)`.trim()
      const duplicateName =
        duplicateNameBase.length > 80 ? duplicateNameBase.slice(0, 80).trimEnd() : duplicateNameBase

      setBoardFormError(null)

      try {
        const sourceObjectsSnapshot = await getDocs(collection(dbInstance, 'boards', targetBoardId, 'objects'))
        await setDoc(doc(dbInstance, 'boards', duplicateBoardId), {
          id: duplicateBoardId,
          name: duplicateName,
          description: targetBoardMeta.description || '',
          ownerId: user.uid,
          sharedWith: [],
          sharedRoles: {},
          createdBy: user.uid,
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        const sourceObjects = sourceObjectsSnapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as Partial<BoardObject>
            if (!data.type || !data.position || !data.size || data.deleted) {
              return null
            }
            const sourceId =
              typeof data.id === 'string' && data.id.trim().length > 0 ? data.id.trim() : docSnapshot.id
            return {
              ...(data as BoardObject),
              id: sourceId,
            }
          })
          .filter((candidate): candidate is BoardObject => candidate !== null)

        if (sourceObjects.length > 0) {
          const copiedAt = Date.now()
          for (
            let startIndex = 0;
            startIndex < sourceObjects.length;
            startIndex += BOARD_DUPLICATE_BATCH_LIMIT
          ) {
            const batch = writeBatch(dbInstance)
            const slice = sourceObjects.slice(startIndex, startIndex + BOARD_DUPLICATE_BATCH_LIMIT)

            slice.forEach((sourceObject, offset) => {
              const copiedObject: BoardObject = {
                ...sourceObject,
                boardId: duplicateBoardId,
                zIndex: Number.isFinite(sourceObject.zIndex) ? sourceObject.zIndex : startIndex + offset + 1,
                version: Number.isFinite(sourceObject.version) ? sourceObject.version : 1,
                createdBy: user.uid,
                updatedBy: user.uid,
                createdAt: copiedAt + startIndex + offset,
                updatedAt: copiedAt + startIndex + offset,
                deleted: false,
              }

              batch.set(doc(dbInstance, 'boards', duplicateBoardId, 'objects', copiedObject.id), copiedObject)
            })

            await batch.commit()
          }
        }

        navigateToBoard(duplicateBoardId)
      } catch (error) {
        console.error('Unable to duplicate board', error)
        setBoardFormError('Unable to duplicate board right now.')
      }
    },
    [boards, navigateToBoard, user],
  )
  const deleteBoardMeta = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
      if (targetBoardMeta && targetBoardMeta.ownerId !== user.uid) {
        return
      }

      await deleteDoc(doc(db, 'boards', targetBoardId))
      if (targetBoardId === boardId) {
        navigate('/')
      }
    },
    [boardId, boards, navigate, user],
  )
  const beginBoardRename = useCallback(
    (targetBoardMeta: BoardMeta) => {
      if (!user || targetBoardMeta.ownerId !== user.uid) {
        return
      }
      clearBoardNavigateTimeout()
      setRenameBoardError(null)
      setRenamingBoardId(targetBoardMeta.id)
      setRenameBoardName(targetBoardMeta.name)
    },
    [clearBoardNavigateTimeout, user],
  )
  const cancelBoardRename = useCallback(() => {
    setRenamingBoardId(null)
    setRenameBoardName('')
    setRenameBoardError(null)
  }, [])
  const submitBoardRename = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      if (renamingBoardId !== targetBoardId) {
        return
      }
      const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
      if (!targetBoardMeta || targetBoardMeta.ownerId !== user.uid) {
        cancelBoardRename()
        return
      }

      const trimmedName = renameBoardName.trim()
      if (!trimmedName) {
        setRenameBoardError('Board name is required')
        return
      }
      if (trimmedName === targetBoardMeta.name) {
        cancelBoardRename()
        return
      }

      await setDoc(
        doc(db, 'boards', targetBoardId),
        {
          name: trimmedName,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      setBoards((prev) =>
        prev.map((boardMeta) =>
          boardMeta.id === targetBoardId ? { ...boardMeta, name: trimmedName, updatedAt: nowMs() } : boardMeta,
        ),
      )
      cancelBoardRename()
    },
    [boards, cancelBoardRename, renameBoardName, renamingBoardId, user],
  )
  const openShareDialog = useCallback((targetBoardId: string) => {
    setShareDialogBoardId(targetBoardId)
    setShareEmail('')
    setShareRole('edit')
    setShareError(null)
    setShareStatus(null)
  }, [])
  const closeShareDialog = useCallback(() => {
    setShareDialogBoardId(null)
    setShareEmail('')
    setShareRole('edit')
    setShareError(null)
    setShareStatus(null)
  }, [])
  const applyShareResponse = useCallback(
    (targetBoardId: string, payload: { sharedWith?: unknown; sharedRoles?: unknown; message?: string }) => {
      setBoards((prev) =>
        prev.map((boardMeta) => {
          if (boardMeta.id !== targetBoardId) {
            return boardMeta
          }
          const nextSharedWith = Array.isArray(payload.sharedWith)
            ? normalizeSharedWith(payload.sharedWith)
            : boardMeta.sharedWith
          const nextSharedRoles = normalizeSharedRoles(
            payload.sharedRoles !== undefined ? payload.sharedRoles : boardMeta.sharedRoles,
            nextSharedWith,
          )
          return {
            ...boardMeta,
            sharedWith: nextSharedWith,
            sharedRoles: nextSharedRoles,
          }
        }),
      )
      if (payload.message) {
        setShareStatus(payload.message)
      }
    },
    [],
  )
  const applyShareMutationFallback = useCallback(
    async (
      targetBoardId: string,
      collaboratorId: string,
      action: 'share' | 'revoke',
      role: 'edit' | 'view' = 'edit',
    ) => {
      if (!db || !user) {
        throw new Error('Unable to update board sharing right now.')
      }

      const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
      if (!targetBoardMeta) {
        throw new Error('Board metadata unavailable.')
      }
      if (targetBoardMeta.ownerId !== user.uid) {
        throw new Error('Only the board owner can manage sharing.')
      }

      const sharedWithSet = new Set(targetBoardMeta.sharedWith)
      const nextSharedRoles = { ...targetBoardMeta.sharedRoles }
      if (action === 'revoke') {
        sharedWithSet.delete(collaboratorId)
        delete nextSharedRoles[collaboratorId]
      } else {
        sharedWithSet.add(collaboratorId)
        nextSharedRoles[collaboratorId] = role
      }

      const nextSharedWith = [...sharedWithSet]
      const normalizedSharedRoles = normalizeSharedRoles(nextSharedRoles, nextSharedWith)
      await setDoc(
        doc(db, 'boards', targetBoardId),
        {
          ownerId: targetBoardMeta.ownerId,
          sharedWith: nextSharedWith,
          sharedRoles: normalizedSharedRoles,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      applyShareResponse(targetBoardId, {
        sharedWith: nextSharedWith,
        sharedRoles: normalizedSharedRoles,
        message:
          action === 'revoke'
            ? 'Collaborator access removed.'
            : `Board shared successfully (${role === 'view' ? 'read-only' : 'can edit'}).`,
      })
      return nextSharedWith
    },
    [applyShareResponse, boards, user],
  )
  const resolveCollaboratorIdByEmail = useCallback(
    async (emailLower: string) => {
      if (!db) {
        throw new Error('Unable to look up collaborator right now.')
      }

      const lookupQuery = query(
        collection(db, 'users'),
        where('emailLower', '==', emailLower),
        firestoreLimit(1),
      )
      const snapshot = await getDocs(lookupQuery)
      const docSnap = snapshot.docs[0]
      if (!docSnap?.id) {
        throw new Error('Collaborator email not found.')
      }
      return docSnap.id
    },
    [],
  )
  const submitShareInvite = useCallback(async () => {
    if (!shareDialogBoardId || !user) {
      return
    }
    const trimmedEmail = shareEmail.trim().toLowerCase()
    if (!trimmedEmail) {
      setShareError('Enter an email address to share this board.')
      return
    }

    setIsShareSubmitting(true)
    setShareError(null)
    setShareStatus(null)
    try {
      try {
        const idToken = await user.getIdToken()
        const response = await fetch(shareBoardEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            boardId: shareDialogBoardId,
            email: trimmedEmail,
            action: 'share',
            role: shareRole,
          }),
        })
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; sharedWith?: unknown; sharedRoles?: unknown; message?: string }
          | null
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to share board right now.')
        }

        applyShareResponse(shareDialogBoardId, {
          sharedWith: payload?.sharedWith,
          sharedRoles: payload?.sharedRoles,
          message:
            payload?.message ||
            `Shared with ${trimmedEmail} (${shareRole === 'view' ? 'read-only' : 'can edit'}).`,
        })
      } catch {
        const collaboratorId = await resolveCollaboratorIdByEmail(trimmedEmail)
        await applyShareMutationFallback(shareDialogBoardId, collaboratorId, 'share', shareRole)
        setShareStatus(`Shared with ${trimmedEmail} (${shareRole === 'view' ? 'read-only' : 'can edit'}).`)
      }

      setShareEmail('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to share board right now.'
      setShareError(message)
    } finally {
      setIsShareSubmitting(false)
    }
  }, [
    applyShareMutationFallback,
    applyShareResponse,
    resolveCollaboratorIdByEmail,
    shareDialogBoardId,
    shareEmail,
    shareRole,
    user,
  ])
  const revokeSharedCollaborator = useCallback(
    async (targetBoardId: string, collaboratorId: string) => {
      if (!user) {
        return
      }

      setIsShareSubmitting(true)
      setShareError(null)
      setShareStatus(null)
      try {
        try {
          const idToken = await user.getIdToken()
          const response = await fetch(shareBoardEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              boardId: targetBoardId,
              userId: collaboratorId,
              action: 'revoke',
            }),
          })
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; sharedWith?: unknown; sharedRoles?: unknown; message?: string }
            | null
          if (!response.ok) {
            throw new Error(payload?.error || 'Unable to remove collaborator right now.')
          }

          applyShareResponse(targetBoardId, {
            sharedWith: payload?.sharedWith,
            sharedRoles: payload?.sharedRoles,
            message: payload?.message || 'Collaborator access removed.',
          })
        } catch {
          await applyShareMutationFallback(targetBoardId, collaboratorId, 'revoke')
        }

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to remove collaborator right now.'
        setShareError(message)
      } finally {
        setIsShareSubmitting(false)
      }
    },
    [applyShareMutationFallback, applyShareResponse, user],
  )
  const normalizeBoardObjectForWrite = useCallback(
    (boardObject: BoardObject): BoardObject => {
      const now = Date.now()
      return {
        ...boardObject,
        boardId,
        createdBy: boardObject.createdBy || user?.uid || 'system',
        createdAt: typeof boardObject.createdAt === 'number' ? boardObject.createdAt : now,
        updatedBy: boardObject.updatedBy || user?.uid || 'system',
        updatedAt: typeof boardObject.updatedAt === 'number' ? boardObject.updatedAt : now,
        version: typeof boardObject.version === 'number' ? boardObject.version : 1,
      }
    },
    [boardId, user],
  )
  const writeBoardObject = useCallback(
    async (boardObject: BoardObject) => {
      if (!db || !user || !hasLiveBoardAccess) {
        return
      }

      const normalized = normalizeBoardObjectForWrite(boardObject)
      await setDoc(doc(db, 'boards', boardId, 'objects', normalized.id), normalized)
    },
    [boardId, hasLiveBoardAccess, normalizeBoardObjectForWrite, user],
  )
  const writeBoardObjectPatch = useCallback(
    async (objectId: string, patch: Partial<BoardObject>, currentVersion: number) => {
      if (!db || !user || !hasLiveBoardAccess) {
        return
      }

      await setDoc(
        doc(db, 'boards', boardId, 'objects', objectId),
        {
          ...patch,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          version: currentVersion + 1,
        },
        { merge: true },
      )
    },
    [boardId, hasLiveBoardAccess, user],
  )
  const deleteBoardObjectById = useCallback(
    async (objectId: string) => {
      if (!db || !hasLiveBoardAccess) {
        return
      }

      await deleteDoc(doc(db, 'boards', boardId, 'objects', objectId))
    },
    [boardId, hasLiveBoardAccess],
  )
  const startInlineEdit = useCallback((boardObject: BoardObject, field: InlineEditorDraft['field']) => {
    if (
      field === 'text' &&
      boardObject.type !== 'stickyNote' &&
      boardObject.type !== 'shape' &&
      boardObject.type !== 'text'
    ) {
      return
    }
    if (field === 'title' && boardObject.type !== 'frame') {
      return
    }

    setSelectedIds([boardObject.id])
    setInlineEditor({
      objectId: boardObject.id,
      field,
      value:
        field === 'text' &&
        (boardObject.type === 'stickyNote' || boardObject.type === 'shape' || boardObject.type === 'text')
          ? boardObject.text || ''
          : boardObject.type === 'frame'
            ? boardObject.title || 'Frame'
            : '',
    })
  }, [])
  const cancelInlineEdit = useCallback(() => {
    setInlineEditor(null)
  }, [])
  const setLocalRotation = useCallback((objectId: string, rotation: number) => {
    setLocalObjectRotations((prev) => {
      const next = {
        ...prev,
        [objectId]: rotation,
      }
      localObjectRotationsRef.current = next
      return next
    })
  }, [])
  const clearLocalRotation = useCallback((objectId: string) => {
    setLocalObjectRotations((prev) => {
      if (!(objectId in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[objectId]
      localObjectRotationsRef.current = next
      return next
    })
  }, [])

  const createObject = useCallback(
    async (
      objectType: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text',
      options?: {
        shapeType?: ShapeKind
        connectorStyle?: ConnectorStyle
        connectorStart?: Point
        connectorEnd?: Point
        fromObjectId?: string | null
        toObjectId?: string | null
        fromAnchor?: AnchorKind | null
        toAnchor?: AnchorKind | null
        title?: string
        text?: string
        color?: string
        fontSize?: number
        position?: Point
        skipSelection?: boolean
      },
    ): Promise<BoardObject | null> => {
      if (!db || !user || !hasLiveBoardAccess || !canEditBoard) {
        return null
      }

      const id = crypto.randomUUID()
      const now = Date.now()
      const currentZIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )

      const centerPosition =
        options?.position || {
          x: (-viewport.x + stageSize.width / 2) / viewport.scale,
          y: (-viewport.y + stageSize.height / 2) / viewport.scale,
        }

      const shapeType = normalizeShapeKind(options?.shapeType)
      const connectorStyle = normalizeConnectorStyle(options?.connectorStyle)
      const connectorStart = isFinitePoint(options?.connectorStart)
        ? options.connectorStart
        : {
            x: centerPosition.x - 80,
            y: centerPosition.y,
          }
      const connectorEnd = isFinitePoint(options?.connectorEnd)
        ? options.connectorEnd
        : {
            x: centerPosition.x + 120,
            y: centerPosition.y + 40,
          }
      const connectorBounds = toConnectorBounds(connectorStart, connectorEnd)
      const connectorFromObjectId =
        typeof options?.fromObjectId === 'string' && options.fromObjectId.trim().length > 0
          ? options.fromObjectId.trim()
          : null
      const connectorToObjectId =
        typeof options?.toObjectId === 'string' && options.toObjectId.trim().length > 0
          ? options.toObjectId.trim()
          : null
      const connectorFromAnchor = normalizeAnchorKind(options?.fromAnchor)
      const connectorToAnchor = normalizeAnchorKind(options?.toAnchor)
      const size =
        objectType === 'shape' || objectType === 'stickyNote'
          ? DEFAULT_SHAPE_SIZES[shapeType]
          : objectType === 'frame'
            ? DEFAULT_FRAME_SIZE
          : objectType === 'text'
            ? DEFAULT_TEXT_SIZE
          : objectType === 'connector'
            ? connectorBounds.size
            : DEFAULT_SHAPE_SIZES.rectangle
      const position = objectType === 'connector' ? connectorBounds.position : centerPosition

      const base = {
        id,
        boardId,
        position,
        size: { ...size },
        rotation: 0,
        zIndex: currentZIndex + 1,
        createdBy: user.uid,
        createdAt: now,
        updatedBy: user.uid,
        updatedAt: now,
        version: 1,
      }

      const nextObject: BoardObject =
        objectType === 'stickyNote'
          ? {
              ...base,
              type: 'stickyNote',
              shapeType,
              color:
                options?.color && STICKY_COLOR_OPTIONS.includes(options.color)
                  ? options.color
                  : STICKY_COLOR_OPTIONS[0],
              text: options?.text?.trim() || 'New sticky note',
            }
          : objectType === 'shape'
            ? {
                ...base,
                type: 'shape',
                shapeType,
                color:
                  options?.color && SHAPE_COLOR_OPTIONS.includes(options.color)
                    ? options.color
                    : SHAPE_COLOR_OPTIONS[0],
                text: options?.text?.trim() || 'New shape',
              }
            : objectType === 'frame'
              ? {
                  ...base,
                  type: 'frame',
                  color: FRAME_COLOR_OPTIONS[0],
                  title: options?.title || 'New Frame',
                }
            : objectType === 'text'
              ? {
                  ...base,
                  type: 'text',
                  color:
                    options?.color && TEXT_COLOR_OPTIONS.includes(options.color)
                      ? options.color
                      : TEXT_COLOR_OPTIONS[0],
                  text: options?.text?.trim() || 'New text',
                  fontSize:
                    typeof options?.fontSize === 'number'
                      ? clamp(options.fontSize, 12, 72)
                      : 24,
                }
            : {
                ...base,
                type: 'connector',
                color:
                  options?.color && CONNECTOR_COLOR_OPTIONS.includes(options.color)
                    ? options.color
                    : CONNECTOR_COLOR_OPTIONS[0],
                style: connectorStyle,
                start: connectorStart,
                end: connectorEnd,
                fromObjectId: connectorFromObjectId,
                toObjectId: connectorToObjectId,
                fromAnchor: connectorFromAnchor,
                toAnchor: connectorToAnchor,
              }

      if (objectType === 'stickyNote') {
        pendingStickyDropIdsRef.current.add(id)
      }

      await writeBoardObject(nextObject)
      pushHistory({ type: 'create', object: nextObject })
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `created ${nextObject.type}`,
        targetId: nextObject.id,
        targetType: nextObject.type,
      })
      if (!options?.skipSelection) {
        setSelectedIds([id])
      }
      touchBoard()
      return nextObject
    },
    [
      boardId,
      canEditBoard,
      hasLiveBoardAccess,
      logActivity,
      pushHistory,
      stageSize.height,
      stageSize.width,
      user,
      viewport.scale,
      viewport.x,
      viewport.y,
      touchBoard,
      writeBoardObject,
    ],
  )
  const toggleCreatePopover = useCallback((popoverKey: CreatePopoverKey) => {
    if (!canEditBoard) {
      return
    }
    setActiveCreatePopover((prev) => (prev === popoverKey ? null : popoverKey))
  }, [canEditBoard])
  const createShapeFromPopover = useCallback(async () => {
    await createObject('shape', {
      shapeType: shapeCreateDraft.shapeType,
      color: shapeCreateDraft.color,
      text: shapeCreateDraft.text,
    })
    setActiveCreatePopover(null)
  }, [createObject, shapeCreateDraft.color, shapeCreateDraft.shapeType, shapeCreateDraft.text])
  const createConnectorFromPopover = useCallback(async () => {
    await createObject('connector', {
      connectorStyle: connectorCreateDraft.style,
      color: connectorCreateDraft.color,
    })
    setActiveCreatePopover(null)
  }, [connectorCreateDraft.color, connectorCreateDraft.style, createObject])
  const createTextFromPopover = useCallback(async () => {
    await createObject('text', {
      text: textCreateDraft.text,
      color: textCreateDraft.color,
      fontSize: textCreateDraft.fontSize,
    })
    setTextCreateDraft((prev) => ({ ...prev, text: '' }))
    setActiveCreatePopover(null)
  }, [createObject, textCreateDraft.color, textCreateDraft.fontSize, textCreateDraft.text])
  const applyTemplate = useCallback(
    async (templateKey: TemplateKey) => {
      if (!canEditBoard) {
        return
      }

      const worldCenter = {
        x: (-viewport.x + stageSize.width / 2) / viewport.scale,
        y: (-viewport.y + stageSize.height / 2) / viewport.scale,
      }

      const addSticky = async (args: { text: string; x: number; y: number; color?: string }) => {
        await createObject('stickyNote', {
          text: args.text,
          color: args.color || STICKY_COLOR_OPTIONS[0],
          position: { x: args.x, y: args.y },
          skipSelection: true,
        })
      }
      const addFrame = async (args: { title: string; x: number; y: number; color?: string }) => {
        await createObject('frame', {
          title: args.title,
          color: args.color || FRAME_COLOR_OPTIONS[0],
          position: { x: args.x, y: args.y },
          skipSelection: true,
        })
      }
      const addShape = async (args: {
        text: string
        x: number
        y: number
        shapeType?: ShapeKind
        color?: string
      }) => {
        return createObject('shape', {
          text: args.text,
          shapeType: args.shapeType || 'rectangle',
          color: args.color || SHAPE_COLOR_OPTIONS[0],
          position: { x: args.x, y: args.y },
          skipSelection: true,
        })
      }
      const addConnector = async (args: {
        x: number
        y: number
        style?: ConnectorStyle
        color?: string
        connectorStart?: Point
        connectorEnd?: Point
        fromObjectId?: string | null
        toObjectId?: string | null
        fromAnchor?: AnchorKind | null
        toAnchor?: AnchorKind | null
      }) => {
        return createObject('connector', {
          connectorStyle: args.style || 'line',
          color: args.color || CONNECTOR_COLOR_OPTIONS[0],
          position: { x: args.x, y: args.y },
          connectorStart: args.connectorStart,
          connectorEnd: args.connectorEnd,
          fromObjectId: args.fromObjectId,
          toObjectId: args.toObjectId,
          fromAnchor: args.fromAnchor,
          toAnchor: args.toAnchor,
          skipSelection: true,
        })
      }

      if (templateKey === 'retro') {
        const columns = [
          { title: 'What Went Well', x: worldCenter.x - 620, color: FRAME_COLOR_OPTIONS[2] },
          { title: "What Didn't Go Well", x: worldCenter.x, color: FRAME_COLOR_OPTIONS[3] },
          { title: 'Action Items', x: worldCenter.x + 620, color: FRAME_COLOR_OPTIONS[1] },
        ]

        for (const column of columns) {
          await addFrame({
            title: column.title,
            x: column.x,
            y: worldCenter.y - 140,
            color: column.color,
          })
          await addSticky({
            text: `Add notes for ${column.title.toLowerCase()}`,
            x: column.x,
            y: worldCenter.y + 36,
            color: STICKY_COLOR_OPTIONS[0],
          })
        }
      } else if (templateKey === 'mindmap') {
        const centralTopic = await addShape({
          text: 'Central Topic',
          shapeType: 'circle',
          color: SHAPE_COLOR_OPTIONS[1],
          x: worldCenter.x,
          y: worldCenter.y,
        })
        if (!centralTopic || centralTopic.type !== 'shape') {
          return
        }

        const branches = [
          { text: 'Branch 1', x: worldCenter.x - 340, y: worldCenter.y - 220, color: SHAPE_COLOR_OPTIONS[2] },
          { text: 'Branch 2', x: worldCenter.x + 340, y: worldCenter.y - 220, color: SHAPE_COLOR_OPTIONS[3] },
          { text: 'Branch 3', x: worldCenter.x - 340, y: worldCenter.y + 220, color: SHAPE_COLOR_OPTIONS[4] },
          { text: 'Branch 4', x: worldCenter.x + 340, y: worldCenter.y + 220, color: SHAPE_COLOR_OPTIONS[0] },
        ]

        for (const branch of branches) {
          const branchShape = await addShape({
            text: branch.text,
            shapeType: 'rectangle',
            color: branch.color,
            x: branch.x,
            y: branch.y,
          })
          if (!branchShape || branchShape.type !== 'shape') {
            continue
          }

          const dx = branchShape.position.x - centralTopic.position.x
          const dy = branchShape.position.y - centralTopic.position.y
          const fromAnchor: AnchorKind =
            Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
          const toAnchor: AnchorKind =
            Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom'
          const connectorStart = getAnchorPointForObject(centralTopic, fromAnchor)
          const connectorEnd = getAnchorPointForObject(branchShape, toAnchor)
          if (!connectorStart || !connectorEnd) {
            continue
          }
          await addConnector({
            x: (worldCenter.x + branch.x) / 2,
            y: (worldCenter.y + branch.y) / 2,
            style: 'line',
            color: CONNECTOR_COLOR_OPTIONS[0],
            connectorStart,
            connectorEnd,
            fromObjectId: centralTopic.id,
            toObjectId: branchShape.id,
            fromAnchor,
            toAnchor,
          })
        }
      } else if (templateKey === 'kanban') {
        const columns = [
          { title: 'To Do', x: worldCenter.x - 620, color: FRAME_COLOR_OPTIONS[0] },
          { title: 'Doing', x: worldCenter.x, color: FRAME_COLOR_OPTIONS[4] },
          { title: 'Done', x: worldCenter.x + 620, color: FRAME_COLOR_OPTIONS[2] },
        ]

        for (const column of columns) {
          await addFrame({
            title: column.title,
            x: column.x,
            y: worldCenter.y - 160,
            color: column.color,
          })
        }

        await addSticky({
          text: 'Task 1',
          x: worldCenter.x - 620,
          y: worldCenter.y + 24,
          color: STICKY_COLOR_OPTIONS[0],
        })
        await addSticky({
          text: 'Task 2',
          x: worldCenter.x,
          y: worldCenter.y + 24,
          color: STICKY_COLOR_OPTIONS[1],
        })
        await addSticky({
          text: 'Task 3',
          x: worldCenter.x + 620,
          y: worldCenter.y + 24,
          color: STICKY_COLOR_OPTIONS[4],
        })
      }

      setSelectionMode('select')
      setShowTemplateChooser(false)
      setSelectedIds([])
    },
    [canEditBoard, createObject, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y],
  )

  useEffect(() => {
    if (!activeCreatePopover) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return
      }

      if (createPopoverContainerRef.current?.contains(event.target)) {
        return
      }
      setActiveCreatePopover(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [activeCreatePopover])

  const patchObject = useCallback(
    async (
      objectId: string,
      patch: Partial<BoardObject>,
      options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
    ) => {
      if (!db || !user || !hasLiveBoardAccess || !canEditBoard) {
        return
      }

      const currentObject = objectsRef.current.find((boardObject) => boardObject.id === objectId)
      if (!currentObject) {
        return
      }

      const before: Partial<BoardObject> = {}
      ;(Object.keys(patch) as Array<keyof BoardObject>).forEach((key) => {
        ;(before as Partial<BoardObject>)[key] = currentObject[key] as never
      })

      const shouldRecordHistory = options?.recordHistory !== false && !isApplyingHistoryRef.current
      if (shouldRecordHistory) {
        pushHistory({
          type: 'patch',
          objectId,
          before,
          after: patch,
        })
      }

      await writeBoardObjectPatch(objectId, patch, currentObject.version)

      const shouldLogEvent = options?.logEvent !== false
      if (shouldLogEvent) {
        void logActivity({
          actorId: user.uid,
          actorName: user.displayName || user.email || 'Anonymous',
          action: options?.actionLabel || `updated ${currentObject.type}`,
          targetId: currentObject.id,
          targetType: currentObject.type,
        })
      }
      touchBoard()
    },
    [canEditBoard, hasLiveBoardAccess, logActivity, pushHistory, touchBoard, user, writeBoardObjectPatch],
  )
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = rotationOverlayDragRef.current
      if (!dragState) {
        return
      }

      event.preventDefault()
      const nextRotation = calculateRotationAngle(
        dragState.centerX,
        dragState.centerY,
        event.clientX,
        event.clientY,
      )
      dragState.latestRotation = nextRotation
      setLocalRotation(dragState.objectId, nextRotation)
    }

    const handleMouseUp = () => {
      const dragState = rotationOverlayDragRef.current
      if (!dragState) {
        return
      }

      rotationOverlayDragRef.current = null
      setRotatingObjectId(null)
      void patchObject(
        dragState.objectId,
        { rotation: dragState.latestRotation },
        { actionLabel: `rotated ${dragState.objectType}` },
      )
      clearLocalRotation(dragState.objectId)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [clearLocalRotation, patchObject, setLocalRotation])
  useEffect(() => {
    if (canEditBoard) {
      return
    }

    const dragState = rotationOverlayDragRef.current
    if (!dragState) {
      return
    }

    rotationOverlayDragRef.current = null
    clearLocalRotation(dragState.objectId)
    setRotatingObjectId(null)
  }, [canEditBoard, clearLocalRotation])
  const commitInlineEdit = useCallback(async () => {
    if (!canEditBoard) {
      setInlineEditor(null)
      return
    }
    if (!inlineEditor) {
      return
    }

    const boardObject = objectsRef.current.find((candidate) => candidate.id === inlineEditor.objectId)
    if (!boardObject) {
      setInlineEditor(null)
      return
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'stickyNote') {
      const nextText = inlineEditor.value
      if (nextText !== boardObject.text) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'shape') {
      const nextText = inlineEditor.value
      if (nextText !== (boardObject.text || '')) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'text') {
      const nextText = inlineEditor.value
      if (nextText !== boardObject.text) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'title' && boardObject.type === 'frame') {
      const nextTitle = inlineEditor.value.trim() || 'Frame'
      if (nextTitle !== boardObject.title) {
        await patchObject(boardObject.id, { title: nextTitle })
      }
    }

    setInlineEditor(null)
  }, [canEditBoard, inlineEditor, patchObject])

  useEffect(() => {
    if (!inlineEditor) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const editor = inlineEditor.field === 'text' ? inlineTextAreaRef.current : inlineInputRef.current
      if (!editor) {
        return
      }

      editor.focus()
      editor.setSelectionRange(editor.value.length, editor.value.length)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [inlineEditor])

  useEffect(() => {
    if (!inlineEditor || !inlineEditorTarget) {
      return
    }

    if (
      (inlineEditor.field === 'text' &&
        inlineEditorTarget.type !== 'stickyNote' &&
        inlineEditorTarget.type !== 'shape' &&
        inlineEditorTarget.type !== 'text') ||
      (inlineEditor.field === 'title' && inlineEditorTarget.type !== 'frame')
    ) {
      setInlineEditor(null)
      return
    }
  }, [inlineEditor, inlineEditorTarget])

  const deleteSelected = useCallback(async () => {
    if (!db || !user || !hasLiveBoardAccess || !canEditBoard || selectedObjects.length === 0) {
      return
    }

    const objectsToDelete = [...selectedObjects]
    const objectIdsToDelete = new Set(objectsToDelete.map((boardObject) => boardObject.id))

    if (!isApplyingHistoryRef.current) {
      objectsToDelete.forEach((boardObject) => {
        pushHistory({ type: 'delete', object: boardObject })
      })
    }

    await Promise.all(
      objectsToDelete.map((boardObject) => deleteBoardObjectById(boardObject.id)),
    )

    setInlineEditor((prev) => (prev && objectIdsToDelete.has(prev.objectId) ? null : prev))
    void logActivity({
      actorId: user.uid,
      actorName: user.displayName || user.email || 'Anonymous',
      action: `deleted ${objectsToDelete.length} object${objectsToDelete.length === 1 ? '' : 's'}`,
      targetId: objectsToDelete[0]?.id || null,
      targetType: objectsToDelete[0]?.type || null,
    })
    setLocalObjectPositions((prev) => {
      const next = { ...prev }
      objectIdsToDelete.forEach((objectId) => {
        delete next[objectId]
      })
      return next
    })
    setLocalConnectorGeometry((prev) => {
      const next = { ...prev }
      objectIdsToDelete.forEach((objectId) => {
        delete next[objectId]
      })
      return next
    })
    setLocalObjectSizes((prev) => {
      const next = { ...prev }
      objectIdsToDelete.forEach((objectId) => {
        delete next[objectId]
      })
      return next
    })
    setSelectedIds([])
    touchBoard()
  }, [canEditBoard, deleteBoardObjectById, hasLiveBoardAccess, logActivity, pushHistory, selectedObjects, touchBoard, user])

  const duplicateObject = useCallback(
    async (source: BoardObject, options?: { selectAfter?: boolean }) => {
      if (!db || !user || !hasLiveBoardAccess || !canEditBoard) {
        return null
      }

      const id = crypto.randomUUID()
      const now = Date.now()
      const zIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )

      const duplicate: BoardObject =
        source.type === 'connector'
          ? {
              ...source,
              id,
              start: {
                x: source.start.x + 24,
                y: source.start.y + 24,
              },
              end: {
                x: source.end.x + 24,
                y: source.end.y + 24,
              },
              ...toConnectorBounds(
                {
                  x: source.start.x + 24,
                  y: source.start.y + 24,
                },
                {
                  x: source.end.x + 24,
                  y: source.end.y + 24,
                },
              ),
              fromObjectId: null,
              toObjectId: null,
              fromAnchor: null,
              toAnchor: null,
              comments: undefined,
              votesByUser: undefined,
              zIndex: zIndex + 1,
              createdBy: user.uid,
              updatedBy: user.uid,
              createdAt: now,
              updatedAt: now,
              version: 1,
            }
          : {
              ...source,
              frameId: null,
              id,
              position: {
                x: source.position.x + 24,
                y: source.position.y + 24,
              },
              comments: undefined,
              votesByUser: undefined,
              zIndex: zIndex + 1,
              createdBy: user.uid,
              updatedBy: user.uid,
              createdAt: now,
              updatedAt: now,
              version: 1,
      }

      await writeBoardObject(duplicate)
      if (!isApplyingHistoryRef.current) {
        pushHistory({ type: 'create', object: duplicate })
      }
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `duplicated ${source.type}`,
        targetId: duplicate.id,
        targetType: duplicate.type,
      })
      if (options?.selectAfter !== false) {
        setSelectedIds([id])
      }
      touchBoard()
      return duplicate
    },
    [canEditBoard, hasLiveBoardAccess, logActivity, pushHistory, touchBoard, user, writeBoardObject],
  )

  const duplicateSelected = useCallback(async () => {
    if (!canEditBoard || selectedObjects.length === 0) {
      return
    }

    const duplicatedIds: string[] = []
    for (const boardObject of selectedObjects) {
      const duplicated = await duplicateObject(boardObject, { selectAfter: false })
      if (duplicated) {
        duplicatedIds.push(duplicated.id)
      }
    }

    if (duplicatedIds.length > 0) {
      setSelectedIds(duplicatedIds)
    }
  }, [canEditBoard, duplicateObject, selectedObjects])

  const applyHistoryEntry = useCallback(
    async (entry: HistoryEntry, direction: 'undo' | 'redo') => {
      if (!user) {
        return
      }

      isApplyingHistoryRef.current = true
      try {
        if (entry.type === 'create') {
          if (direction === 'undo') {
            await deleteBoardObjectById(entry.object.id)
          } else {
            await writeBoardObject(entry.object)
          }
          setSelectedIds([entry.object.id])
        } else if (entry.type === 'delete') {
          if (direction === 'undo') {
            await writeBoardObject(entry.object)
          } else {
            await deleteBoardObjectById(entry.object.id)
          }
          setSelectedIds([entry.object.id])
        } else if (entry.type === 'patch') {
          await patchObject(entry.objectId, direction === 'undo' ? entry.before : entry.after, {
            recordHistory: false,
            logEvent: false,
          })
          setSelectedIds([entry.objectId])
        }
      } finally {
        isApplyingHistoryRef.current = false
      }
    },
    [deleteBoardObjectById, patchObject, user, writeBoardObject],
  )

  const undo = useCallback(async () => {
    if (!canEditBoard) {
      return
    }
    const entry = historyPastRef.current.at(-1)
    if (!entry) {
      return
    }

    historyPastRef.current = historyPastRef.current.slice(0, -1)
    historyFutureRef.current = [...historyFutureRef.current, entry]
    await applyHistoryEntry(entry, 'undo')
  }, [applyHistoryEntry, canEditBoard])

  const redo = useCallback(async () => {
    if (!canEditBoard) {
      return
    }
    const entry = historyFutureRef.current.at(-1)
    if (!entry) {
      return
    }

    historyFutureRef.current = historyFutureRef.current.slice(0, -1)
    historyPastRef.current = [...historyPastRef.current, entry]
    await applyHistoryEntry(entry, 'redo')
  }, [applyHistoryEntry, canEditBoard])

  const applyViewportScaleFromCenter = useCallback(
    (nextScale: number) => {
      const baseViewport = zoomMomentumTargetRef.current || viewport
      const clampedScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE)
      const center = {
        x: stageSize.width / 2,
        y: stageSize.height / 2,
      }
      const worldX = (center.x - baseViewport.x) / baseViewport.scale
      const worldY = (center.y - baseViewport.y) / baseViewport.scale

      queueZoomMomentum({
        scale: clampedScale,
        x: center.x - worldX * clampedScale,
        y: center.y - worldY * clampedScale,
      })
    },
    [queueZoomMomentum, stageSize.height, stageSize.width, viewport],
  )
  useEffect(() => {
    if (!selectionBox?.active) {
      if (selectionScanAnimationRef.current) {
        selectionScanAnimationRef.current.stop()
        selectionScanAnimationRef.current = null
      }

      const selectionRect = selectionScanRectRef.current
      if (selectionRect) {
        selectionRect.dashOffset(0)
        selectionRect.fill('rgba(29, 78, 216, 0.1)')
        selectionRect.getLayer()?.batchDraw()
      }
      return
    }

    const selectionLayer = selectionScanLayerRef.current
    const selectionRect = selectionScanRectRef.current
    if (!selectionLayer || !selectionRect || selectionScanAnimationRef.current) {
      return
    }

    const animation = new Konva.Animation((frame) => {
      if (!frame) {
        return
      }

      selectionRect.dashOffset(-((frame.time / 18) % 30))
      const pulseOpacity = 0.09 + 0.04 * Math.sin(frame.time / 180)
      selectionRect.fill(`rgba(29, 78, 216, ${pulseOpacity.toFixed(3)})`)
    }, selectionLayer)

    selectionScanAnimationRef.current = animation
    animation.start()

    return () => {
      if (selectionScanAnimationRef.current === animation) {
        animation.stop()
        selectionScanAnimationRef.current = null
      }
    }
  }, [selectionBox?.active])

  const zoomIn = useCallback(() => {
    const baseScale = (zoomMomentumTargetRef.current || viewport).scale
    applyViewportScaleFromCenter(baseScale * 1.25)
  }, [applyViewportScaleFromCenter, viewport])

  const zoomOut = useCallback(() => {
    const baseScale = (zoomMomentumTargetRef.current || viewport).scale
    applyViewportScaleFromCenter(baseScale / 1.25)
  }, [applyViewportScaleFromCenter, viewport])

  const zoomReset = useCallback(() => {
    applyViewportScaleFromCenter(1)
  }, [applyViewportScaleFromCenter])

  const zoomToFit = useCallback(() => {
    if (objects.length === 0) {
      zoomReset()
      return
    }

    const padding = 48
    const bounds = objects.map((boardObject) => getObjectBounds(boardObject, objectsById))
    const minX = Math.min(...bounds.map((item) => item.x)) - padding
    const minY = Math.min(...bounds.map((item) => item.y)) - padding
    const maxX = Math.max(...bounds.map((item) => item.x + item.width)) + padding
    const maxY = Math.max(...bounds.map((item) => item.y + item.height)) + padding
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)

    const fitScale = clamp(
      Math.min(stageSize.width / width, stageSize.height / height),
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
    )

    queueZoomMomentum({
      scale: fitScale,
      x: stageSize.width / 2 - (minX + width / 2) * fitScale,
      y: stageSize.height / 2 - (minY + height / 2) * fitScale,
    })
  }, [objects, objectsById, queueZoomMomentum, stageSize.height, stageSize.width, zoomReset])
  const rotateSelectionBy = useCallback(
    async (deltaDegrees: number) => {
      const rotatableObjects = selectedObjects.filter((candidate) => candidate.type !== 'connector')
      if (rotatableObjects.length === 0) {
        return
      }

      for (let index = 0; index < rotatableObjects.length; index += 1) {
        const boardObject = rotatableObjects[index]
        const nextRotation = normalizeRotationDegrees((boardObject.rotation || 0) + deltaDegrees)
        await patchObject(
          boardObject.id,
          { rotation: nextRotation },
          index === 0
            ? { actionLabel: `rotated ${rotatableObjects.length === 1 ? boardObject.type : 'selection'}` }
            : { recordHistory: false, logEvent: false },
        )
      }
    },
    [patchObject, selectedObjects],
  )
  const closeCommandPalette = useCallback(() => {
    setShowCommandPalette(false)
    setCommandPaletteQuery('')
    setCommandPaletteActiveIndex(0)
  }, [])
  const openCommandPalette = useCallback(() => {
    setActiveCreatePopover(null)
    setShowCommandPalette(true)
    setCommandPaletteQuery('')
    setCommandPaletteActiveIndex(0)
  }, [])
  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])
  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(
    () => [
      {
        id: 'create-sticky',
        label: 'Create sticky note',
        description: 'Add a sticky note at the center of the current view',
        keywords: ['sticky', 'note', 'create', 'add'],
        shortcut: 'S',
        run: () => createObject('stickyNote'),
      },
      {
        id: 'open-shape-popover',
        label: 'Open shape creator',
        description: 'Open shape options for type, color, and text',
        keywords: ['shape', 'rectangle', 'circle', 'diamond', 'triangle'],
        run: () => setActiveCreatePopover('shape'),
      },
      {
        id: 'open-connector-popover',
        label: 'Open connector creator',
        description: 'Open connector options for arrow or line style',
        keywords: ['connector', 'arrow', 'line'],
        run: () => setActiveCreatePopover('connector'),
      },
      {
        id: 'open-text-popover',
        label: 'Open text creator',
        description: 'Create standalone text with color and size options',
        keywords: ['text', 'type', 'title', 'label'],
        run: () => setActiveCreatePopover('text'),
      },
      {
        id: 'zoom-to-fit',
        label: 'Zoom to fit board',
        description: 'Fit all board objects into the viewport',
        keywords: ['zoom', 'fit', 'viewport', 'center'],
        shortcut: 'Cmd/Ctrl+Shift+F',
        run: () => zoomToFit(),
      },
      {
        id: 'open-boards',
        label: 'Open boards panel',
        description: 'Open board switcher, share, and create controls',
        keywords: ['board', 'boards', 'switch', 'share'],
        run: () => setShowBoardsPanel(true),
      },
      {
        id: 'open-template-chooser',
        label: 'Open template chooser',
        description: 'Insert retro, mindmap, or kanban starter layouts',
        keywords: ['template', 'retro', 'mindmap', 'kanban', 'layout'],
        run: () => {
          if (!canEditBoard) {
            return
          }
          setShowTemplateChooser(true)
        },
      },
      {
        id: 'toggle-dark-mode',
        label: themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        description: 'Toggle board chrome theme between light and dark',
        keywords: ['theme', 'dark', 'light', 'appearance'],
        run: () => toggleThemeMode(),
      },
      {
        id: 'duplicate-current-board',
        label: 'Duplicate current board',
        description: 'Create a private copy of the current board and open it',
        keywords: ['board', 'duplicate', 'copy'],
        run: () => duplicateBoardMeta(boardId),
      },
      {
        id: 'toggle-view-edit-mode',
        label: canEditBoard ? 'Switch to view mode' : 'Switch to edit mode',
        description: canEditBoard
          ? 'Lock object editing to prevent accidental changes'
          : 'Enable object creation and editing actions',
        keywords: ['view', 'edit', 'lock', 'mode', 'permissions'],
        run: () => {
          if (!roleCanEditBoard) {
            setInteractionMode('view')
            return
          }
          setInteractionMode((prev) => (prev === 'edit' ? 'view' : 'edit'))
        },
      },
      {
        id: 'toggle-selection-mode',
        label: selectionMode === 'select' ? 'Switch to box select mode' : 'Switch to pointer mode',
        description: 'Toggle between pointer and drag-to-select interaction modes',
        keywords: ['selection', 'pointer', 'area', 'box', 'mode'],
        run: () => setSelectionMode((prev) => (prev === 'select' ? 'area' : 'select')),
      },
      {
        id: 'toggle-shortcuts',
        label: 'Toggle keyboard shortcuts',
        description: 'Open or close the keyboard shortcuts reference',
        keywords: ['keyboard', 'shortcuts', 'help'],
        shortcut: '?',
        run: () => setShowShortcuts((prev) => !prev),
      },
    ],
    [
      boardId,
      canEditBoard,
      createObject,
      duplicateBoardMeta,
      roleCanEditBoard,
      selectionMode,
      themeMode,
      toggleThemeMode,
      zoomToFit,
    ],
  )
  const filteredCommandPaletteCommands = useMemo(() => {
    const normalizedQuery = commandPaletteQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return commandPaletteCommands
    }
    const terms = normalizedQuery.split(/\s+/).filter(Boolean)
    return commandPaletteCommands.filter((command) => {
      const haystack = `${command.label} ${command.description} ${command.keywords.join(' ')}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [commandPaletteCommands, commandPaletteQuery])
  const runCommandPaletteEntry = useCallback(
    (entry: CommandPaletteCommand) => {
      closeCommandPalette()
      void Promise.resolve(entry.run()).catch((error) => {
        console.error('Command palette action failed', error)
      })
    },
    [closeCommandPalette],
  )

  useEffect(() => {
    if (!showCommandPalette) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      commandPaletteInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showCommandPalette])

  useEffect(() => {
    setCommandPaletteActiveIndex((previous) => {
      if (filteredCommandPaletteCommands.length === 0) {
        return 0
      }
      return Math.min(previous, filteredCommandPaletteCommands.length - 1)
    })
  }, [filteredCommandPaletteCommands.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const isMetaCombo = event.metaKey || event.ctrlKey
      const keyLower = event.key.toLowerCase()

      if (!isMetaCombo && !event.altKey && !event.shiftKey && event.key === '/') {
        event.preventDefault()
        openCommandPalette()
        return
      }

      if (!isMetaCombo && event.shiftKey && keyLower === 'e') {
        event.preventDefault()
        if (!roleCanEditBoard) {
          setInteractionMode('view')
          return
        }
        setInteractionMode((prev) => (prev === 'edit' ? 'view' : 'edit'))
        return
      }

      if (event.key === 'Escape' && showCommandPalette) {
        event.preventDefault()
        closeCommandPalette()
        return
      }

      if (event.key === 'Escape' && showTemplateChooser) {
        event.preventDefault()
        setShowTemplateChooser(false)
        return
      }

      if (showCommandPalette) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          if (filteredCommandPaletteCommands.length > 0) {
            setCommandPaletteActiveIndex((previous) =>
              (previous + 1) % filteredCommandPaletteCommands.length,
            )
          }
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          if (filteredCommandPaletteCommands.length > 0) {
            setCommandPaletteActiveIndex((previous) =>
              (previous - 1 + filteredCommandPaletteCommands.length) % filteredCommandPaletteCommands.length,
            )
          }
          return
        }
        if (event.key === 'Enter') {
          const activeEntry = filteredCommandPaletteCommands[commandPaletteActiveIndex]
          if (!activeEntry) {
            return
          }
          event.preventDefault()
          runCommandPaletteEntry(activeEntry)
          return
        }
      }

      if (event.key === 'Escape' && activeCreatePopover) {
        event.preventDefault()
        setActiveCreatePopover(null)
        return
      }

      if (event.key === 'Escape' && selectionMode === 'area') {
        event.preventDefault()
        setSelectionMode('select')
        return
      }

      if (event.key === 'Escape' && selectedIds.length > 0) {
        event.preventDefault()
        setSelectedIds([])
        return
      }

      if (isMetaCombo && keyLower === 'a') {
        event.preventDefault()
        setSelectedIds(objectsRef.current.map((boardObject) => boardObject.id))
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void deleteSelected()
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'd' && selectedIds.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void duplicateSelected()
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'c' && selectedObject) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        setClipboardObject(selectedObject)
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'v' && clipboardObject) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void duplicateObject(clipboardObject)
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'z') {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'y') {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void redo()
        return
      }

      if (keyLower === 'r' && selectedIds.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void rotateSelectionBy(event.shiftKey ? -ROTATION_STEP_DEGREES : ROTATION_STEP_DEGREES)
        return
      }

      const plusPressed = event.key === '+' || event.key === '='
      const minusPressed = event.key === '-' || event.key === '_'
      if (isMetaCombo && plusPressed) {
        event.preventDefault()
        zoomIn()
        return
      }

      if (isMetaCombo && minusPressed) {
        event.preventDefault()
        zoomOut()
        return
      }

      if (isMetaCombo && keyLower === '0') {
        event.preventDefault()
        zoomReset()
        return
      }

      if (isMetaCombo && event.shiftKey && keyLower === 'f') {
        event.preventDefault()
        zoomToFit()
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeCreatePopover,
    canEditBoard,
    clipboardObject,
    closeCommandPalette,
    commandPaletteActiveIndex,
    deleteSelected,
    duplicateObject,
    duplicateSelected,
    filteredCommandPaletteCommands,
    openCommandPalette,
    redo,
    runCommandPaletteEntry,
    roleCanEditBoard,
    selectedIds,
    selectedObject,
    selectionMode,
    showCommandPalette,
    showTemplateChooser,
    undo,
    rotateSelectionBy,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
  ])

  const getConnectorPublisher = useCallback(
    (objectId: string) => {
      if (!connectorPublishersRef.current[objectId]) {
        let lastDragPublishAt = 0
        connectorPublishersRef.current[objectId] = (patch: ConnectorPatch) => {
          const now = Date.now()
          if (now - lastDragPublishAt < 100) {
            return
          }

          lastDragPublishAt = now
          void patchObject(objectId, patch, { recordHistory: false, logEvent: false })
        }
      }

      return connectorPublishersRef.current[objectId]
    },
    [patchObject],
  )

  const resolveSnappedEndpoint = useCallback((point: Point) => {
    const thresholdSquared = CONNECTOR_SNAP_THRESHOLD_PX * CONNECTOR_SNAP_THRESHOLD_PX
    let nearest:
      | {
          point: Point
          objectId: string
          anchor: AnchorKind
          distanceSquared: number
        }
      | null = null

    for (const candidate of objectsRef.current) {
      const anchors = getObjectAnchors(candidate)
      for (const anchorCandidate of anchors) {
        const dx = point.x - anchorCandidate.point.x
        const dy = point.y - anchorCandidate.point.y
        const distanceSquared = dx * dx + dy * dy

        if (distanceSquared > thresholdSquared) {
          continue
        }

        if (!nearest || distanceSquared < nearest.distanceSquared) {
          nearest = {
            point: anchorCandidate.point,
            objectId: anchorCandidate.objectId,
            anchor: anchorCandidate.anchor,
            distanceSquared,
          }
        }
      }
    }

    if (!nearest) {
      return {
        point,
        objectId: null,
        anchor: null,
      }
    }

    const nearestAnchor = nearest
    return {
      point: nearestAnchor.point,
      objectId: nearestAnchor.objectId,
      anchor: nearestAnchor.anchor,
    }
  }, [])

  const updateBoardTimer = useCallback(
    async (nextTimer: TimerState) => {
      if (!timerRef.current) {
        return
      }

      await set(timerRef.current, nextTimer)
      setTimerState(nextTimer)
    },
    [setTimerState],
  )

  const startTimer = useCallback(async () => {
    const remaining = timerState.running && timerState.endsAt
      ? Math.max(0, timerState.endsAt - Date.now())
      : timerState.remainingMs
    const next = {
      running: true,
      remainingMs: remaining,
      endsAt: Date.now() + Math.max(1_000, remaining),
    } satisfies TimerState
    await updateBoardTimer(next)
  }, [timerState.endsAt, timerState.remainingMs, timerState.running, updateBoardTimer])

  const pauseTimer = useCallback(async () => {
    const remaining = timerState.running && timerState.endsAt
      ? Math.max(0, timerState.endsAt - Date.now())
      : timerState.remainingMs
    await updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: remaining,
    })
  }, [timerState.endsAt, timerState.remainingMs, timerState.running, updateBoardTimer])

  const resetTimer = useCallback(async () => {
    await updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: TIMER_DEFAULT_MS,
    })
  }, [updateBoardTimer])

  useEffect(() => {
    if (!timerState.running || effectiveTimerMs > 0) {
      return
    }

    void updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: 0,
    })
  }, [effectiveTimerMs, timerState.running, updateBoardTimer])

  const launchVoteConfetti = useCallback(
    (stickyObject: BoardObject) => {
      if (stickyObject.type !== 'stickyNote') {
        return
      }

      const position = resolveObjectPosition(stickyObject)
      const size = resolveObjectSize(stickyObject)
      const origin = {
        x: position.x + size.width - 16,
        y: position.y + 16,
      }
      const particles = Array.from({ length: VOTE_CONFETTI_PARTICLE_COUNT }, (_, index) => {
        const angle = Math.random() * Math.PI - Math.PI
        const speed = 2.4 + Math.random() * 3.4
        const sizeValue = 5 + Math.random() * 4
        return {
          id: `${stickyObject.id}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          size: sizeValue,
          color: VOTE_CONFETTI_COLORS[index % VOTE_CONFETTI_COLORS.length],
          rotation: Math.random() * 360,
          spin: (Math.random() - 0.5) * 18,
          life: 1,
        } satisfies VoteConfettiParticle
      })

      setVoteConfettiParticles((prev) => [...prev, ...particles].slice(-200))
    },
    [resolveObjectPosition, resolveObjectSize],
  )

  const toggleVoteOnObject = useCallback(
    (boardObject: BoardObject) => {
      if (!canEditBoard || !user) {
        return
      }

      const nextVotes = { ...(boardObject.votesByUser || {}) }
      if (nextVotes[user.uid]) {
        delete nextVotes[user.uid]
      } else {
        nextVotes[user.uid] = true
        launchVoteConfetti(boardObject)
      }

      void patchObject(
        boardObject.id,
        { votesByUser: nextVotes },
        { actionLabel: `voted on ${boardObject.type}` },
      )
    },
    [canEditBoard, launchVoteConfetti, patchObject, user],
  )

  const addComment = useCallback(async () => {
    if (!canEditBoard || !selectedObject || !user) {
      return
    }

    const trimmed = commentDraft.trim()
    if (!trimmed) {
      return
    }

    const comment: BoardComment = {
      id: crypto.randomUUID(),
      text: trimmed,
      createdBy: user.uid,
      createdByName: user.displayName || user.email || 'Anonymous',
      createdAt: Date.now(),
    }

    const nextComments = [...(selectedObject.comments || []), comment]
    await patchObject(
      selectedObject.id,
      { comments: nextComments },
      { actionLabel: `commented on ${selectedObject.type}` },
    )
    setCommentDraft('')
  }, [canEditBoard, commentDraft, patchObject, selectedObject, user])

  const ingestTextLinesAsStickies = useCallback(
    async (lines: string[]) => {
      if (!db || !user) {
        return
      }

      const now = Date.now()
      const baseZIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )
      const base = {
        x: (-viewport.x + stageSize.width / 2) / viewport.scale - 280,
        y: (-viewport.y + stageSize.height / 2) / viewport.scale - 180,
      }

      const stickies = lines.slice(0, 40).map((line, index) => {
        const id = crypto.randomUUID()
        const sticky: BoardObject = {
          id,
          boardId,
          type: 'stickyNote',
          shapeType: 'rectangle',
          position: {
            x: base.x + (index % 4) * 210,
            y: base.y + Math.floor(index / 4) * 130,
          },
          size: { width: 180, height: 110 },
          zIndex: baseZIndex + index + 1,
          text: line,
          color: STICKY_COLOR_OPTIONS[index % STICKY_COLOR_OPTIONS.length],
          createdBy: user.uid,
          createdAt: now + index,
          updatedBy: user.uid,
          updatedAt: now + index,
          version: 1,
        }
        return sticky
      })

      await Promise.all(stickies.map((sticky) => writeBoardObject(sticky)))
      stickies.forEach((sticky) => pushHistory({ type: 'create', object: sticky }))
      if (stickies[0]) {
        setSelectedIds([stickies[0].id])
      }
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `imported ${stickies.length} OCR stickies`,
        targetId: stickies[0]?.id || null,
        targetType: stickies[0]?.type || null,
      })
      touchBoard()
    },
    [
      boardId,
      logActivity,
      pushHistory,
      stageSize.height,
      stageSize.width,
      user,
      viewport.scale,
      viewport.x,
      viewport.y,
      touchBoard,
      writeBoardObject,
    ],
  )

  const replayTimeline = useCallback(async () => {
    if (isTimelineReplaying) {
      replayAbortRef.current = true
      return
    }

    const ordered = [...timelineEvents].sort((left, right) => left.createdAt - right.createdAt)
    if (ordered.length === 0) {
      return
    }

    stopZoomMomentum()
    replayAbortRef.current = false
    setIsTimelineReplaying(true)
    try {
      for (const event of ordered) {
        if (replayAbortRef.current) {
          break
        }

        setReplayingEventId(event.id)
        if (event.targetId) {
          setSelectedIds([event.targetId])
          const targetObject = objectsRef.current.find((candidate) => candidate.id === event.targetId)
          if (targetObject) {
            const bounds = getObjectBounds(targetObject, objectsById)
            const centerX = bounds.x + bounds.width / 2
            const centerY = bounds.y + bounds.height / 2
            setViewport((prev) => ({
              ...prev,
              x: stageSize.width / 2 - centerX * prev.scale,
              y: stageSize.height / 2 - centerY * prev.scale,
            }))
          }
        } else {
          setSelectedIds([])
        }

        await wait(420)
      }
    } finally {
      replayAbortRef.current = false
      setReplayingEventId(null)
      setIsTimelineReplaying(false)
    }
  }, [isTimelineReplaying, objectsById, stageSize.height, stageSize.width, stopZoomMomentum, timelineEvents])

  const exportBoard = useCallback(
    async (format: 'png' | 'pdf', scope: 'full' | 'selection') => {
      const stage = stageRef.current
      if (!stage) {
        return
      }

      const viewportBounds = {
        x: -viewport.x / viewport.scale,
        y: -viewport.y / viewport.scale,
        width: stageSize.width / viewport.scale,
        height: stageSize.height / viewport.scale,
      }

      let bounds: { x: number; y: number; width: number; height: number } | null = null
      if (scope === 'selection') {
        bounds = viewportBounds
      } else if (objects.length > 0) {
        const resolvedBounds = objects.map((boardObject) => getObjectBounds(boardObject, objectsById))
        const minX = Math.min(...resolvedBounds.map((item) => item.x))
        const minY = Math.min(...resolvedBounds.map((item) => item.y))
        const maxX = Math.max(...resolvedBounds.map((item) => item.x + item.width))
        const maxY = Math.max(...resolvedBounds.map((item) => item.y + item.height))
        bounds = {
          x: minX - 24,
          y: minY - 24,
          width: Math.max(64, maxX - minX + 48),
          height: Math.max(64, maxY - minY + 48),
        }
      } else {
        bounds = viewportBounds
      }

      const crop = bounds
        ? {
            x: bounds.x * viewport.scale + viewport.x,
            y: bounds.y * viewport.scale + viewport.y,
            width: Math.max(2, bounds.width * viewport.scale),
            height: Math.max(2, bounds.height * viewport.scale),
          }
        : {
            x: 0,
            y: 0,
            width: stageSize.width,
            height: stageSize.height,
          }
      const cropArea = Math.max(1, crop.width * crop.height)
      const cappedPixelRatio = Math.min(2, Math.sqrt(MAX_EXPORT_PIXEL_COUNT / cropArea))

      const dataUrl = stage.toDataURL({
        pixelRatio: cappedPixelRatio,
        ...crop,
      })
      const fileBase = scope === 'selection' ? 'board-selection' : 'board-full'

      if (format === 'png') {
        const anchor = document.createElement('a')
        anchor.href = dataUrl
        anchor.download = `${fileBase}.png`
        anchor.click()
        notifyExportComplete({ format: 'png', scope, fileBase })
        return
      }

      const pdfScale = Math.min(1, MAX_PDF_EDGE_PX / Math.max(crop.width, crop.height))
      const pdfWidth = Math.max(2, Math.round(crop.width * pdfScale))
      const pdfHeight = Math.max(2, Math.round(crop.height * pdfScale))

      try {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({
          orientation: pdfWidth >= pdfHeight ? 'landscape' : 'portrait',
          unit: 'px',
          format: [pdfWidth, pdfHeight],
        })
        pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight)
        pdf.save(`${fileBase}.pdf`)
        notifyExportComplete({ format: 'pdf', scope, fileBase })
      } catch (error) {
        console.error('PDF export failed', error)
      }
    },
    [objects, objectsById, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y],
  )

  const handleObjectSelection = useCallback(
    (boardObject: BoardObject, additive = false, inlineEditField: 'text' | 'title' | null = null) => {
      if (isVotingMode) {
        if (!canEditBoard) {
          return
        }
        toggleVoteOnObject(boardObject)
        return
      }

      if (
        inlineEditField &&
        canEditBoard &&
        !additive &&
        selectedIds.length === 1 &&
        selectedId === boardObject.id
      ) {
        startInlineEdit(boardObject, inlineEditField)
        return
      }

      selectObjectId(boardObject.id, additive)
    },
    [canEditBoard, isVotingMode, selectObjectId, selectedId, selectedIds.length, startInlineEdit, toggleVoteOnObject],
  )
  const applyColorToSelection = useCallback(
    async (color: string) => {
      if (!canEditBoard || selectedObjects.length === 0) {
        return
      }

      for (let index = 0; index < selectedObjects.length; index += 1) {
        const boardObject = selectedObjects[index]
        await patchObject(
          boardObject.id,
          { color },
          index === 0 ? undefined : { recordHistory: false, logEvent: false },
        )
      }
    },
    [canEditBoard, patchObject, selectedObjects],
  )
  const beginObjectDrag = useCallback(
    (boardObject: BoardObject, anchor: Point) => {
      liveDragPositionsRef.current[boardObject.id] = anchor
      setDraggingObjectId(boardObject.id)

      if (!selectedIdSet.has(boardObject.id) || selectedIds.length <= 1) {
        delete multiDragSnapshotRef.current[boardObject.id]
        return
      }

      const members = selectedIds
        .map((id) => objectsRef.current.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is BoardObject => Boolean(candidate))
        .filter((candidate) => candidate.type !== 'connector')
        .map((candidate) => ({
          id: candidate.id,
          start: resolveObjectPosition(candidate),
        }))

      if (members.length <= 1) {
        delete multiDragSnapshotRef.current[boardObject.id]
        return
      }

      multiDragSnapshotRef.current[boardObject.id] = {
        anchor,
        members,
      }
      members.forEach((member) => {
        liveDragPositionsRef.current[member.id] = member.start
      })
    },
    [resolveObjectPosition, selectedIdSet, selectedIds],
  )
  const moveObjectDrag = useCallback((boardObject: BoardObject, nextPos: Point) => {
    const snapshot = multiDragSnapshotRef.current[boardObject.id]
    if (!snapshot) {
      liveDragPositionsRef.current[boardObject.id] = nextPos
      return
    }

    const dx = nextPos.x - snapshot.anchor.x
    const dy = nextPos.y - snapshot.anchor.y
    snapshot.members.forEach((member) => {
      liveDragPositionsRef.current[member.id] = {
        x: member.start.x + dx,
        y: member.start.y + dy,
      }
    })
  }, [])
  const endObjectDrag = useCallback(
    async (boardObject: BoardObject, finalPos: Point, actionLabel: string) => {
      const snapshot = multiDragSnapshotRef.current[boardObject.id]
      delete multiDragSnapshotRef.current[boardObject.id]
      setDraggingObjectId(null)

      if (snapshot) {
        const dx = finalPos.x - snapshot.anchor.x
        const dy = finalPos.y - snapshot.anchor.y
        const nextLocal: Record<string, LocalPositionOverride> = {}
        for (let index = 0; index < snapshot.members.length; index += 1) {
          const member = snapshot.members[index]
          const memberObject = objectsRef.current.find((candidate) => candidate.id === member.id)
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

          await patchObject(
            member.id,
            {
              position: memberFinal,
              ...(
                memberObject && memberObject.type !== 'frame' && memberObject.type !== 'connector'
                  ? {
                      frameId: resolveContainingFrameId({
                        objectId: member.id,
                        position: memberFinal,
                        size: resolveObjectSize(memberObject),
                      }),
                    }
                  : {}
              ),
            },
            index === 0 ? { actionLabel } : { recordHistory: false, logEvent: false },
          )
        }

        setLocalObjectPositions((prev) => ({
          ...prev,
          ...nextLocal,
        }))
        return
      }

      delete liveDragPositionsRef.current[boardObject.id]
      setLocalObjectPositions((prev) => ({
        ...prev,
        [boardObject.id]: {
          point: finalPos,
          mode: 'pending',
          updatedAt: nowMs(),
        },
      }))
      await patchObject(
        boardObject.id,
        {
          position: finalPos,
          ...(
            boardObject.type !== 'frame' && boardObject.type !== 'connector'
              ? {
                  frameId: resolveContainingFrameId({
                    objectId: boardObject.id,
                    position: finalPos,
                    size: resolveObjectSize(boardObject),
                  }),
                }
              : {}
          ),
        },
        { actionLabel },
      )
    },
    [patchObject, resolveContainingFrameId, resolveObjectSize],
  )
  const resizeObjectLocal = useCallback((boardObject: BoardObject, nextSize: { width: number; height: number }) => {
    setLocalObjectSizes((prev) => ({
      ...prev,
      [boardObject.id]: {
        size: nextSize,
        mode: 'resizing',
        updatedAt: nowMs(),
      },
    }))
  }, [])
  const commitResizeObject = useCallback(
    async (boardObject: BoardObject, nextSize: { width: number; height: number }) => {
      setResizingObjectId(null)
      setLocalObjectSizes((prev) => ({
        ...prev,
        [boardObject.id]: {
          size: nextSize,
          mode: 'pending',
          updatedAt: nowMs(),
        },
      }))
      await patchObject(boardObject.id, { size: nextSize }, { actionLabel: `resized ${boardObject.type}` })
    },
    [patchObject],
  )

  const handleMinimapNavigate = useCallback(
    (event: { currentTarget: EventTarget & HTMLDivElement; clientX: number; clientY: number }) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const ratioX = minimapModel.world.width / minimapModel.miniWidth
      const ratioY = minimapModel.world.height / minimapModel.miniHeight
      const worldX = minimapModel.world.x + localX * ratioX
      const worldY = minimapModel.world.y + localY * ratioY

      stopZoomMomentum()
      setViewport((prev) => ({
        ...prev,
        x: stageSize.width / 2 - worldX * prev.scale,
        y: stageSize.height / 2 - worldY * prev.scale,
      }))
    },
    [
      minimapModel.miniHeight,
      minimapModel.miniWidth,
      minimapModel.world.height,
      minimapModel.world.width,
      minimapModel.world.x,
      minimapModel.world.y,
      stageSize.height,
      stageSize.width,
      stopZoomMomentum,
    ],
  )

  const handleAiCommandSubmit = async (command: string) => {
    if (!user) {
      throw new Error('Sign in required')
    }
    if (!hasLiveBoardAccess) {
      throw new Error("You don't have permission to run AI commands on this board.")
    }
    if (!canEditBoard) {
      throw new Error('Switch to edit mode to run AI commands.')
    }

    const resolveAuthToken = async () => {
      if (typeof user.getIdToken === 'function') {
        return user.getIdToken()
      }

      if (auth?.currentUser && typeof auth.currentUser.getIdToken === 'function') {
        return auth.currentUser.getIdToken()
      }

      if (import.meta.env.DEV && auth) {
        try {
          const credentials = await signInAnonymously(auth)
          return credentials.user.getIdToken()
        } catch (tokenError) {
          console.warn('Dev auth token fallback failed for AI command submit', tokenError)
        }
      }

      throw new Error(
        'AI command auth session missing. Sign in with QA email/password instead of local bypass.',
      )
    }

    const idToken = await resolveAuthToken()
    const response = await fetch(aiCommandEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        boardId,
        userDisplayName: user.displayName || user.email || 'Anonymous',
        command,
        clientCommandId: crypto.randomUUID(),
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; result?: { message?: string; aiResponse?: string } }
      | null

    if (!response.ok) {
      throw new Error(payload?.error || 'AI command failed')
    }

    void logActivity({
      actorId: user.uid,
      actorName: user.displayName || user.email || 'Anonymous',
      action: 'ran AI command',
      targetId: null,
      targetType: null,
    })

    return payload?.result?.aiResponse || payload?.result?.message
  }
  const renderBoardListItem = (boardMeta: BoardMeta) => {
    const isOwner = boardMeta.ownerId === userId
    const collaboratorsCount = boardMeta.sharedWith.length
    return (
      <article
        key={boardMeta.id}
        className={`board-list-item ${boardMeta.id === boardId ? 'active' : ''}`}
        data-testid={`board-list-item-${boardMeta.id}`}
      >
        <button
          type="button"
          className="board-list-link"
          onClick={() => {
            if (renamingBoardId === boardMeta.id) {
              return
            }
            scheduleBoardNavigate(boardMeta.id)
          }}
        >
          {renamingBoardId === boardMeta.id ? (
            <input
              className="board-list-rename-input"
              value={renameBoardName}
              onChange={(event) => {
                setRenameBoardName(event.target.value)
                if (renameBoardError) {
                  setRenameBoardError(null)
                }
              }}
              onMouseDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
              }}
              onBlur={() => {
                void submitBoardRename(boardMeta.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submitBoardRename(boardMeta.id)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelBoardRename()
                }
              }}
              autoFocus
              maxLength={80}
              data-testid={`rename-board-input-${boardMeta.id}`}
            />
          ) : (
            <span
              className={`board-list-name ${isOwner ? 'board-list-name-editable' : ''}`}
              onDoubleClick={(event) => {
                if (!isOwner) {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                beginBoardRename(boardMeta)
              }}
              data-testid={`board-name-${boardMeta.id}`}
            >
              {boardMeta.name}
            </span>
          )}
          {boardMeta.description ? <span className="board-list-description">{boardMeta.description}</span> : null}
          <span className="board-list-meta">
            {isOwner ? 'Owner' : 'Shared with you'}
            {isOwner && collaboratorsCount > 0
              ? ` · ${collaboratorsCount} collaborator${collaboratorsCount === 1 ? '' : 's'}`
              : ''}
          </span>
        </button>
        <div className="board-list-actions">
          <button
            type="button"
            className="board-list-share"
            onClick={() => void duplicateBoardMeta(boardMeta.id)}
            title="Duplicate board"
            data-testid={`duplicate-board-${boardMeta.id}`}
          >
            Duplicate
          </button>
          {isOwner ? (
            <button
              type="button"
              className="board-list-share"
              onClick={() => openShareDialog(boardMeta.id)}
              title="Share board"
              data-testid={`share-board-${boardMeta.id}`}
            >
              Share
            </button>
          ) : null}
          <button
            type="button"
            className="board-list-delete"
            onClick={() => void deleteBoardMeta(boardMeta.id)}
            title="Delete board"
            disabled={!isOwner || boards.length <= 1}
            data-testid={`delete-board-${boardMeta.id}`}
          >
            Delete
          </button>
        </div>
        {renamingBoardId === boardMeta.id && renameBoardError ? <p className="error-text">{renameBoardError}</p> : null}
      </article>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!db || !rtdb) {
    return (
      <main className="board-shell">
        <section className="setup-warning">
          <h2>Firebase configuration required</h2>
          <p>Set `VITE_FIREBASE_*` values in `.env` to enable realtime collaboration.</p>
        </section>
      </main>
    )
  }

  if (boardAccessState === 'checking') {
    return (
      <main className="board-shell">
        <section className="setup-warning" data-testid="board-access-checking">
          <h2>Opening board...</h2>
          <p>Checking access and syncing your workspace.</p>
        </section>
      </main>
    )
  }

  if (boardAccessState === 'denied') {
    return (
      <main className="board-shell">
        <section className="setup-warning" data-testid="board-access-denied">
          <h2>Access denied</h2>
          <p>{boardAccessError || "You don't have permission to access this board."}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate('/')}
            data-testid="board-access-denied-go-home"
          >
            Go to workspace
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="board-shell">
      <header className="board-header">
        <div className="board-header-left">
          <h1>CollabBoard</h1>
          {isRenamingCurrentBoard && currentBoardMeta ? (
            <input
              className="board-name-pill-input"
              value={renameBoardName}
              onChange={(event) => {
                setRenameBoardName(event.target.value)
                if (renameBoardError) {
                  setRenameBoardError(null)
                }
              }}
              onBlur={() => {
                void submitBoardRename(currentBoardMeta.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submitBoardRename(currentBoardMeta.id)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelBoardRename()
                }
              }}
              autoFocus
              maxLength={80}
              aria-label="Rename current board"
              data-testid="current-board-name-input"
            />
          ) : (
            <span
              className={`board-name-pill ${canManageCurrentBoardSharing ? 'board-name-pill-editable' : ''}`}
              onDoubleClick={(event) => {
                if (!canManageCurrentBoardSharing || !currentBoardMeta) {
                  return
                }
                event.preventDefault()
                beginBoardRename(currentBoardMeta)
              }}
              title={canManageCurrentBoardSharing ? 'Double-click to rename board' : undefined}
              data-testid="current-board-name"
            >
              {currentBoardMeta?.name || `Board ${boardId.slice(0, 8)}`}
            </span>
          )}
          {isRenamingCurrentBoard && renameBoardError ? (
            <span className="error-text board-name-rename-error" data-testid="current-board-name-error">
              {renameBoardError}
            </span>
          ) : null}
          {showConnectionStatusPill ? (
            <span
              className={`sync-state-pill ${
                connectionStatus === 'reconnecting' ? 'sync-state-pill-warning' : 'sync-state-pill-syncing'
              }`}
              data-testid="connection-status-pill"
            >
              {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Syncing…'}
            </span>
          ) : null}
          <span
            className={`sync-state-pill ${canEditBoard ? 'sync-state-pill-ok' : 'sync-state-pill-warning'}`}
            data-testid="interaction-mode-pill"
          >
            {canEditBoard ? 'Edit mode' : 'View mode'}
          </span>
          <div className="timer-widget">
            <span className="timer-icon" aria-hidden>
              <Timer size={14} />
            </span>
            <span>{formatTimerLabel(effectiveTimerMs)}</span>
            {timerState.running ? (
              <button
                type="button"
                className="button-icon with-tooltip tooltip-bottom"
                onClick={() => void pauseTimer()}
                title="Pause timer"
                data-tooltip="Pause timer"
                aria-label="Pause timer"
              >
                <Pause size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="button-icon with-tooltip tooltip-bottom"
                onClick={() => void startTimer()}
                title="Start timer"
                data-tooltip="Start timer"
                aria-label="Start timer"
              >
                <Play size={16} />
              </button>
            )}
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom"
              onClick={() => void resetTimer()}
              title="Reset timer"
              data-tooltip="Reset timer"
              aria-label="Reset timer"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div className="header-actions">
          {canManageCurrentBoardSharing && currentBoardMeta ? (
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom"
              onClick={() => {
                setBoardFormError(null)
                closeCommandPalette()
                cancelBoardRename()
                setShowBoardsPanel(true)
                openShareDialog(currentBoardMeta.id)
              }}
              title="Share board"
              data-tooltip="Share board"
              aria-label="Share current board"
              data-testid="share-current-board-button"
            >
              <Share2 size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={() => {
              setBoardFormError(null)
              closeCommandPalette()
              if (showBoardsPanel) {
                closeShareDialog()
                cancelBoardRename()
              }
              setShowBoardsPanel((prev) => !prev)
            }}
            title="Boards"
            data-tooltip="Boards"
            aria-label="Open boards panel"
            data-testid="open-boards-panel"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={toggleThemeMode}
            title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            data-tooltip={themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            data-testid="theme-toggle-button"
          >
            {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={() => setShowShortcuts((prev) => !prev)}
            title="Keyboard shortcuts (?)"
            data-tooltip="Keyboard shortcuts"
            aria-label={showShortcuts ? 'Close keyboard shortcuts' : 'Open keyboard shortcuts'}
          >
            <Keyboard size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={() => void signOutUser()}
            title="Sign out"
            data-tooltip="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      {showBoardsPanel ? (
        <div
          className="boards-panel-backdrop"
          onClick={() => {
            closeShareDialog()
            cancelBoardRename()
            setShowBoardsPanel(false)
          }}
          data-testid="boards-panel-backdrop"
        >
          <section
            className="boards-panel"
            onClick={(event) => event.stopPropagation()}
            data-testid="boards-panel"
          >
            <div className="boards-panel-header">
              <h3>Boards</h3>
              <button
                type="button"
                className="button-icon"
                onClick={() => {
                  closeShareDialog()
                  cancelBoardRename()
                  setShowBoardsPanel(false)
                }}
                aria-label="Close boards panel"
              >
                <X size={16} />
              </button>
            </div>
            <div className="boards-panel-body">
              <div className="boards-list" data-testid="board-list">
                {boards.length === 0 ? <p className="panel-note">No boards yet.</p> : null}
                {ownedBoards.length > 0 ? (
                  <section className="board-list-section" data-testid="board-list-owned">
                    <h4 className="board-list-section-title">My boards</h4>
                    {ownedBoards.map((boardMeta) => renderBoardListItem(boardMeta))}
                  </section>
                ) : null}
                {sharedBoards.length > 0 ? (
                  <section className="board-list-section" data-testid="board-list-shared">
                    <h4 className="board-list-section-title">Shared with me</h4>
                    {sharedBoards.map((boardMeta) => renderBoardListItem(boardMeta))}
                  </section>
                ) : null}
              </div>
              <form
                className="board-create-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void createBoard()
                }}
                data-testid="board-create-form"
              >
                <h4>Create Board</h4>
                <label className="board-field">
                  <span>Name</span>
                  <input
                    value={newBoardName}
                    onChange={(event) => {
                      setNewBoardName(event.target.value)
                      if (boardFormError) {
                        setBoardFormError(null)
                      }
                    }}
                    placeholder="Sprint planning"
                    maxLength={80}
                    data-testid="board-name-input"
                  />
                </label>
                <label className="board-field">
                  <span>Description</span>
                  <textarea
                    value={newBoardDescription}
                    onChange={(event) => {
                      setNewBoardDescription(event.target.value)
                      if (boardFormError) {
                        setBoardFormError(null)
                      }
                    }}
                    placeholder="Optional board summary"
                    rows={3}
                    maxLength={240}
                    data-testid="board-description-input"
                  />
                </label>
                {boardFormError ? (
                  <p className="error-text" data-testid="board-form-error">
                    {boardFormError}
                  </p>
                ) : null}
                <button type="submit" className="primary-button" data-testid="create-board-button">
                  Create board
                </button>
              </form>
              {shareDialogBoardId && shareDialogBoardMeta ? (
                <section className="share-dialog-card" data-testid="share-dialog">
                  <div className="share-dialog-header">
                    <h4>Share "{shareDialogBoardMeta.name}"</h4>
                    <button type="button" className="button-icon" onClick={closeShareDialog} aria-label="Close share dialog">
                      <X size={14} />
                    </button>
                  </div>
                  <form
                    className="share-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitShareInvite()
                    }}
                    data-testid="share-board-form"
                  >
                    <label className="board-field">
                      <span>Invite by email</span>
                      <input
                        type="email"
                        value={shareEmail}
                        onChange={(event) => {
                          setShareEmail(event.target.value)
                          if (shareError) {
                            setShareError(null)
                          }
                        }}
                        placeholder="collaborator@example.com"
                        data-testid="share-email-input"
                      />
                    </label>
                    <label className="board-field">
                      <span>Permission</span>
                      <select
                        value={shareRole}
                        onChange={(event) =>
                          setShareRole(event.target.value === 'view' ? 'view' : 'edit')
                        }
                        data-testid="share-role-select"
                      >
                        <option value="edit">Can edit</option>
                        <option value="view">Read only</option>
                      </select>
                    </label>
                    {shareError ? (
                      <p className="error-text" data-testid="share-error">
                        {shareError}
                      </p>
                    ) : null}
                    {shareStatus ? (
                      <p className="panel-note" data-testid="share-status">
                        {shareStatus}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={isShareSubmitting}
                      data-testid="share-submit-button"
                    >
                      {isShareSubmitting ? 'Sharing…' : 'Share'}
                    </button>
                  </form>
                  <div className="share-collaborators">
                    <h5>Collaborators</h5>
                    {shareDialogBoardMeta.sharedWith.length === 0 ? (
                      <p className="panel-note">No collaborators yet.</p>
                    ) : (
                      shareDialogBoardMeta.sharedWith.map((collaboratorId) => (
                        <div
                          key={collaboratorId}
                          className="share-collaborator-row"
                          data-testid={`share-collaborator-${collaboratorId}`}
                        >
                          <span className="share-collaborator-id">{collaboratorId}</span>
                          <span
                            className="panel-note"
                            data-testid={`share-collaborator-role-${collaboratorId}`}
                          >
                            {shareDialogBoardMeta.sharedRoles[collaboratorId] === 'view'
                              ? 'Read only'
                              : 'Can edit'}
                          </span>
                          <button
                            type="button"
                            className="board-list-delete"
                            disabled={isShareSubmitting}
                            onClick={() => void revokeSharedCollaborator(shareDialogBoardMeta.id, collaboratorId)}
                            data-testid={`revoke-collaborator-${collaboratorId}`}
                          >
                            Revoke
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {showCommandPalette ? (
        <div
          className="command-palette-backdrop"
          onClick={closeCommandPalette}
          data-testid="command-palette-backdrop"
        >
          <section
            className="command-palette"
            onClick={(event) => event.stopPropagation()}
            data-testid="command-palette"
          >
            <input
              ref={commandPaletteInputRef}
              className="command-palette-input"
              placeholder="Type a command…"
              value={commandPaletteQuery}
              onChange={(event) => {
                setCommandPaletteQuery(event.target.value)
                setCommandPaletteActiveIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  if (filteredCommandPaletteCommands.length > 0) {
                    setCommandPaletteActiveIndex((previous) =>
                      (previous + 1) % filteredCommandPaletteCommands.length,
                    )
                  }
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  if (filteredCommandPaletteCommands.length > 0) {
                    setCommandPaletteActiveIndex((previous) =>
                      (previous - 1 + filteredCommandPaletteCommands.length) % filteredCommandPaletteCommands.length,
                    )
                  }
                  return
                }
                if (event.key === 'Enter') {
                  const activeEntry = filteredCommandPaletteCommands[commandPaletteActiveIndex]
                  if (!activeEntry) {
                    return
                  }
                  event.preventDefault()
                  runCommandPaletteEntry(activeEntry)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeCommandPalette()
                }
              }}
              data-testid="command-palette-input"
            />
            <div className="command-palette-list" data-testid="command-palette-list">
              {filteredCommandPaletteCommands.length === 0 ? (
                <p className="panel-note" data-testid="command-palette-empty">
                  No commands found.
                </p>
              ) : (
                filteredCommandPaletteCommands.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`command-palette-item ${index === commandPaletteActiveIndex ? 'active' : ''}`}
                    onMouseEnter={() => setCommandPaletteActiveIndex(index)}
                    onClick={() => runCommandPaletteEntry(entry)}
                    data-testid={`command-palette-item-${entry.id}`}
                  >
                    <span className="command-palette-item-label">{entry.label}</span>
                    <span className="command-palette-item-description">{entry.description}</span>
                    {entry.shortcut ? (
                      <span className="command-palette-item-shortcut">{entry.shortcut}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <p className="command-palette-hint">Use ↑/↓ to navigate, Enter to run, Esc to close.</p>
          </section>
        </div>
      ) : null}
      {showTemplateChooser ? (
        <div
          className="template-chooser-backdrop"
          onClick={() => setShowTemplateChooser(false)}
          data-testid="template-chooser-backdrop"
        >
          <section
            className="template-chooser-modal"
            onClick={(event) => event.stopPropagation()}
            data-testid="template-chooser"
          >
            <div className="template-chooser-header">
              <h3>Start from a Template</h3>
              <button
                type="button"
                className="button-icon"
                onClick={() => setShowTemplateChooser(false)}
                aria-label="Close template chooser"
              >
                <X size={14} />
              </button>
            </div>
            <div className="template-chooser-grid">
              <button
                type="button"
                className="template-card"
                onClick={() => void applyTemplate('retro')}
                disabled={!canEditBoard}
                data-testid="template-option-retro"
              >
                <strong>Retro</strong>
                <span>What went well, what didn&apos;t, and action items columns.</span>
              </button>
              <button
                type="button"
                className="template-card"
                onClick={() => void applyTemplate('mindmap')}
                disabled={!canEditBoard}
                data-testid="template-option-mindmap"
              >
                <strong>Mindmap</strong>
                <span>Central topic with connected branches for fast brainstorming.</span>
              </button>
              <button
                type="button"
                className="template-card"
                onClick={() => void applyTemplate('kanban')}
                disabled={!canEditBoard}
                data-testid="template-option-kanban"
              >
                <strong>Kanban</strong>
                <span>To Do, Doing, Done workflow scaffold with starter tasks.</span>
              </button>
            </div>
            {!canEditBoard ? (
              <p className="panel-note" data-testid="template-chooser-view-mode-note">
                Switch to edit mode to apply templates.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* Floating Toolbar */}
      <div className="floating-toolbar">
        <div className="tool-group" ref={createPopoverContainerRef}>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => setShowTemplateChooser(true)}
            disabled={!canEditBoard}
            title="Template chooser"
            data-tooltip="Template chooser"
            aria-label="Open template chooser"
            data-testid="template-chooser-button"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className="button-icon button-primary with-tooltip"
            onClick={() => void createObject('stickyNote')}
            disabled={!canEditBoard}
            title="Add sticky note (S)"
            data-tooltip="Add sticky note (S)"
          >
            <StickyNote size={16} />
          </button>
          <div className="tool-launcher">
            <button
              type="button"
              className={`button-icon with-tooltip ${activeCreatePopover === 'shape' ? 'button-primary' : ''}`}
              onClick={() => toggleCreatePopover('shape')}
              disabled={!canEditBoard}
              title="Add shape"
              data-tooltip="Add shape"
              aria-label="Open shape options"
              aria-expanded={activeCreatePopover === 'shape'}
              data-testid="add-shape-button"
            >
              <Square size={16} />
            </button>
            {activeCreatePopover === 'shape' ? (
              <div className="toolbar-popover" data-testid="shape-create-popover">
                <div className="toolbar-popover-section" data-testid="shape-create-shape-picker">
                  {SHAPE_TYPE_OPTIONS.map((shapeOption) => (
                    <button
                      key={`new-shape-${shapeOption.kind}`}
                      type="button"
                      className={`shape-option ${
                        shapeCreateDraft.shapeType === shapeOption.kind ? 'active' : ''
                      }`}
                      onClick={() =>
                        setShapeCreateDraft((prev) => ({
                          ...prev,
                          shapeType: shapeOption.kind,
                        }))
                      }
                      title={`Set new shape type to ${shapeOption.label}`}
                      aria-label={`Set new shape type to ${shapeOption.label}`}
                    >
                      <span className="shape-icon" aria-hidden>
                        {shapeOption.kind === 'rectangle' ? <Square size={14} /> : null}
                        {shapeOption.kind === 'circle' ? <CircleShapeIcon size={14} /> : null}
                        {shapeOption.kind === 'diamond' ? <Diamond size={14} /> : null}
                        {shapeOption.kind === 'triangle' ? <Triangle size={14} /> : null}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="toolbar-popover-section toolbar-popover-swatches" data-testid="shape-create-color-picker">
                  {SHAPE_COLOR_OPTIONS.map((color) => (
                    <button
                      key={`new-shape-color-${color}`}
                      type="button"
                      className={`swatch-button ${shapeCreateDraft.color === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setShapeCreateDraft((prev) => ({
                          ...prev,
                          color,
                        }))
                      }
                      title={`Set new shape color to ${getColorLabel(color)}`}
                      aria-label={`Set new shape color to ${getColorLabel(color)}`}
                    />
                  ))}
                </div>
                <input
                  className="toolbar-popover-input"
                  value={shapeCreateDraft.text}
                  onChange={(event) =>
                    setShapeCreateDraft((prev) => ({
                      ...prev,
                      text: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="Shape label"
                  data-testid="shape-create-text-input"
                />
                <button
                  type="button"
                  className="primary-button toolbar-popover-submit"
                  onClick={() => void createShapeFromPopover()}
                  data-testid="shape-create-submit"
                >
                  Add shape
                </button>
              </div>
            ) : null}
          </div>
          <div className="tool-launcher">
            <button
              type="button"
              className={`button-icon with-tooltip ${activeCreatePopover === 'text' ? 'button-primary' : ''}`}
              onClick={() => toggleCreatePopover('text')}
              disabled={!canEditBoard}
              title="Add text (T)"
              data-tooltip="Add text (T)"
              data-testid="add-text-button"
              aria-label="Open text options"
              aria-expanded={activeCreatePopover === 'text'}
            >
              <Type size={16} />
            </button>
            {activeCreatePopover === 'text' ? (
              <div className="toolbar-popover" data-testid="text-create-popover">
                <textarea
                  className="toolbar-popover-input toolbar-popover-textarea"
                  value={textCreateDraft.text}
                  onChange={(event) =>
                    setTextCreateDraft((prev) => ({
                      ...prev,
                      text: event.target.value,
                    }))
                  }
                  maxLength={240}
                  rows={3}
                  placeholder="Write any text"
                  data-testid="text-create-input"
                />
                <div className="toolbar-popover-section toolbar-popover-swatches" data-testid="text-create-color-picker">
                  {TEXT_COLOR_OPTIONS.map((color) => (
                    <button
                      key={`new-text-color-${color}`}
                      type="button"
                      className={`swatch-button ${textCreateDraft.color === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setTextCreateDraft((prev) => ({
                          ...prev,
                          color,
                        }))
                      }
                      title={`Set new text color to ${getColorLabel(color)}`}
                      aria-label={`Set new text color to ${getColorLabel(color)}`}
                    />
                  ))}
                </div>
                <label className="toolbar-popover-field">
                  <span>Size</span>
                  <input
                    type="number"
                    min={12}
                    max={72}
                    value={textCreateDraft.fontSize}
                    onChange={(event) =>
                      setTextCreateDraft((prev) => ({
                        ...prev,
                        fontSize: clamp(Number(event.target.value) || 24, 12, 72),
                      }))
                    }
                    data-testid="text-create-font-size"
                  />
                </label>
                <button
                  type="button"
                  className="primary-button toolbar-popover-submit"
                  onClick={() => void createTextFromPopover()}
                  data-testid="text-create-submit"
                >
                  Add text
                </button>
              </div>
            ) : null}
          </div>
          <div className="selection-mode-toggle" role="group" aria-label="Selection mode">
            <button
              type="button"
              className={`button-icon with-tooltip ${selectionMode === 'select' ? 'button-primary' : ''}`}
              onClick={() => setSelectionMode('select')}
              title="Pointer mode"
              data-tooltip="Pointer mode"
              aria-label="Pointer mode"
              aria-pressed={selectionMode === 'select'}
              data-testid="selection-mode-select"
            >
              <MousePointer2 size={16} />
            </button>
            <button
              type="button"
              className={`button-icon with-tooltip ${selectionMode === 'area' ? 'button-primary' : ''}`}
              onClick={() => setSelectionMode('area')}
              title="Box select mode"
              data-tooltip="Box select mode"
              aria-label="Box select mode"
              aria-pressed={selectionMode === 'area'}
              data-testid="selection-mode-area"
            >
              <SquareDashedMousePointer size={16} />
            </button>
          </div>
          <div className="selection-mode-toggle" role="group" aria-label="Board interaction mode">
            <button
              type="button"
              className={`button-icon with-tooltip ${canEditBoard ? 'button-primary' : ''}`}
              onClick={() => {
                if (!roleCanEditBoard) {
                  return
                }
                setInteractionMode('edit')
              }}
              disabled={!roleCanEditBoard}
              title="Edit mode"
              data-tooltip="Edit mode"
              aria-label="Enable edit mode"
              aria-pressed={canEditBoard}
              data-testid="interaction-mode-edit"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className={`button-icon with-tooltip ${!canEditBoard ? 'button-primary' : ''}`}
              onClick={() => setInteractionMode('view')}
              title="View mode"
              data-tooltip="View mode"
              aria-label="Enable view mode"
              aria-pressed={!canEditBoard}
              data-testid="interaction-mode-view"
            >
              <Eye size={16} />
            </button>
          </div>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void createObject('frame')}
            disabled={!canEditBoard}
            title="Add frame (F)"
            data-tooltip="Add frame (F)"
          >
            <SquareDashed size={16} />
          </button>
          <div className="tool-launcher">
            <button
              type="button"
              className={`button-icon with-tooltip ${activeCreatePopover === 'connector' ? 'button-primary' : ''}`}
              onClick={() => toggleCreatePopover('connector')}
              disabled={!canEditBoard}
              title="Add connector (C)"
              data-tooltip="Add connector (C)"
              aria-label="Open connector options"
              aria-expanded={activeCreatePopover === 'connector'}
              data-testid="add-connector-button"
            >
              <Waypoints size={16} />
            </button>
            {activeCreatePopover === 'connector' ? (
              <div className="toolbar-popover" data-testid="connector-create-popover">
                <div
                  className="toolbar-popover-section"
                  data-testid="new-connector-style-picker"
                >
                  {CONNECTOR_STYLE_OPTIONS.map((option) => (
                    <button
                      key={`new-connector-${option.value}`}
                      type="button"
                      className={`shape-option ${
                        connectorCreateDraft.style === option.value ? 'active' : ''
                      }`}
                      onClick={() =>
                        setConnectorCreateDraft((prev) => ({
                          ...prev,
                          style: option.value,
                        }))
                      }
                      title={`Set new connector style to ${option.label}`}
                      aria-label={`Set new connector style to ${option.label}`}
                    >
                      <span className="shape-icon" aria-hidden>
                        {option.value === 'arrow' ? '→' : '—'}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="toolbar-popover-section toolbar-popover-swatches"
                  data-testid="connector-create-color-picker"
                >
                  {CONNECTOR_COLOR_OPTIONS.map((color) => (
                    <button
                      key={`new-connector-color-${color}`}
                      type="button"
                      className={`swatch-button ${connectorCreateDraft.color === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setConnectorCreateDraft((prev) => ({
                          ...prev,
                          color,
                        }))
                      }
                      title={`Set new connector color to ${getColorLabel(color)}`}
                      aria-label={`Set new connector color to ${getColorLabel(color)}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="primary-button toolbar-popover-submit"
                  onClick={() => void createConnectorFromPopover()}
                  data-testid="connector-create-submit"
                >
                  Add connector
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void undo()}
            disabled={!canEditBoard}
            title="Undo (Cmd+Z)"
            data-tooltip="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void redo()}
            disabled={!canEditBoard}
            title="Redo (Cmd+Shift+Z)"
            data-tooltip="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button
            type="button"
            className={`button-icon with-tooltip ${isVotingMode ? 'button-primary' : ''}`}
            onClick={() => setIsVotingMode((prev) => !prev)}
            disabled={!canEditBoard}
            title="Toggle voting mode (V)"
            data-tooltip={isVotingMode ? 'Disable voting mode' : 'Enable voting mode'}
            aria-label="Toggle voting mode"
          >
            <Vote size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            data-testid="export-viewport-png"
            onClick={() => void exportBoard('png', 'selection')}
            title="Export current viewport as PNG"
            data-tooltip="Export current viewport as PNG"
            aria-label="Export current viewport as PNG"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            data-testid="export-viewport-pdf"
            onClick={() => void exportBoard('pdf', 'selection')}
            title="Export current viewport as PDF"
            data-tooltip="Export current viewport as PDF"
            aria-label="Export current viewport as PDF"
          >
            <FileText size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void duplicateSelected()}
            disabled={!canEditBoard || selectedIds.length === 0}
            title="Duplicate selected (Cmd/Ctrl + D)"
            data-tooltip="Duplicate selected object"
            aria-label="Duplicate selected object"
            data-testid="duplicate-selected-button"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => {
              if (selectedIds.length > 0) {
                void deleteSelected()
              }
            }}
            disabled={!canEditBoard || selectedIds.length === 0}
            title="Delete selected (Del/Backspace)"
            data-tooltip="Delete selected objects"
            aria-label="Delete selected object"
            data-testid="delete-selected-button"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <section className="board-content">
        <section className="canvas-column">
          <div className="presence-strip">
            <span key={`self-${user.uid}`} className="presence-pill">
              <span className="presence-dot" />
              {selfDisplayName}
            </span>
            {remotePresenceEntries.map((cursor) => (
              <span key={cursor.userId} className="presence-pill">
                <span
                  className={`presence-dot ${
                    typeof cursor.lastSeen === 'number' &&
                    nowMsValue - cursor.lastSeen > PRESENCE_AWAY_THRESHOLD_MS
                      ? 'away'
                      : ''
                  }`}
                />
                {cursor.displayName}
              </span>
            ))}
          </div>

          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            className={`board-stage ${selectionMode === 'area' ? 'board-stage-area' : ''}`}
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable={selectionMode === 'select' && !selectionBox?.active}
            onDragStart={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              stopZoomMomentum()
            }}
            onDragEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }

              const stage = stageRef.current
              if (!stage) {
                return
              }

              stopZoomMomentum()
              setViewport((prev) => ({
                ...prev,
                x: stage.x(),
                y: stage.y(),
              }))
            }}
            onWheel={(event) => {
              event.evt.preventDefault()

              const stage = stageRef.current
              if (!stage) {
                return
              }

              const pointer = stage.getPointerPosition()
              if (!pointer) {
                return
              }

              const scaleBy = 1.05
              const baseViewport = zoomMomentumTargetRef.current || viewport
              const oldScale = baseViewport.scale
              const nextScale = clamp(
                event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy,
                MIN_ZOOM_SCALE,
                MAX_ZOOM_SCALE,
              )

              const worldX = (pointer.x - baseViewport.x) / oldScale
              const worldY = (pointer.y - baseViewport.y) / oldScale

              queueZoomMomentum({
                scale: nextScale,
                x: pointer.x - worldX * nextScale,
                y: pointer.y - worldY * nextScale,
              })
            }}
            onMouseMove={(event) => {
              const stage = event.target.getStage()
              if (!stage) {
                return
              }

              const worldPoint = resolveWorldPointer(stage)
              if (!worldPoint) {
                return
              }

              if (selectionBox?.active) {
                updateSelectionBox(worldPoint)
                return
              }

              publishCursorPosition({
                x: worldPoint.x,
                y: worldPoint.y,
              })
            }}
            onMouseDown={(event) => {
              if (event.target !== event.target.getStage()) {
                return
              }

              const stage = event.target.getStage()
              if (!stage) {
                return
              }

              if (selectionMode === 'area' || event.evt.shiftKey) {
                const worldPoint = resolveWorldPointer(stage)
                if (!worldPoint) {
                  return
                }
                beginSelectionBox(worldPoint)
                event.evt.preventDefault()
                return
              }

              setHoveredObjectId(null)
              setSelectedIds([])
            }}
            onMouseUp={(event) => {
              if (!selectionBox?.active) {
                return
              }
              completeSelectionBox(Boolean(event.evt.shiftKey))
            }}
          >
            <Layer listening={false}>
              <Rect x={-10000} y={-10000} width={20000} height={20000} fill={boardCanvasBackground} />
            </Layer>

            <Layer>
              {renderObjects.map((boardObject) => {
                const selected = selectedIdSet.has(boardObject.id)
                const hovered = hoveredObjectId === boardObject.id
                // Prefer in-flight drag ref to avoid controlled drag jitter on re-render.
                const position =
                  liveDragPositionsRef.current[boardObject.id] ||
                  localObjectPositions[boardObject.id]?.point || boardObject.position
                const size = resolveObjectSize(boardObject)

                if (boardObject.type === 'stickyNote') {
                  const shapeType = normalizeShapeKind(boardObject.shapeType)
                  const isInlineStickyTextEditing =
                    inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'text'
                  const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
                  const strokeColor = selected ? '#1d4ed8' : hovered ? '#0f766e' : '#0f172a'
                  const strokeWidth = selected ? 2 : hovered ? 2 : 1
                  const voteCount = Object.keys(boardObject.votesByUser || {}).length
                  const commentCount = boardObject.comments?.length || 0
                  return (
                    <Group
                      key={boardObject.id}
                      id={`sticky-${boardObject.id}`}
                      x={position.x}
                      y={position.y}
                      rotation={rotation}
                      draggable={canEditBoard && selectionMode === 'select' && resizingObjectId !== boardObject.id && rotatingObjectId !== boardObject.id}
                      onClick={(event) => handleObjectSelection(boardObject, Boolean(event.evt.shiftKey), 'text')}
                      onTap={() => handleObjectSelection(boardObject, false, 'text')}
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
                          selectedIds.length > 1 ? 'moved selection' : 'moved sticky',
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
                          points={[
                            size.width / 2,
                            0,
                            size.width,
                            size.height / 2,
                            size.width / 2,
                            size.height,
                            0,
                            size.height / 2,
                          ]}
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
                          points={[
                            size.width / 2,
                            0,
                            size.width,
                            size.height,
                            0,
                            size.height,
                          ]}
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
                      {!isInlineStickyTextEditing ? (
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
                      {voteCount > 0 ? (
                        <>
                          <Circle x={size.width - 16} y={16} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={size.width - 21}
                            y={10}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <>
                          <Rect
                            x={8}
                            y={8}
                            width={commentCount > 9 ? 28 : 24}
                            height={18}
                            fill="#0f766e"
                            cornerRadius={9}
                            shadowBlur={4}
                            shadowOpacity={0.18}
                          />
                          <Text
                            text={`C${commentCount}`}
                            x={8}
                            y={11}
                            width={commentCount > 9 ? 28 : 24}
                            align="center"
                            fontSize={11}
                            fontStyle="bold"
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {selected ? (
                        <Rect
                          width={size.width}
                          height={size.height}
                          stroke="#1d4ed8"
                          strokeWidth={1}
                          dash={[6, 4]}
                          listening={false}
                        />
                      ) : null}
                      {selected && canEditBoard ? (
                        <Rect
                          x={size.width - RESIZE_HANDLE_SIZE}
                          y={size.height - RESIZE_HANDLE_SIZE}
                          width={RESIZE_HANDLE_SIZE}
                          height={RESIZE_HANDLE_SIZE}
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
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            resizeObjectLocal(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          onDragEnd={(event) => {
                            const nextSize = {
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
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
                            y2={-ROTATION_HANDLE_OFFSET}
                            stroke="#1d4ed8"
                            strokeWidth={1.5}
                            listening={false}
                          />
                          <Circle
                            x={size.width / 2}
                            y={-ROTATION_HANDLE_OFFSET}
                            radius={ROTATION_HANDLE_SIZE / 2}
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
                              const newRotation = calculateRotationFromHandleTarget(
                                event.target,
                                size.width,
                                size.height,
                              )
                              if (newRotation === null) {
                                return
                              }

                              setLocalRotation(boardObject.id, newRotation)
                              event.cancelBubble = true
                            }}
                            onDragEnd={(event) => {
                              const resolvedRotation =
                                calculateRotationFromHandleTarget(event.target, size.width, size.height) ??
                                localObjectRotationsRef.current[boardObject.id] ??
                                boardObject.rotation ??
                                0
                              void patchObject(
                                boardObject.id,
                                { rotation: resolvedRotation },
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

                if (boardObject.type === 'shape') {
                  const shapeType = normalizeShapeKind(boardObject.shapeType)
                  const isInlineShapeTextEditing =
                    inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'text'
                  const rotation = (localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0)
                  const strokeColor = selected ? '#1d4ed8' : hovered ? '#0f766e' : '#0f172a'
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
                      draggable={canEditBoard && selectionMode === 'select' && resizingObjectId !== boardObject.id && rotatingObjectId !== boardObject.id}
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
                          selectedIds.length > 1 ? 'moved selection' : 'moved shape',
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
                          points={[
                            size.width / 2,
                            0,
                            size.width,
                            size.height / 2,
                            size.width / 2,
                            size.height,
                            0,
                            size.height / 2,
                          ]}
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
                          points={[
                            size.width / 2,
                            0,
                            size.width,
                            size.height,
                            0,
                            size.height,
                          ]}
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
                      {voteCount > 0 ? (
                        <>
                          <Circle x={size.width - 16} y={16} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={size.width - 21}
                            y={10}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <>
                          <Rect
                            x={8}
                            y={8}
                            width={commentCount > 9 ? 28 : 24}
                            height={18}
                            fill="#0f766e"
                            cornerRadius={9}
                            shadowBlur={4}
                            shadowOpacity={0.18}
                          />
                          <Text
                            text={`C${commentCount}`}
                            x={8}
                            y={11}
                            width={commentCount > 9 ? 28 : 24}
                            align="center"
                            fontSize={11}
                            fontStyle="bold"
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
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
                          x={size.width - RESIZE_HANDLE_SIZE}
                          y={size.height - RESIZE_HANDLE_SIZE}
                          width={RESIZE_HANDLE_SIZE}
                          height={RESIZE_HANDLE_SIZE}
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
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            resizeObjectLocal(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          onDragEnd={(event) => {
                            const nextSize = {
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            void commitResizeObject(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          data-testid={`resize-handle-${boardObject.id}`}
                        />
                      ) : null}
                      {selected && canEditBoard ? (
                        <>
                          {/* Rotation handle line */}
                          <Line
                            x1={size.width / 2}
                            y1={0}
                            x2={size.width / 2}
                            y2={-ROTATION_HANDLE_OFFSET}
                            stroke="#1d4ed8"
                            strokeWidth={1.5}
                            listening={false}
                          />
                          {/* Rotation handle circle */}
                          <Circle
                            x={size.width / 2}
                            y={-ROTATION_HANDLE_OFFSET}
                            radius={ROTATION_HANDLE_SIZE / 2}
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
                              const newRotation = calculateRotationFromHandleTarget(
                                event.target,
                                size.width,
                                size.height,
                              )
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

                if (boardObject.type === 'connector') {
                  const connectorGeometry = localConnectorGeometry[boardObject.id] || {
                    start: boardObject.start,
                    end: boardObject.end,
                    fromObjectId: boardObject.fromObjectId ?? null,
                    toObjectId: boardObject.toObjectId ?? null,
                    fromAnchor: boardObject.fromAnchor ?? null,
                    toAnchor: boardObject.toAnchor ?? null,
                  }
                  const connectorStroke = selected ? '#1d4ed8' : hovered ? '#0f766e' : boardObject.color
                  const connectorStyle = normalizeConnectorStyle(boardObject.style)
                  const voteCount = Object.keys(boardObject.votesByUser || {}).length
                  const commentCount = boardObject.comments?.length || 0
                  const connectorMidpoint = {
                    x: (connectorGeometry.start.x + connectorGeometry.end.x) / 2,
                    y: (connectorGeometry.start.y + connectorGeometry.end.y) / 2,
                  }

                  return (
                    <Group
                      key={boardObject.id}
                      onClick={(event) => handleObjectSelection(boardObject, Boolean(event.evt.shiftKey))}
                      onTap={() => handleObjectSelection(boardObject)}
                      onMouseEnter={() => {
                        setHoveredObjectId(boardObject.id)
                      }}
                      onMouseLeave={() => {
                        setHoveredObjectId((previous) => (previous === boardObject.id ? null : previous))
                      }}
                    >
                      {connectorStyle === 'arrow' ? (
                        <Arrow
                          points={[
                            connectorGeometry.start.x,
                            connectorGeometry.start.y,
                            connectorGeometry.end.x,
                            connectorGeometry.end.y,
                          ]}
                          pointerLength={12}
                          pointerWidth={11}
                          fill={connectorStroke}
                          stroke={connectorStroke}
                          strokeWidth={selected ? 3 : hovered ? 2.6 : 2}
                          lineCap="round"
                          lineJoin="round"
                          hitStrokeWidth={16}
                        />
                      ) : (
                        <Line
                          points={[
                            connectorGeometry.start.x,
                            connectorGeometry.start.y,
                            connectorGeometry.end.x,
                            connectorGeometry.end.y,
                          ]}
                          stroke={connectorStroke}
                          strokeWidth={selected ? 3 : hovered ? 2.6 : 2}
                          lineCap="round"
                          lineJoin="round"
                          hitStrokeWidth={16}
                        />
                      )}
                      {voteCount > 0 ? (
                        <>
                          <Circle x={connectorMidpoint.x + 14} y={connectorMidpoint.y - 14} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={connectorMidpoint.x + 9}
                            y={connectorMidpoint.y - 20}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <>
                          <Rect
                            x={connectorMidpoint.x - (commentCount > 9 ? 28 : 24) - 6}
                            y={connectorMidpoint.y - 23}
                            width={commentCount > 9 ? 28 : 24}
                            height={18}
                            fill="#0f766e"
                            cornerRadius={9}
                            shadowBlur={4}
                            shadowOpacity={0.18}
                          />
                          <Text
                            text={`C${commentCount}`}
                            x={connectorMidpoint.x - (commentCount > 9 ? 28 : 24) - 6}
                            y={connectorMidpoint.y - 20}
                            width={commentCount > 9 ? 28 : 24}
                            align="center"
                            fontSize={11}
                            fontStyle="bold"
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {selected && canEditBoard ? (
                        <>
                          <Circle
                            x={connectorGeometry.start.x}
                            y={connectorGeometry.start.y}
                            radius={CONNECTOR_HANDLE_RADIUS}
                            fill="#ffffff"
                            stroke="#1d4ed8"
                            strokeWidth={2}
                            draggable
                            onDragStart={() => {
                              setDraggingConnectorId(boardObject.id)
                            }}
                            onDragMove={(event) => {
                              const snapped = resolveSnappedEndpoint({
                                x: event.target.x(),
                                y: event.target.y(),
                              })
                              const next = toConnectorPatch({
                                start: snapped.point,
                                end: connectorGeometry.end,
                                fromObjectId: snapped.objectId,
                                fromAnchor: snapped.anchor,
                                toObjectId: connectorGeometry.toObjectId,
                                toAnchor: connectorGeometry.toAnchor,
                              })
                              setLocalConnectorGeometry((prev) => ({
                                ...prev,
                                [boardObject.id]: {
                                  start: next.start,
                                  end: next.end,
                                  fromObjectId: next.fromObjectId,
                                  toObjectId: next.toObjectId,
                                  fromAnchor: next.fromAnchor,
                                  toAnchor: next.toAnchor,
                                  mode: 'dragging',
                                  updatedAt: nowMs(),
                                },
                              }))
                              getConnectorPublisher(boardObject.id)(next)
                            }}
                            onDragEnd={(event) => {
                              const snapped = resolveSnappedEndpoint({
                                x: event.target.x(),
                                y: event.target.y(),
                              })
                              const next = toConnectorPatch({
                                start: snapped.point,
                                end: connectorGeometry.end,
                                fromObjectId: snapped.objectId,
                                fromAnchor: snapped.anchor,
                                toObjectId: connectorGeometry.toObjectId,
                                toAnchor: connectorGeometry.toAnchor,
                              })
                              setLocalConnectorGeometry((prev) => ({
                                ...prev,
                                [boardObject.id]: {
                                  start: next.start,
                                  end: next.end,
                                  fromObjectId: next.fromObjectId,
                                  toObjectId: next.toObjectId,
                                  fromAnchor: next.fromAnchor,
                                  toAnchor: next.toAnchor,
                                  mode: 'pending',
                                  updatedAt: nowMs(),
                                },
                              }))
                              setDraggingConnectorId(null)
                              void patchObject(boardObject.id, next)
                            }}
                          />
                          <Circle
                            x={connectorGeometry.end.x}
                            y={connectorGeometry.end.y}
                            radius={CONNECTOR_HANDLE_RADIUS}
                            fill="#ffffff"
                            stroke="#1d4ed8"
                            strokeWidth={2}
                            draggable
                            onDragStart={() => {
                              setDraggingConnectorId(boardObject.id)
                            }}
                            onDragMove={(event) => {
                              const snapped = resolveSnappedEndpoint({
                                x: event.target.x(),
                                y: event.target.y(),
                              })
                              const next = toConnectorPatch({
                                start: connectorGeometry.start,
                                end: snapped.point,
                                fromObjectId: connectorGeometry.fromObjectId,
                                fromAnchor: connectorGeometry.fromAnchor,
                                toObjectId: snapped.objectId,
                                toAnchor: snapped.anchor,
                              })
                              setLocalConnectorGeometry((prev) => ({
                                ...prev,
                                [boardObject.id]: {
                                  start: next.start,
                                  end: next.end,
                                  fromObjectId: next.fromObjectId,
                                  toObjectId: next.toObjectId,
                                  fromAnchor: next.fromAnchor,
                                  toAnchor: next.toAnchor,
                                  mode: 'dragging',
                                  updatedAt: nowMs(),
                                },
                              }))
                              getConnectorPublisher(boardObject.id)(next)
                            }}
                            onDragEnd={(event) => {
                              const snapped = resolveSnappedEndpoint({
                                x: event.target.x(),
                                y: event.target.y(),
                              })
                              const next = toConnectorPatch({
                                start: connectorGeometry.start,
                                end: snapped.point,
                                fromObjectId: connectorGeometry.fromObjectId,
                                fromAnchor: connectorGeometry.fromAnchor,
                                toObjectId: snapped.objectId,
                                toAnchor: snapped.anchor,
                              })
                              setLocalConnectorGeometry((prev) => ({
                                ...prev,
                                [boardObject.id]: {
                                  start: next.start,
                                  end: next.end,
                                  fromObjectId: next.fromObjectId,
                                  toObjectId: next.toObjectId,
                                  fromAnchor: next.fromAnchor,
                                  toAnchor: next.toAnchor,
                                  mode: 'pending',
                                  updatedAt: nowMs(),
                                },
                              }))
                              setDraggingConnectorId(null)
                              void patchObject(boardObject.id, next)
                            }}
                          />
                        </>
                      ) : null}
                    </Group>
                  )
                }

                if (boardObject.type === 'frame') {
                  const frameStroke = selected ? '#1d4ed8' : hovered ? '#0f766e' : '#334155'
                  const isInlineFrameTitleEditing =
                    inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'title'
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
                        if (selectedIdSet.has(boardObject.id) && selectedIds.length > 1) {
                          delete frameDragSnapshotRef.current[boardObject.id]
                          beginObjectDrag(boardObject, { x: event.target.x(), y: event.target.y() })
                          return
                        }
                        // Store actual Konva position to avoid jumps if ref has stale data
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
                        const snapshot = frameDragSnapshotRef.current[boardObject.id]
                        if (snapshot) {
                          const dx = nextFramePos.x - snapshot.frameStart.x
                          const dy = nextFramePos.y - snapshot.frameStart.y
                          snapshot.members.forEach((member) => {
                            liveDragPositionsRef.current[member.id] = {
                              x: member.start.x + dx,
                              y: member.start.y + dy,
                            }
                          })
                        }
                      }}
                      onDragEnd={(event) => {
                        if (multiDragSnapshotRef.current[boardObject.id]) {
                          void endObjectDrag(
                            boardObject,
                            { x: event.target.x(), y: event.target.y() },
                            'moved selection',
                          )
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
                            void patchObject(
                              member.id,
                              { position: memberFinal },
                              { recordHistory: false, logEvent: false },
                            )
                          })
                        }

                        setLocalObjectPositions((prev) => ({
                          ...prev,
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
                      {voteCount > 0 ? (
                        <>
                          <Circle x={size.width - 16} y={16} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={size.width - 21}
                            y={10}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <>
                          <Rect
                            x={size.width - (commentCount > 9 ? 28 : 24) - 8}
                            y={36}
                            width={commentCount > 9 ? 28 : 24}
                            height={18}
                            fill="#0f766e"
                            cornerRadius={9}
                            shadowBlur={4}
                            shadowOpacity={0.18}
                          />
                          <Text
                            text={`C${commentCount}`}
                            x={size.width - (commentCount > 9 ? 28 : 24) - 8}
                            y={39}
                            width={commentCount > 9 ? 28 : 24}
                            align="center"
                            fontSize={11}
                            fontStyle="bold"
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {selected && canEditBoard ? (
                        <Rect
                          x={size.width - RESIZE_HANDLE_SIZE}
                          y={size.height - RESIZE_HANDLE_SIZE}
                          width={RESIZE_HANDLE_SIZE}
                          height={RESIZE_HANDLE_SIZE}
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
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            resizeObjectLocal(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          onDragEnd={(event) => {
                            const nextSize = {
                              width: Math.max(MIN_OBJECT_WIDTH, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(MIN_OBJECT_HEIGHT, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            void commitResizeObject(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          data-testid={`resize-handle-${boardObject.id}`}
                        />
                      ) : null}
                      {selected && canEditBoard ? (
                        <>
                          {/* Rotation handle line */}
                          <Line
                            x1={size.width / 2}
                            y1={0}
                            x2={size.width / 2}
                            y2={-ROTATION_HANDLE_OFFSET}
                            stroke="#1d4ed8"
                            strokeWidth={1.5}
                            listening={false}
                          />
                          {/* Rotation handle circle */}
                          <Circle
                            x={size.width / 2}
                            y={-ROTATION_HANDLE_OFFSET}
                            radius={ROTATION_HANDLE_SIZE / 2}
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
                              const newRotation = calculateRotationFromHandleTarget(
                                event.target,
                                size.width,
                                size.height,
                              )
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

                if (boardObject.type === 'text') {
                  const isInlineTextObjectEditing =
                    inlineEditor?.objectId === boardObject.id && inlineEditor.field === 'text'
                  const fontSize = Math.max(12, boardObject.fontSize || 24)
                  const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
                  const voteCount = Object.keys(boardObject.votesByUser || {}).length
                  const commentCount = boardObject.comments?.length || 0
                  const textWidth = Math.max(80, size.width)
                  const textHeight = Math.max(28, size.height)
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
                          selectedIds.length > 1 ? 'moved selection' : 'moved text',
                        )
                      }}
                    >
                      {!isInlineTextObjectEditing ? (
                        <Text
                          text={boardObject.text}
                          x={0}
                          y={0}
                          width={textWidth}
                          height={textHeight}
                          fontSize={fontSize}
                          fill={boardObject.color}
                          wrap="word"
                          shadowColor="#0f766e"
                          shadowBlur={hovered ? 8 : 0}
                          shadowOpacity={hovered ? 0.28 : 0}
                        />
                      ) : null}
                      {voteCount > 0 ? (
                        <>
                          <Circle x={textWidth - 16} y={16} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={textWidth - 21}
                            y={10}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <>
                          <Rect
                            x={8}
                            y={8}
                            width={commentCount > 9 ? 28 : 24}
                            height={18}
                            fill="#0f766e"
                            cornerRadius={9}
                            shadowBlur={4}
                            shadowOpacity={0.18}
                          />
                          <Text
                            text={`C${commentCount}`}
                            x={8}
                            y={11}
                            width={commentCount > 9 ? 28 : 24}
                            align="center"
                            fontSize={11}
                            fontStyle="bold"
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {!selected && hovered ? (
                        <Rect
                          width={textWidth}
                          height={textHeight}
                          stroke="#0f766e"
                          strokeWidth={1}
                          dash={[6, 4]}
                          listening={false}
                        />
                      ) : null}
                      {selected ? (
                        <Rect
                          width={textWidth}
                          height={textHeight}
                          stroke="#1d4ed8"
                          strokeWidth={1}
                          dash={[6, 4]}
                          listening={false}
                        />
                      ) : null}
                      {selected && canEditBoard ? (
                        <Rect
                          x={textWidth - RESIZE_HANDLE_SIZE}
                          y={textHeight - RESIZE_HANDLE_SIZE}
                          width={RESIZE_HANDLE_SIZE}
                          height={RESIZE_HANDLE_SIZE}
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
                              width: Math.max(80, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(28, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            resizeObjectLocal(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          onDragEnd={(event) => {
                            const nextSize = {
                              width: Math.max(80, event.target.x() + RESIZE_HANDLE_SIZE),
                              height: Math.max(28, event.target.y() + RESIZE_HANDLE_SIZE),
                            }
                            void commitResizeObject(boardObject, nextSize)
                            event.cancelBubble = true
                          }}
                          data-testid={`resize-handle-${boardObject.id}`}
                        />
                      ) : null}
                      {selected && canEditBoard ? (
                        <>
                          {/* Rotation handle line */}
                          <Line
                            x1={textWidth / 2}
                            y1={0}
                            x2={textWidth / 2}
                            y2={-ROTATION_HANDLE_OFFSET}
                            stroke="#1d4ed8"
                            strokeWidth={1.5}
                            listening={false}
                          />
                          {/* Rotation handle circle */}
                          <Circle
                            x={textWidth / 2}
                            y={-ROTATION_HANDLE_OFFSET}
                            radius={ROTATION_HANDLE_SIZE / 2}
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
                              const objectWidth = Math.max(80, size.width)
                              const objectHeight = Math.max(28, size.height)
                              const newRotation = calculateRotationFromHandleTarget(
                                event.target,
                                objectWidth,
                                objectHeight,
                              )
                              if (newRotation === null) {
                                return
                              }

                              setLocalRotation(boardObject.id, newRotation)
                              event.cancelBubble = true
                            }}
                            onDragEnd={(event) => {
                              const objectWidth = Math.max(80, size.width)
                              const objectHeight = Math.max(28, size.height)
                              const finalRotation =
                                calculateRotationFromHandleTarget(event.target, objectWidth, objectHeight) ??
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
              })}
            </Layer>

            {selectionBounds ? (
              <Layer
                listening={false}
                ref={(node) => {
                  selectionScanLayerRef.current = node
                }}
              >
                <Rect
                  ref={(node) => {
                    selectionScanRectRef.current = node
                  }}
                  data-testid="selection-marquee"
                  x={selectionBounds.x}
                  y={selectionBounds.y}
                  width={selectionBounds.width}
                  height={selectionBounds.height}
                  fill="rgba(29, 78, 216, 0.1)"
                  stroke="#1d4ed8"
                  strokeWidth={1}
                  dash={[6, 4]}
                />
              </Layer>
            ) : null}

            {voteConfettiParticles.length > 0 ? (
              <Layer listening={false}>
                {voteConfettiParticles.map((particle) => (
                  <Rect
                    key={particle.id}
                    x={particle.x}
                    y={particle.y}
                    width={particle.size}
                    height={particle.size * 0.65}
                    fill={particle.color}
                    opacity={Math.max(0, Math.min(1, particle.life))}
                    rotation={particle.rotation}
                    cornerRadius={2}
                    offsetX={particle.size / 2}
                    offsetY={(particle.size * 0.65) / 2}
                  />
                ))}
              </Layer>
            ) : null}

            <Layer listening={false}>
              {remotePresenceEntries.map((cursor) => (
                <Group key={cursor.userId} x={cursor.x} y={cursor.y}>
                  <Circle radius={5} fill={cursor.color} />
                  <Rect x={8} y={-12} width={120} height={20} fill={cursor.color} cornerRadius={4} />
                  <Text x={12} y={-9} text={cursor.displayName} fontSize={11} fill="#ffffff" />
                </Group>
              ))}
            </Layer>
          </Stage>
          {rotationOverlayHandles.length > 0 ? (
            <div className="rotation-overlay-layer" data-testid="rotation-overlay-layer">
              {rotationOverlayHandles.map((handle) => {
                const boardObject = objectsById.get(handle.objectId)
                if (!boardObject) {
                  return null
                }
                return (
                  <button
                    key={`rotation-overlay-${handle.objectId}`}
                    type="button"
                    className="rotation-overlay-handle"
                    style={{
                      left: handle.left,
                      top: handle.top,
                      width: handle.size,
                      height: handle.size,
                    }}
                    onMouseDown={(event) => startRotationOverlayDrag(boardObject, handle, event)}
                    data-testid={`rotation-overlay-handle-${handle.objectId}`}
                    aria-label={`Rotate ${boardObject.type}`}
                  />
                )
              })}
            </div>
          ) : null}
          <output data-testid="confetti-particle-count" hidden>
            {voteConfettiParticles.length}
          </output>
          {canEditBoard && selectedObject && selectedObjectMenuPosition ? (
            <div
              className="object-context-menu"
              style={{ left: selectedObjectMenuPosition.left, top: selectedObjectMenuPosition.top }}
              data-testid="object-context-menu"
            >
              {selectedObject.type === 'shape' || selectedObject.type === 'stickyNote' ? (
                <div className="object-context-row" data-testid="shape-type-picker">
                  {selectedShapeOptions.map((shapeOption) => (
                    <button
                      key={`context-shape-${selectedObject.id}-${shapeOption.kind}`}
                      type="button"
                      className={`shape-option ${
                        normalizeShapeKind(selectedObject.shapeType) === shapeOption.kind ? 'active' : ''
                      }`}
                      onClick={() => {
                        const shapePatch =
                          selectedObject.type === 'stickyNote'
                            ? {
                                shapeType: shapeOption.kind,
                                size: { ...DEFAULT_SHAPE_SIZES[shapeOption.kind] },
                              }
                            : {
                                shapeType: shapeOption.kind,
                              }
                        void patchObject(
                          selectedObject.id,
                          shapePatch,
                          { actionLabel: `changed ${selectedObject.type} shape to ${shapeOption.kind}` },
                        )
                      }}
                      title={`Set shape to ${shapeOption.label}`}
                      aria-label={`Set selected shape to ${shapeOption.label}`}
                    >
                      <span className="shape-icon" aria-hidden>
                        {shapeOption.kind === 'rectangle' ? <Square size={14} /> : null}
                        {shapeOption.kind === 'circle' ? <CircleShapeIcon size={14} /> : null}
                        {shapeOption.kind === 'diamond' ? <Diamond size={14} /> : null}
                        {shapeOption.kind === 'triangle' ? <Triangle size={14} /> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedObject.type === 'connector' ? (
                <div className="object-context-row" data-testid="connector-style-picker">
                  {CONNECTOR_STYLE_OPTIONS.map((option) => (
                    <button
                      key={`context-style-${selectedObject.id}-${option.value}`}
                      type="button"
                      className={`shape-option ${
                        normalizeConnectorStyle(selectedObject.style) === option.value ? 'active' : ''
                      }`}
                      onClick={() =>
                        void patchObject(selectedObject.id, {
                          style: option.value,
                        })
                      }
                      title={`Set connector style to ${option.label}`}
                      aria-label={`Set connector style to ${option.label}`}
                    >
                      <span className="shape-icon" aria-hidden>
                        {option.value === 'arrow' ? '→' : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="object-context-row">
                  <button
                    type="button"
                    className="button-icon button-icon-text"
                    onClick={() => void rotateSelectionBy(-ROTATION_STEP_DEGREES)}
                    title="Rotate selected left (Shift+R)"
                    aria-label="Rotate selected left"
                  >
                    -15°
                  </button>
                  <button
                    type="button"
                    className="button-icon button-icon-text"
                    onClick={() => void rotateSelectionBy(ROTATION_STEP_DEGREES)}
                    title="Rotate selected right (R)"
                    aria-label="Rotate selected right"
                  >
                    +15°
                  </button>
                </div>
              )}
              <div className="object-context-row" data-testid="object-color-picker">
                {selectedColorOptions.slice(0, 6).map((color) => (
                  <button
                    key={`context-color-${selectedObject.id}-${color}`}
                    type="button"
                    className={`swatch-button ${selectedObject.color === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => void applyColorToSelection(color)}
                    title={`Set color to ${getColorLabel(color)}`}
                    aria-label={`Set ${selectedObject.type} color to ${getColorLabel(color)}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {inlineEditor && inlineEditorLayout ? (
            <div className="inline-editor-layer">
              {inlineEditorLayout.multiline ? (
                <textarea
                  ref={inlineTextAreaRef}
                  className={`${inlineEditorAppearance?.className || 'inline-editor'} inline-editor-textarea`}
                  style={{
                    left: inlineEditorLayout.left,
                    top: inlineEditorLayout.top,
                    width: inlineEditorLayout.width,
                    height: inlineEditorLayout.height,
                    fontSize: inlineEditorLayout.fontSize,
                    transform: `rotate(${inlineEditorLayout.rotation}deg)`,
                    transformOrigin: `${inlineEditorLayout.transformOriginX}px ${inlineEditorLayout.transformOriginY}px`,
                    ...(inlineEditorAppearance?.style || {}),
                  }}
                  value={inlineEditor.value}
                  onChange={(event) =>
                    setInlineEditor((prev) =>
                      prev ? { ...prev, value: event.target.value } : prev,
                    )
                  }
                  onBlur={() => {
                    void commitInlineEdit()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelInlineEdit()
                      return
                    }
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      void commitInlineEdit()
                    }
                  }}
                />
              ) : (
                <input
                  ref={inlineInputRef}
                  className={`${inlineEditorAppearance?.className || 'inline-editor'} inline-editor-input`}
                  style={{
                    left: inlineEditorLayout.left,
                    top: inlineEditorLayout.top,
                    width: inlineEditorLayout.width,
                    height: inlineEditorLayout.height,
                    fontSize: inlineEditorLayout.fontSize,
                    transform: `rotate(${inlineEditorLayout.rotation}deg)`,
                    transformOrigin: `${inlineEditorLayout.transformOriginX}px ${inlineEditorLayout.transformOriginY}px`,
                    ...(inlineEditorAppearance?.style || {}),
                  }}
                  value={inlineEditor.value}
                  onChange={(event) =>
                    setInlineEditor((prev) =>
                      prev ? { ...prev, value: event.target.value } : prev,
                    )
                  }
                  onBlur={() => {
                    void commitInlineEdit()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelInlineEdit()
                      return
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitInlineEdit()
                    }
                  }}
                />
              )}
            </div>
          ) : null}
          <div className="zoom-controls">
            <button
              type="button"
              className="zoom-button with-tooltip"
              onClick={zoomIn}
              disabled={viewport.scale >= MAX_ZOOM_SCALE}
              title="Zoom in (Cmd/Ctrl +)"
              data-tooltip="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="zoom-fit-button with-tooltip"
              onClick={zoomToFit}
              title="Fit all objects (Cmd/Ctrl + Shift + F)"
              data-tooltip="Fit all objects"
              aria-label="Fit all objects"
            >
              Fit
            </button>
            <button
              type="button"
              className="zoom-percentage with-tooltip"
              onClick={zoomReset}
              title="Reset zoom to 100% (Cmd/Ctrl + 0)"
              data-tooltip="Reset zoom to 100%"
              aria-label="Reset zoom to 100%"
              data-testid="zoom-percentage"
            >
              {Math.round(viewport.scale * 100)}%
            </button>
            <button
              type="button"
              className="zoom-button with-tooltip"
              onClick={zoomOut}
              disabled={viewport.scale <= MIN_ZOOM_SCALE}
              title="Zoom out (Cmd/Ctrl -)"
              data-tooltip="Zoom out"
              aria-label="Zoom out"
            >
              -
            </button>
          </div>
          <div
            className="minimap with-tooltip"
            onClick={handleMinimapNavigate}
            title="Mini-map navigation"
            data-tooltip="Mini-map navigation"
            data-testid="minimap"
          >
            <div className="minimap-title">Mini-map</div>
            <div
              className="minimap-canvas"
              style={{ width: minimapModel.miniWidth, height: minimapModel.miniHeight }}
              data-testid="minimap-canvas"
            >
              {minimapModel.objects.map((item) => (
                <div
                  key={item.id}
                  className={`minimap-object ${selectedIdSet.has(item.id) ? 'selected' : ''}`}
                  style={{
                    left:
                      ((item.x - minimapModel.world.x) / minimapModel.world.width) *
                      minimapModel.miniWidth,
                    top:
                      ((item.y - minimapModel.world.y) / minimapModel.world.height) *
                      minimapModel.miniHeight,
                    width: Math.max(
                      3,
                      (item.width / minimapModel.world.width) * minimapModel.miniWidth,
                    ),
                    height: Math.max(
                      3,
                      (item.height / minimapModel.world.height) * minimapModel.miniHeight,
                    ),
                  }}
                />
              ))}
              <div
                className="minimap-viewport"
                style={{
                  left:
                    ((minimapModel.viewportWorld.x - minimapModel.world.x) / minimapModel.world.width) *
                    minimapModel.miniWidth,
                  top:
                    ((minimapModel.viewportWorld.y - minimapModel.world.y) / minimapModel.world.height) *
                    minimapModel.miniHeight,
                  width:
                    (minimapModel.viewportWorld.width / minimapModel.world.width) *
                    minimapModel.miniWidth,
                  height:
                    (minimapModel.viewportWorld.height / minimapModel.world.height) *
                    minimapModel.miniHeight,
                }}
                data-testid="minimap-viewport"
              />
            </div>
          </div>

        </section>

        <aside className="right-column">
          <div className="side-tabs">
            <button
              type="button"
              className={`side-tab-button ${showCommentsPanel ? 'active' : ''}`}
              onClick={() => {
                setShowCommentsPanel(true)
                setShowTimelinePanel(false)
              }}
              title="Show comments panel"
              aria-pressed={showCommentsPanel}
            >
              Comments
            </button>
            <button
              type="button"
              className={`side-tab-button ${showTimelinePanel ? 'active' : ''}`}
              onClick={() => {
                setShowCommentsPanel(false)
                setShowTimelinePanel(true)
              }}
              title="Show activity timeline"
              aria-pressed={showTimelinePanel}
            >
              Timeline
            </button>
            <button
              type="button"
              className={`side-tab-button ${!showCommentsPanel && !showTimelinePanel ? 'active' : ''}`}
              onClick={() => {
                setShowCommentsPanel(false)
                setShowTimelinePanel(false)
              }}
              title="Show AI assistant"
              aria-pressed={!showCommentsPanel && !showTimelinePanel}
            >
              AI
            </button>
          </div>
          {showCommentsPanel ? (
            <section className="side-panel comments-panel">
              <div className="side-panel-header">
                <h3>Comments</h3>
                {selectedObject ? <span className="value-badge">{selectedComments.length}</span> : null}
              </div>
              {selectedObject ? (
                <div className="side-panel-content">
                  <p className="panel-note">Online users: {onlineDisplayNames.join(', ') || 'none'}</p>
                  <div className="comments-list">
                    {selectedComments.length === 0 ? (
                      <p className="panel-note">No comments yet.</p>
                    ) : (
                      selectedComments
                        .slice()
                        .sort((left, right) => left.createdAt - right.createdAt)
                        .map((comment) => (
                          <article key={comment.id} className="comment-item">
                            <strong>{comment.createdByName}</strong>
                            <p>{comment.text}</p>
                          </article>
                        ))
                    )}
                  </div>
                  <textarea
                    className="ai-input comment-input"
                    placeholder="Add comment, mention teammates with @name"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <button type="button" className="primary-button" onClick={() => void addComment()}>
                    Add Comment
                  </button>
                </div>
              ) : (
                <p className="panel-note">Select an object to view and add comments.</p>
              )}
            </section>
          ) : null}

          {showTimelinePanel ? (
            <section className="side-panel timeline-panel">
              <div className="side-panel-header">
                <h3>Activity Timeline</h3>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void replayTimeline()}
                >
                  {isTimelineReplaying ? 'Stop' : 'Replay'}
                </button>
              </div>
              <div className="side-panel-content">
                <div className="timeline-list">
                  {timelineEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`timeline-item ${replayingEventId === event.id ? 'active' : ''}`}
                      onClick={() => {
                        if (event.targetId) {
                          setSelectedIds([event.targetId])
                        }
                      }}
                    >
                      <span className="timeline-item-actor">{event.actorName}</span>
                      <span className="timeline-item-action">{event.action}</span>
                      <span className="timeline-item-time">
                        {new Date(event.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  ))}
                  {timelineEvents.length === 0 ? <p className="panel-note">No activity yet.</p> : null}
                </div>
              </div>
            </section>
          ) : null}

          {!showCommentsPanel && !showTimelinePanel ? (
            <section className="side-panel ai-panel-sidebar">
              <AICommandPanel
                disabled={!user || !canEditBoard || !hasLiveBoardAccess}
                onSubmit={handleAiCommandSubmit}
                onIngestTextLines={ingestTextLinesAsStickies}
                history={aiCommandHistory}
              />
            </section>
          ) : null}
        </aside>
      </section>
      {showShortcuts ? (
        <div className="shortcut-modal-backdrop" onClick={() => setShowShortcuts(false)}>
          <section className="shortcut-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Keyboard Shortcuts</h3>
            <ul>
              <li>`Delete` or `Backspace`: delete selected object</li>
              <li>`Escape`: deselect all objects</li>
              <li>`Escape` in Box select mode: switch back to Pointer mode</li>
              <li>`Shift + Drag` (or Area tool): marquee multi-select</li>
              <li>`Cmd/Ctrl + A`: select all objects</li>
              <li>`Cmd/Ctrl + D`: duplicate selected object</li>
              <li>`Cmd/Ctrl + C`, `Cmd/Ctrl + V`: copy/paste selected object</li>
              <li>`Cmd/Ctrl + Z`: undo</li>
              <li>`Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y`: redo</li>
              <li>`Shift + E`: toggle view/edit mode</li>
              <li>`/`: open command palette</li>
              <li>`?`: open/close shortcuts panel</li>
            </ul>
            <button type="button" className="secondary-button" onClick={() => setShowShortcuts(false)}>
              Close
            </button>
          </section>
        </div>
      ) : null}
    </main>
  )
}
