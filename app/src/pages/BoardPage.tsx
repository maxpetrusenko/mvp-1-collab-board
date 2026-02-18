import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  collection,
  deleteDoc,
  doc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore'
import { onDisconnect, onValue, ref, remove, set, update } from 'firebase/database'

import { defaultBoardId, syncBackend } from '../config/env'
import { db, rtdb } from '../firebase/client'
import { stableColor } from '../lib/color'
import { useAuth } from '../state/AuthContext'
import { YjsPilotMirror } from '../collab/yjs'
import type {
  AnchorKind,
  BoardActivityEvent,
  BoardComment,
  BoardObject,
  ConnectorObject,
  CursorPresence,
  Point,
  ShapeKind,
} from '../types/board'
import { AICommandPanel } from '../components/AICommandPanel'

type Viewport = {
  x: number
  y: number
  scale: number
}

type LocalPositionOverride = {
  point: Point
  mode: 'dragging' | 'pending'
  updatedAt: number
}

type LocalConnectorOverride = {
  start: Point
  end: Point
  fromObjectId: string | null
  toObjectId: string | null
  fromAnchor: AnchorKind | null
  toAnchor: AnchorKind | null
  mode: 'dragging' | 'pending'
  updatedAt: number
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

type InlineEditorDraft = {
  objectId: string
  field: 'text' | 'title'
  value: string
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
const LOCAL_POSITION_PENDING_TTL_MS = 3_000
const CONNECTOR_SNAP_THRESHOLD_PX = 36
const CONNECTOR_HANDLE_RADIUS = 7
const TIMER_DEFAULT_MS = 5 * 60 * 1000
const PRESENCE_AWAY_THRESHOLD_MS = 25_000
const MIN_ZOOM_SCALE = 0.25
const MAX_ZOOM_SCALE = 3
const MAX_EXPORT_PIXEL_COUNT = 16_000_000
const MAX_PDF_EDGE_PX = 4_096
const aiApiBaseUrl = (import.meta.env.VITE_AI_API_BASE_URL || '').replace(/\/$/, '')
const aiCommandEndpoint = `${aiApiBaseUrl}/api/ai/command`
const STICKY_COLOR_OPTIONS = ['#fde68a', '#fdba74', '#fca5a5', '#86efac', '#93c5fd', '#c4b5fd']
const SHAPE_COLOR_OPTIONS = ['#93c5fd', '#67e8f9', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd']
const FRAME_COLOR_OPTIONS = ['#e2e8f0', '#dbeafe', '#dcfce7', '#fee2e2', '#fef3c7']
const CONNECTOR_COLOR_OPTIONS = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']
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
const SHAPE_TYPE_OPTIONS: Array<{ kind: ShapeKind; label: string; icon: string }> = [
  { kind: 'rectangle', label: 'Rect', icon: '▭' },
  { kind: 'circle', label: 'Circle', icon: '○' },
  { kind: 'diamond', label: 'Diamond', icon: '◇' },
  { kind: 'triangle', label: 'Triangle', icon: '△' },
]

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const positionsEqual = (left: Point, right: Point, epsilon = 0.5) =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon
const connectorBindingsEqual = (left: LocalConnectorOverride, right: ConnectorObject) =>
  (right.fromObjectId ?? null) === left.fromObjectId &&
  (right.toObjectId ?? null) === left.toObjectId &&
  (right.fromAnchor ?? null) === left.fromAnchor &&
  (right.toAnchor ?? null) === left.toAnchor
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
const getObjectBounds = (boardObject: BoardObject) => {
  if (boardObject.type === 'connector') {
    const minX = Math.min(boardObject.start.x, boardObject.end.x)
    const minY = Math.min(boardObject.start.y, boardObject.end.y)
    const maxX = Math.max(boardObject.start.x, boardObject.end.x)
    const maxY = Math.max(boardObject.start.y, boardObject.end.y)
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
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const notifyExportComplete = (detail: { format: 'png' | 'pdf'; scope: 'full' | 'selection'; fileBase: string }) => {
  window.dispatchEvent(new CustomEvent('board-export-complete', { detail }))
}
const getColorLabel = (color: string) => COLOR_LABELS[color.toLowerCase()] || color

export const BoardPage = () => {
  const { boardId: boardIdParam } = useParams()
  const { user, signOutUser } = useAuth()

  const boardId = boardIdParam || defaultBoardId

  const [objects, setObjects] = useState<BoardObject[]>([])
  const objectsRef = useRef<BoardObject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clipboardObject, setClipboardObject] = useState<BoardObject | null>(null)
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null)
  const [draggingConnectorId, setDraggingConnectorId] = useState<string | null>(null)
  const [localObjectPositions, setLocalObjectPositions] = useState<
    Record<string, LocalPositionOverride>
  >({})
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
  const [yjsPilotMetrics, setYjsPilotMetrics] = useState({ objects: 0, bytes: 0 })

  const [cursors, setCursors] = useState<Record<string, CursorPresence>>({})

  const stageRef = useRef<Konva.Stage | null>(null)
  const [stageSize, setStageSize] = useState({
    width: window.innerWidth,
    height: Math.max(320, window.innerHeight - BOARD_HEADER_HEIGHT),
  })
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 })

  const presenceRef = useRef<ReturnType<typeof ref> | null>(null)
  const lastCursorPublishAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof ref> | null>(null)
  const yjsPilotMirrorRef = useRef<YjsPilotMirror | null>(
    syncBackend === 'yjs-pilot' ? new YjsPilotMirror() : null,
  )

  const liveDragPositionsRef = useRef<Record<string, Point>>({})
  const connectorPublishersRef = useRef<Record<string, (patch: ConnectorPatch) => void>>({})
  const historyPastRef = useRef<HistoryEntry[]>([])
  const historyFutureRef = useRef<HistoryEntry[]>([])
  const isApplyingHistoryRef = useRef(false)
  const inlineTextAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const inlineInputRef = useRef<HTMLInputElement | null>(null)
  const frameDragSnapshotRef = useRef<
    Record<
      string,
      {
        frameStart: Point
        members: Array<{ id: string; start: Point }>
      }
    >
  >({})

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
    if (!db) return

    const objectsCollection = collection(db, 'boards', boardId, 'objects')
    const unsubscribe = onSnapshot(objectsCollection, (snapshot) => {
      const nextObjects: BoardObject[] = []

      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data() as Partial<BoardObject>

        if (!data.id || !data.type || !data.position || !data.size || data.deleted) {
          return
        }

        nextObjects.push(data as BoardObject)
      })

      nextObjects.sort((left, right) => left.zIndex - right.zIndex)
      objectsRef.current = nextObjects
      if (yjsPilotMirrorRef.current) {
        yjsPilotMirrorRef.current.replaceSnapshot(nextObjects)
        setYjsPilotMetrics({
          objects: nextObjects.length,
          bytes: yjsPilotMirrorRef.current.getEncodedByteLength(),
        })
      }

      // Don't update objects state if we're currently dragging one of them
      setObjects((prevObjects) => {
        if (draggingObjectId) {
          return nextObjects.map((obj) =>
            obj.id === draggingObjectId
              ? prevObjects.find((o) => o.id === draggingObjectId) || obj
              : obj
          )
        }
        return nextObjects
      })

      setLocalObjectPositions((prev) => {
        if (Object.keys(prev).length === 0) {
          return prev
        }

        const now = Date.now()
        const objectById = new Map(nextObjects.map((boardObject) => [boardObject.id, boardObject]))
        const next: Record<string, LocalPositionOverride> = {}
        let changed = false

        Object.entries(prev).forEach(([objectId, localOverride]) => {
          const serverObject = objectById.get(objectId)
          if (!serverObject) {
            changed = true
            return
          }

          if (positionsEqual(serverObject.position, localOverride.point)) {
            changed = true
            return
          }

          if (
            localOverride.mode === 'pending' &&
            now - localOverride.updatedAt > LOCAL_POSITION_PENDING_TTL_MS
          ) {
            changed = true
            return
          }

          if (localOverride.mode === 'dragging' && draggingObjectId !== objectId) {
            next[objectId] = {
              ...localOverride,
              mode: 'pending',
              updatedAt: now,
            }
            changed = true
            return
          }

          next[objectId] = localOverride
        })

        return changed ? next : prev
      })

      setLocalConnectorGeometry((prev) => {
        if (Object.keys(prev).length === 0) {
          return prev
        }

        const now = Date.now()
        const objectById = new Map(nextObjects.map((boardObject) => [boardObject.id, boardObject]))
        const next: Record<string, LocalConnectorOverride> = {}
        let changed = false

        Object.entries(prev).forEach(([objectId, localOverride]) => {
          const serverObject = objectById.get(objectId)
          if (!serverObject || serverObject.type !== 'connector') {
            changed = true
            return
          }

          if (
            positionsEqual(serverObject.start, localOverride.start) &&
            positionsEqual(serverObject.end, localOverride.end) &&
            connectorBindingsEqual(localOverride, serverObject)
          ) {
            changed = true
            return
          }

          if (
            localOverride.mode === 'pending' &&
            now - localOverride.updatedAt > LOCAL_POSITION_PENDING_TTL_MS
          ) {
            changed = true
            return
          }

          if (localOverride.mode === 'dragging' && draggingConnectorId !== objectId) {
            next[objectId] = {
              ...localOverride,
              mode: 'pending',
              updatedAt: now,
            }
            changed = true
            return
          }

          next[objectId] = localOverride
        })

        return changed ? next : prev
      })
    })

    return unsubscribe
  }, [boardId, draggingConnectorId, draggingObjectId])

  useEffect(() => {
    if (!rtdb) return

    const boardPresenceRef = ref(rtdb, `presence/${boardId}`)
    const unsubscribe = onValue(boardPresenceRef, (snapshot) => {
      const next = snapshot.val() as Record<string, CursorPresence> | null
      setCursors(next || {})
    })

    return () => unsubscribe()
  }, [boardId])

  useEffect(() => {
    if (!rtdb || !user) {
      return
    }

    const userPresenceRef = ref(rtdb, `presence/${boardId}/${user.uid}`)
    presenceRef.current = userPresenceRef

    void set(userPresenceRef, {
      boardId,
      userId: user.uid,
      displayName: user.displayName || user.email || 'Anonymous',
      color: stableColor(user.uid),
      x: 0,
      y: 0,
      lastSeen: Date.now(),
      connectionId: crypto.randomUUID(),
    } satisfies CursorPresence)

    const disconnectHandler = onDisconnect(userPresenceRef)
    void disconnectHandler.remove()

    return () => {
      presenceRef.current = null
      void remove(userPresenceRef)
    }
  }, [boardId, user])

  useEffect(() => {
    if (!presenceRef.current) {
      return
    }

    const heartbeat = window.setInterval(() => {
      if (!presenceRef.current) {
        return
      }
      void update(presenceRef.current, { lastSeen: Date.now() })
    }, 10_000)

    return () => window.clearInterval(heartbeat)
  }, [boardId, user])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMsValue(Date.now())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!rtdb) {
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
  }, [boardId])

  useEffect(() => {
    if (!db) {
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
  }, [boardId])

  const pushHistory = useCallback((entry: HistoryEntry) => {
    historyPastRef.current = [...historyPastRef.current.slice(-199), entry]
    historyFutureRef.current = []
  }, [])

  const logActivity = useCallback(
    async (entry: Omit<BoardActivityEvent, 'id' | 'boardId' | 'createdAt'>) => {
      if (!db) {
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
    [boardId],
  )

  const selectedObject = useMemo(
    () => objects.find((boardObject) => boardObject.id === selectedId) || null,
    [objects, selectedId],
  )
  const onlineDisplayNames = useMemo(
    () =>
      Object.values(cursors)
        .map((cursor) => cursor.displayName)
        .sort((left, right) => left.localeCompare(right)),
    [cursors],
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

    return CONNECTOR_COLOR_OPTIONS
  }, [selectedObject])
  const selectedComments = selectedObject?.comments || []
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

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'stickyNote') {
      const inset = 8 * viewport.scale
      return {
        left: objectLeft + inset,
        top: objectTop + inset,
        width: Math.max(120, inlineEditorTarget.size.width * viewport.scale - inset * 2),
        height: Math.max(48, inlineEditorTarget.size.height * viewport.scale - inset * 2),
        fontSize: Math.max(12, 16 * viewport.scale),
        multiline: true,
      }
    }

    if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
      const inset = 10 * viewport.scale
      return {
        left: objectLeft + inset,
        top: objectTop + inset,
        width: Math.max(120, inlineEditorTarget.size.width * viewport.scale - inset * 2),
        height: Math.max(36, inlineEditorTarget.size.height * viewport.scale - inset * 2),
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: true,
      }
    }

    if (inlineEditor.field === 'title' && inlineEditorTarget.type === 'frame') {
      return {
        left: objectLeft + 10 * viewport.scale,
        top: objectTop + 6 * viewport.scale,
        width: Math.max(160, inlineEditorTarget.size.width * viewport.scale - 20 * viewport.scale),
        height: Math.max(24, 24 * viewport.scale),
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: false,
      }
    }

    return null
  }, [
    inlineEditor,
    inlineEditorTarget,
    localObjectPositions,
    viewport.scale,
    viewport.x,
    viewport.y,
  ])
  const minimapModel = useMemo(() => {
    const miniWidth = 220
    const miniHeight = 140
    const bounds = objects.map((boardObject) => getObjectBounds(boardObject))
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
  }, [objects, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y])
  const startInlineEdit = useCallback((boardObject: BoardObject, field: InlineEditorDraft['field']) => {
    if (field === 'text' && boardObject.type !== 'stickyNote' && boardObject.type !== 'shape') {
      return
    }
    if (field === 'title' && boardObject.type !== 'frame') {
      return
    }

    setSelectedId(boardObject.id)
    setInlineEditor({
      objectId: boardObject.id,
      field,
      value:
        field === 'text' && (boardObject.type === 'stickyNote' || boardObject.type === 'shape')
          ? boardObject.text || ''
          : boardObject.type === 'frame'
            ? boardObject.title || 'Frame'
            : '',
    })
  }, [])
  const cancelInlineEdit = useCallback(() => {
    setInlineEditor(null)
  }, [])

  const createObject = useCallback(
    async (
      objectType: 'stickyNote' | 'shape' | 'frame' | 'connector',
      options?: {
        shapeType?: ShapeKind
        title?: string
      },
    ) => {
      if (!db || !user) {
        return
      }

      const id = crypto.randomUUID()
      const now = Date.now()
      const currentZIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )

      const centerPosition = {
        x: (-viewport.x + stageSize.width / 2) / viewport.scale,
        y: (-viewport.y + stageSize.height / 2) / viewport.scale,
      }

      const shapeType = normalizeShapeKind(options?.shapeType)
      const connectorStart = {
        x: centerPosition.x - 80,
        y: centerPosition.y,
      }
      const connectorEnd = {
        x: centerPosition.x + 120,
        y: centerPosition.y + 40,
      }
      const connectorBounds = toConnectorBounds(connectorStart, connectorEnd)
      const size =
        objectType === 'shape' || objectType === 'stickyNote'
          ? DEFAULT_SHAPE_SIZES[shapeType]
          : objectType === 'frame'
            ? DEFAULT_FRAME_SIZE
          : objectType === 'connector'
            ? connectorBounds.size
            : DEFAULT_SHAPE_SIZES.rectangle
      const position = objectType === 'connector' ? connectorBounds.position : centerPosition

      const base = {
        id,
        boardId,
        position,
        size: { ...size },
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
              color: STICKY_COLOR_OPTIONS[0],
              text: 'New sticky note',
            }
          : objectType === 'shape'
            ? {
                ...base,
                type: 'shape',
                shapeType,
                color: SHAPE_COLOR_OPTIONS[0],
                text: 'New shape',
              }
            : objectType === 'frame'
              ? {
                  ...base,
                  type: 'frame',
                  color: FRAME_COLOR_OPTIONS[0],
                  title: options?.title || 'New Frame',
                }
            : {
                ...base,
                type: 'connector',
                color: CONNECTOR_COLOR_OPTIONS[0],
                start: connectorStart,
                end: connectorEnd,
                fromObjectId: null,
                toObjectId: null,
                fromAnchor: null,
                toAnchor: null,
              }

      await setDoc(doc(db, 'boards', boardId, 'objects', id), nextObject)
      pushHistory({ type: 'create', object: nextObject })
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `created ${nextObject.type}`,
        targetId: nextObject.id,
        targetType: nextObject.type,
      })
      setSelectedId(id)
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
    ],
  )

  const patchObject = useCallback(
    async (
      objectId: string,
      patch: Partial<BoardObject>,
      options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
    ) => {
      if (!db || !user) {
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

      await setDoc(
        doc(db, 'boards', boardId, 'objects', objectId),
        {
          ...patch,
          updatedAt: Date.now(),
          updatedBy: user.uid,
          version: currentObject.version + 1,
        },
        { merge: true },
      )

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
    },
    [boardId, logActivity, pushHistory, user],
  )
  const commitInlineEdit = useCallback(async () => {
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

    if (inlineEditor.field === 'title' && boardObject.type === 'frame') {
      const nextTitle = inlineEditor.value.trim() || 'Frame'
      if (nextTitle !== boardObject.title) {
        await patchObject(boardObject.id, { title: nextTitle })
      }
    }

    setInlineEditor(null)
  }, [inlineEditor, patchObject])

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
        inlineEditorTarget.type !== 'shape') ||
      (inlineEditor.field === 'title' && inlineEditorTarget.type !== 'frame')
    ) {
      setInlineEditor(null)
      return
    }
  }, [inlineEditor, inlineEditorTarget])

  const deleteSelected = useCallback(async () => {
    if (!db || !selectedObject || !user) {
      return
    }

    if (!isApplyingHistoryRef.current) {
      pushHistory({ type: 'delete', object: selectedObject })
    }
    await deleteDoc(doc(db, 'boards', boardId, 'objects', selectedObject.id))
    void logActivity({
      actorId: user.uid,
      actorName: user.displayName || user.email || 'Anonymous',
      action: `deleted ${selectedObject.type}`,
      targetId: selectedObject.id,
      targetType: selectedObject.type,
    })
    setLocalObjectPositions((prev) => {
      if (!prev[selectedObject.id]) {
        return prev
      }
      const next = { ...prev }
      delete next[selectedObject.id]
      return next
    })
    setLocalConnectorGeometry((prev) => {
      if (!prev[selectedObject.id]) {
        return prev
      }
      const next = { ...prev }
      delete next[selectedObject.id]
      return next
    })
    setSelectedId(null)
  }, [boardId, logActivity, pushHistory, selectedObject, user])

  const duplicateObject = useCallback(
    async (source: BoardObject) => {
      if (!db || !user) {
        return
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
              zIndex: zIndex + 1,
              createdBy: user.uid,
              updatedBy: user.uid,
              createdAt: now,
              updatedAt: now,
              version: 1,
            }
          : {
              ...source,
              id,
              position: {
                x: source.position.x + 24,
                y: source.position.y + 24,
              },
              zIndex: zIndex + 1,
              createdBy: user.uid,
              updatedBy: user.uid,
              createdAt: now,
              updatedAt: now,
              version: 1,
      }

      await setDoc(doc(db, 'boards', boardId, 'objects', id), duplicate)
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
      setSelectedId(id)
    },
    [boardId, logActivity, pushHistory, user],
  )

  const applyHistoryEntry = useCallback(
    async (entry: HistoryEntry, direction: 'undo' | 'redo') => {
      if (!db || !user) {
        return
      }

      isApplyingHistoryRef.current = true
      try {
        if (entry.type === 'create') {
          if (direction === 'undo') {
            await deleteDoc(doc(db, 'boards', boardId, 'objects', entry.object.id))
          } else {
            await setDoc(doc(db, 'boards', boardId, 'objects', entry.object.id), entry.object)
          }
          setSelectedId(entry.object.id)
        } else if (entry.type === 'delete') {
          if (direction === 'undo') {
            await setDoc(doc(db, 'boards', boardId, 'objects', entry.object.id), entry.object)
          } else {
            await deleteDoc(doc(db, 'boards', boardId, 'objects', entry.object.id))
          }
          setSelectedId(entry.object.id)
        } else if (entry.type === 'patch') {
          await patchObject(entry.objectId, direction === 'undo' ? entry.before : entry.after, {
            recordHistory: false,
            logEvent: false,
          })
          setSelectedId(entry.objectId)
        }
      } finally {
        isApplyingHistoryRef.current = false
      }
    },
    [boardId, patchObject, user],
  )

  const undo = useCallback(async () => {
    const entry = historyPastRef.current.at(-1)
    if (!entry) {
      return
    }

    historyPastRef.current = historyPastRef.current.slice(0, -1)
    historyFutureRef.current = [...historyFutureRef.current, entry]
    await applyHistoryEntry(entry, 'undo')
  }, [applyHistoryEntry])

  const redo = useCallback(async () => {
    const entry = historyFutureRef.current.at(-1)
    if (!entry) {
      return
    }

    historyFutureRef.current = historyFutureRef.current.slice(0, -1)
    historyPastRef.current = [...historyPastRef.current, entry]
    await applyHistoryEntry(entry, 'redo')
  }, [applyHistoryEntry])

  const applyViewportScaleFromCenter = useCallback(
    (nextScale: number) => {
      const clampedScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE)
      const center = {
        x: stageSize.width / 2,
        y: stageSize.height / 2,
      }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale

      setViewport({
        scale: clampedScale,
        x: center.x - worldX * clampedScale,
        y: center.y - worldY * clampedScale,
      })
    },
    [stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y],
  )

  const zoomIn = useCallback(() => {
    applyViewportScaleFromCenter(viewport.scale * 1.25)
  }, [applyViewportScaleFromCenter, viewport.scale])

  const zoomOut = useCallback(() => {
    applyViewportScaleFromCenter(viewport.scale / 1.25)
  }, [applyViewportScaleFromCenter, viewport.scale])

  const zoomReset = useCallback(() => {
    applyViewportScaleFromCenter(1)
  }, [applyViewportScaleFromCenter])

  const zoomToFit = useCallback(() => {
    if (objects.length === 0) {
      zoomReset()
      return
    }

    const padding = 48
    const bounds = objects.map((boardObject) => getObjectBounds(boardObject))
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

    setViewport({
      scale: fitScale,
      x: stageSize.width / 2 - (minX + width / 2) * fitScale,
      y: stageSize.height / 2 - (minY + height / 2) * fitScale,
    })
  }, [objects, stageSize.height, stageSize.width, zoomReset])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const isMetaCombo = event.metaKey || event.ctrlKey

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedObject) {
        event.preventDefault()
        void deleteSelected()
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'd' && selectedObject) {
        event.preventDefault()
        void duplicateObject(selectedObject)
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'c' && selectedObject) {
        event.preventDefault()
        setClipboardObject(selectedObject)
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'v' && clipboardObject) {
        event.preventDefault()
        void duplicateObject(clipboardObject)
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        void redo()
        return
      }

      const keyLower = event.key.toLowerCase()
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
  }, [clipboardObject, deleteSelected, duplicateObject, redo, selectedObject, undo, zoomIn, zoomOut, zoomReset, zoomToFit])

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

  const toggleVoteOnSticky = useCallback(
    (stickyObject: BoardObject) => {
      if (!user || stickyObject.type !== 'stickyNote') {
        return
      }

      const nextVotes = { ...(stickyObject.votesByUser || {}) }
      if (nextVotes[user.uid]) {
        delete nextVotes[user.uid]
      } else {
        nextVotes[user.uid] = true
      }

      void patchObject(
        stickyObject.id,
        { votesByUser: nextVotes },
        { actionLabel: `voted on sticky` },
      )
    },
    [patchObject, user],
  )

  const addComment = useCallback(async () => {
    if (!selectedObject || !user) {
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
  }, [commentDraft, patchObject, selectedObject, user])

  const ingestTextLinesAsStickies = useCallback(
    async (lines: string[]) => {
      const activeDb = db
      if (!activeDb || !user) {
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

      await Promise.all(
        stickies.map((sticky) => setDoc(doc(activeDb, 'boards', boardId, 'objects', sticky.id), sticky)),
      )
      stickies.forEach((sticky) => pushHistory({ type: 'create', object: sticky }))
      if (stickies[0]) {
        setSelectedId(stickies[0].id)
      }
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `imported ${stickies.length} OCR stickies`,
        targetId: stickies[0]?.id || null,
        targetType: stickies[0]?.type || null,
      })
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
    ],
  )

  const replayTimeline = useCallback(async () => {
    if (isTimelineReplaying) {
      return
    }

    const ordered = [...activityEvents].sort((left, right) => left.createdAt - right.createdAt).slice(-25)
    if (ordered.length === 0) {
      return
    }

    setIsTimelineReplaying(true)
    for (const event of ordered) {
      if (event.targetId) {
        setSelectedId(event.targetId)
      }
      await wait(260)
    }
    setIsTimelineReplaying(false)
  }, [activityEvents, isTimelineReplaying])

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
        const resolvedBounds = objects.map((boardObject) => getObjectBounds(boardObject))
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
    [objects, stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y],
  )

  const handleStickySelection = useCallback(
    (boardObject: BoardObject) => {
      if (isVotingMode && boardObject.type === 'stickyNote') {
        toggleVoteOnSticky(boardObject)
        return
      }

      setSelectedId(boardObject.id)
    },
    [isVotingMode, toggleVoteOnSticky],
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

      setViewport((prev) => ({
        ...prev,
        x: stageSize.width / 2 - worldX * prev.scale,
        y: stageSize.height / 2 - worldY * prev.scale,
      }))
    },
    [minimapModel.miniHeight, minimapModel.miniWidth, minimapModel.world.height, minimapModel.world.width, minimapModel.world.x, minimapModel.world.y, stageSize.height, stageSize.width],
  )

  const publishCursorPosition = useCallback((point: Point) => {
    const now = Date.now()
    if (now - lastCursorPublishAtRef.current < 50) {
      return
    }

    lastCursorPublishAtRef.current = now
    if (!presenceRef.current) {
      return
    }

    void update(presenceRef.current, {
      x: point.x,
      y: point.y,
    })
  }, [])

  const handleAiCommandSubmit = async (command: string) => {
    if (!user) {
      throw new Error('Sign in required')
    }

    const idToken = await user.getIdToken()
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
      | { error?: string; result?: { message?: string } }
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

    return payload?.result?.message
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

  return (
    <main className="board-shell">
      <header className="board-header">
        <div className="board-header-left">
          <h1>CollabBoard</h1>
          <span
            className={`sync-mode-pill ${syncBackend === 'yjs-pilot' ? 'sync-mode-pill-pilot' : ''}`}
            title={
              syncBackend === 'yjs-pilot'
                ? `Yjs pilot mirror active (${yjsPilotMetrics.objects} objects, ${yjsPilotMetrics.bytes} bytes)`
                : 'Firebase LWW sync mode'
            }
            data-testid="sync-mode-pill"
          >
            {syncBackend === 'yjs-pilot' ? 'Yjs Pilot' : 'Firebase LWW'}
          </span>
          <div className="timer-widget">
            <span className="timer-icon">⏱</span>
            <span>{formatTimerLabel(effectiveTimerMs)}</span>
            {timerState.running ? (
              <button
                type="button"
                className="button-icon with-tooltip"
                onClick={() => void pauseTimer()}
                title="Pause timer"
                data-tooltip="Pause timer"
              >
                ⏸
              </button>
            ) : (
              <button
                type="button"
                className="button-icon with-tooltip"
                onClick={() => void startTimer()}
                title="Start timer"
                data-tooltip="Start timer"
              >
                ▶
              </button>
            )}
            <button
              type="button"
              className="button-icon with-tooltip"
              onClick={() => void resetTimer()}
              title="Reset timer"
              data-tooltip="Reset timer"
            >
              ↺
            </button>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => setShowShortcuts((prev) => !prev)}
            title="Keyboard shortcuts (?)"
            data-tooltip="Keyboard shortcuts"
          >
            ?
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void signOutUser()}
            title="Sign out"
            data-tooltip="Sign out"
          >
            →
          </button>
        </div>
      </header>

      {/* Floating Toolbar */}
      <div className="floating-toolbar">
        <div className="tool-group">
          <button
            type="button"
            className="button-icon button-primary with-tooltip"
            onClick={() => void createObject('stickyNote')}
            title="Add sticky note (S)"
            data-tooltip="Add sticky note (S)"
          >
            ◻
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void createObject('frame')}
            title="Add frame (F)"
            data-tooltip="Add frame (F)"
          >
            ⛶
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void createObject('connector')}
            title="Add connector (C)"
            data-tooltip="Add connector (C)"
          >
            ↝
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void undo()}
            title="Undo (Cmd+Z)"
            data-tooltip="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => void redo()}
            title="Redo (Cmd+Shift+Z)"
            data-tooltip="Redo"
          >
            ↷
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button
            type="button"
            className={`button-icon with-tooltip ${isVotingMode ? 'button-primary' : ''}`}
            onClick={() => setIsVotingMode((prev) => !prev)}
            title="Toggle voting mode (V)"
            data-tooltip={isVotingMode ? 'Disable voting mode' : 'Enable voting mode'}
            aria-label="Toggle voting mode"
          >
            {isVotingMode ? '●' : '○'}
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
            ⬇
          </button>
          <button
            type="button"
            className="button-icon button-icon-text with-tooltip"
            data-testid="export-viewport-pdf"
            onClick={() => void exportBoard('pdf', 'selection')}
            title="Export current viewport as PDF"
            data-tooltip="Export current viewport as PDF"
            aria-label="Export current viewport as PDF"
          >
            PDF
          </button>
          <button
            type="button"
            className="button-icon with-tooltip"
            onClick={() => {
              if (selectedObject) {
                void deleteSelected()
              }
            }}
            disabled={!selectedObject}
            title="Delete selected (Del/Backspace)"
            data-tooltip="Delete selected object"
            aria-label="Delete selected object"
          >
            ✕
          </button>
        </div>

        {/* Selected object color options */}
        {selectedObject && (
          <>
            {selectedObject.type === 'shape' || selectedObject.type === 'stickyNote' ? (
              <>
                <div className="toolbar-divider" />
                <div className="tool-group" data-testid="shape-type-picker">
                  {SHAPE_TYPE_OPTIONS.map((shapeOption) => (
                    <button
                      key={`${selectedObject.id}-${shapeOption.kind}`}
                      type="button"
                      className={`shape-option with-tooltip ${
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
                      data-tooltip={`Set shape to ${shapeOption.label}`}
                      aria-label={`Set selected shape to ${shapeOption.label}`}
                    >
                      <span className="shape-icon">{shapeOption.icon}</span>
                      {shapeOption.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <div className="toolbar-divider" />
            <div className="tool-group">
              {selectedColorOptions.slice(0, 6).map((color) => (
                <button
                  key={`${selectedObject.id}-${color}`}
                  type="button"
                  className={`swatch-button with-tooltip ${selectedObject.color === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => void patchObject(selectedObject.id, { color })}
                  title={`Set color to ${getColorLabel(color)}`}
                  data-tooltip={`Set color to ${getColorLabel(color)}`}
                  aria-label={`Set ${selectedObject.type} color to ${color}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <section className="board-content">
        <section className="canvas-column">
          <div className="presence-strip">
            {Object.values(cursors).map((cursor) => (
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
            className="board-stage"
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            draggable
            onDragEnd={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }

              const stage = stageRef.current
              if (!stage) {
                return
              }

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
              const oldScale = viewport.scale
              const nextScale = clamp(
                event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy,
                MIN_ZOOM_SCALE,
                MAX_ZOOM_SCALE,
              )

              const worldX = (pointer.x - viewport.x) / oldScale
              const worldY = (pointer.y - viewport.y) / oldScale

              setViewport({
                scale: nextScale,
                x: pointer.x - worldX * nextScale,
                y: pointer.y - worldY * nextScale,
              })
            }}
            onMouseMove={(event) => {
              const stage = event.target.getStage()
              const pointer = stage?.getPointerPosition()
              if (!pointer) {
                return
              }

              publishCursorPosition({
                x: (pointer.x - viewport.x) / viewport.scale,
                y: (pointer.y - viewport.y) / viewport.scale,
              })
            }}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) {
                setSelectedId(null)
              }
            }}
          >
            <Layer listening={false}>
              <Rect x={-10000} y={-10000} width={20000} height={20000} fill="#f8fafc" />
            </Layer>

            <Layer>
              {objects.map((boardObject) => {
                const selected = boardObject.id === selectedId
                // Prefer in-flight drag ref to avoid controlled drag jitter on re-render.
                const position =
                  liveDragPositionsRef.current[boardObject.id] ||
                  localObjectPositions[boardObject.id]?.point || boardObject.position

                if (boardObject.type === 'stickyNote') {
                  const shapeType = normalizeShapeKind(boardObject.shapeType)
                  const strokeColor = selected ? '#1d4ed8' : '#0f172a'
                  const strokeWidth = selected ? 2 : 1
                  const voteCount = Object.keys(boardObject.votesByUser || {}).length
                  const commentCount = boardObject.comments?.length || 0
                  return (
                    <Group
                      key={boardObject.id}
                      x={position.x}
                      y={position.y}
                      draggable
                      onClick={() => handleStickySelection(boardObject)}
                      onTap={() => handleStickySelection(boardObject)}
                      onDblClick={() => {
                        startInlineEdit(boardObject, 'text')
                      }}
                      onDragStart={(event) => {
                        // Store actual Konva position to avoid jumps if ref has stale data
                        liveDragPositionsRef.current[boardObject.id] = { x: event.target.x(), y: event.target.y() }
                        setDraggingObjectId(boardObject.id)
                      }}
                      onDragMove={(event) => {
                        const newPos = { x: event.target.x(), y: event.target.y() }
                        liveDragPositionsRef.current[boardObject.id] = newPos
                      }}
                      onDragEnd={(event) => {
                        const finalPos = { x: event.target.x(), y: event.target.y() }
                        delete liveDragPositionsRef.current[boardObject.id]
                        setLocalObjectPositions((prev) => ({
                          ...prev,
                          [boardObject.id]: {
                            point: finalPos,
                            mode: 'pending',
                            updatedAt: Date.now(),
                          },
                        }))
                        setDraggingObjectId(null)
                        void patchObject(boardObject.id, { position: finalPos }, { actionLabel: 'moved sticky' })
                      }}
                    >
                      {shapeType === 'circle' ? (
                        <Circle
                          x={boardObject.size.width / 2}
                          y={boardObject.size.height / 2}
                          radius={Math.min(boardObject.size.width, boardObject.size.height) / 2}
                          fill={boardObject.color}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          shadowBlur={6}
                          shadowOpacity={0.2}
                        />
                      ) : null}
                      {shapeType === 'diamond' ? (
                        <Line
                          points={[
                            boardObject.size.width / 2,
                            0,
                            boardObject.size.width,
                            boardObject.size.height / 2,
                            boardObject.size.width / 2,
                            boardObject.size.height,
                            0,
                            boardObject.size.height / 2,
                          ]}
                          closed
                          fill={boardObject.color}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          lineJoin="round"
                          shadowBlur={6}
                          shadowOpacity={0.2}
                        />
                      ) : null}
                      {shapeType === 'triangle' ? (
                        <Line
                          points={[
                            boardObject.size.width / 2,
                            0,
                            boardObject.size.width,
                            boardObject.size.height,
                            0,
                            boardObject.size.height,
                          ]}
                          closed
                          fill={boardObject.color}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          lineJoin="round"
                          shadowBlur={6}
                          shadowOpacity={0.2}
                        />
                      ) : null}
                      {shapeType === 'rectangle' ? (
                        <Rect
                          width={boardObject.size.width}
                          height={boardObject.size.height}
                          fill={boardObject.color}
                          cornerRadius={8}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          shadowBlur={6}
                          shadowOpacity={0.2}
                        />
                      ) : null}
                      <Text
                        text={boardObject.text}
                        x={shapeType === 'rectangle' ? 8 : 12}
                        y={shapeType === 'rectangle' ? 8 : 10}
                        width={Math.max(40, boardObject.size.width - (shapeType === 'rectangle' ? 16 : 24))}
                        height={Math.max(24, boardObject.size.height - (shapeType === 'rectangle' ? 16 : 20))}
                        fontSize={shapeType === 'rectangle' ? 16 : 14}
                        fill="#0f172a"
                        wrap="word"
                        align={shapeType === 'rectangle' ? 'left' : 'center'}
                        verticalAlign={shapeType === 'rectangle' ? 'top' : 'middle'}
                      />
                      {voteCount > 0 ? (
                        <>
                          <Circle x={boardObject.size.width - 16} y={16} radius={11} fill="#1d4ed8" />
                          <Text
                            text={String(voteCount)}
                            x={boardObject.size.width - 21}
                            y={10}
                            width={10}
                            align="center"
                            fontSize={11}
                            fill="#ffffff"
                          />
                        </>
                      ) : null}
                      {commentCount > 0 ? (
                        <Text
                          text={`C ${commentCount}`}
                          x={8}
                          y={boardObject.size.height - 20}
                          fontSize={11}
                          fill="#334155"
                        />
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
                  const connectorStroke = selected ? '#1d4ed8' : boardObject.color

                  return (
                    <Group
                      key={boardObject.id}
                      onClick={() => setSelectedId(boardObject.id)}
                      onTap={() => setSelectedId(boardObject.id)}
                    >
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
                        strokeWidth={selected ? 3 : 2}
                        lineCap="round"
                        lineJoin="round"
                        hitStrokeWidth={16}
                      />
                      {selected ? (
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
                                  updatedAt: Date.now(),
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
                                  updatedAt: Date.now(),
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
                                  updatedAt: Date.now(),
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
                                  updatedAt: Date.now(),
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
                  const frameStroke = selected ? '#1d4ed8' : '#334155'
                  return (
                    <Group
                      key={boardObject.id}
                      x={position.x}
                      y={position.y}
                      draggable
                      onClick={() => setSelectedId(boardObject.id)}
                      onTap={() => setSelectedId(boardObject.id)}
                      onDblClick={() => {
                        startInlineEdit(boardObject, 'title')
                      }}
                      onDragStart={(event) => {
                        // Store actual Konva position to avoid jumps if ref has stale data
                        liveDragPositionsRef.current[boardObject.id] = { x: event.target.x(), y: event.target.y() }
                        setDraggingObjectId(boardObject.id)
                        const bounds = {
                          left: event.target.x(),
                          top: event.target.y(),
                          right: event.target.x() + boardObject.size.width,
                          bottom: event.target.y() + boardObject.size.height,
                        }
                        const members = objectsRef.current
                          .filter((candidate) => candidate.id !== boardObject.id && candidate.type !== 'connector')
                          .filter((candidate) => {
                            const candidatePos = localObjectPositions[candidate.id]?.point || candidate.position
                            const centerX = candidatePos.x + candidate.size.width / 2
                            const centerY = candidatePos.y + candidate.size.height / 2
                            return (
                              centerX >= bounds.left &&
                              centerX <= bounds.right &&
                              centerY >= bounds.top &&
                              centerY <= bounds.bottom
                            )
                          })
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
                        const finalFramePos = { x: event.target.x(), y: event.target.y() }
                        const snapshot = frameDragSnapshotRef.current[boardObject.id]
                        delete liveDragPositionsRef.current[boardObject.id]
                        const nextLocal: Record<string, LocalPositionOverride> = {
                          [boardObject.id]: {
                            point: finalFramePos,
                            mode: 'pending',
                            updatedAt: Date.now(),
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
                              updatedAt: Date.now(),
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
                        width={boardObject.size.width}
                        height={boardObject.size.height}
                        fill={boardObject.color}
                        opacity={0.25}
                        stroke={frameStroke}
                        strokeWidth={selected ? 2 : 1}
                        dash={[8, 6]}
                        cornerRadius={12}
                      />
                      <Rect
                        width={boardObject.size.width}
                        height={32}
                        fill={boardObject.color}
                        opacity={0.9}
                        cornerRadius={[12, 12, 0, 0]}
                      />
                      <Text
                        text={boardObject.title || 'Frame'}
                        x={10}
                        y={8}
                        width={boardObject.size.width - 20}
                        fontSize={14}
                        fontStyle="bold"
                        fill="#0f172a"
                      />
                    </Group>
                  )
                }

                const shapeType = normalizeShapeKind(boardObject.shapeType)
                const strokeColor = selected ? '#1d4ed8' : '#0f172a'
                const strokeWidth = selected ? 2 : 1

                return (
                  <Group
                    key={boardObject.id}
                    x={position.x}
                    y={position.y}
                    draggable
                    onClick={() => setSelectedId(boardObject.id)}
                    onTap={() => setSelectedId(boardObject.id)}
                    onDblClick={() => {
                      startInlineEdit(boardObject, 'text')
                    }}
                    onDragStart={(event) => {
                      // Store actual Konva position to avoid jumps if ref has stale data
                      liveDragPositionsRef.current[boardObject.id] = { x: event.target.x(), y: event.target.y() }
                      setDraggingObjectId(boardObject.id)
                    }}
                    onDragMove={(event) => {
                      const newPos = { x: event.target.x(), y: event.target.y() }
                      liveDragPositionsRef.current[boardObject.id] = newPos
                    }}
                    onDragEnd={(event) => {
                      const finalPos = { x: event.target.x(), y: event.target.y() }
                      delete liveDragPositionsRef.current[boardObject.id]
                      setLocalObjectPositions((prev) => ({
                        ...prev,
                        [boardObject.id]: {
                          point: finalPos,
                          mode: 'pending',
                          updatedAt: Date.now(),
                        },
                      }))
                      setDraggingObjectId(null)
                      void patchObject(boardObject.id, { position: finalPos }, { actionLabel: 'moved shape' })
                    }}
                  >
                    {shapeType === 'circle' ? (
                      <Circle
                        x={boardObject.size.width / 2}
                        y={boardObject.size.height / 2}
                        radius={Math.min(boardObject.size.width, boardObject.size.height) / 2}
                        fill={boardObject.color}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        shadowBlur={6}
                        shadowOpacity={0.2}
                      />
                    ) : null}
                    {shapeType === 'diamond' ? (
                      <Line
                        points={[
                          boardObject.size.width / 2,
                          0,
                          boardObject.size.width,
                          boardObject.size.height / 2,
                          boardObject.size.width / 2,
                          boardObject.size.height,
                          0,
                          boardObject.size.height / 2,
                        ]}
                        closed
                        fill={boardObject.color}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        lineJoin="round"
                        shadowBlur={6}
                        shadowOpacity={0.2}
                      />
                    ) : null}
                    {shapeType === 'triangle' ? (
                      <Line
                        points={[
                          boardObject.size.width / 2,
                          0,
                          boardObject.size.width,
                          boardObject.size.height,
                          0,
                          boardObject.size.height,
                        ]}
                        closed
                        fill={boardObject.color}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        lineJoin="round"
                        shadowBlur={6}
                        shadowOpacity={0.2}
                      />
                    ) : null}
                    {shapeType === 'rectangle' ? (
                      <Rect
                        width={boardObject.size.width}
                        height={boardObject.size.height}
                        fill={boardObject.color}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        cornerRadius={8}
                        shadowBlur={6}
                        shadowOpacity={0.2}
                      />
                    ) : null}
                    {boardObject.text ? (
                      <Text
                        text={boardObject.text}
                        x={12}
                        y={10}
                        width={Math.max(40, boardObject.size.width - 24)}
                        height={Math.max(24, boardObject.size.height - 20)}
                        fontSize={14}
                        align="center"
                        verticalAlign="middle"
                        fill="#0f172a"
                        wrap="word"
                      />
                    ) : null}
                  </Group>
                )
              })}
            </Layer>

            <Layer listening={false}>
              {Object.values(cursors)
                .filter((cursor) => cursor.userId !== user.uid)
                .map((cursor) => (
                  <Group key={cursor.userId} x={cursor.x} y={cursor.y}>
                    <Circle radius={5} fill={cursor.color} />
                    <Rect x={8} y={-12} width={120} height={20} fill={cursor.color} cornerRadius={4} />
                    <Text x={12} y={-9} text={cursor.displayName} fontSize={11} fill="#ffffff" />
                  </Group>
                ))}
            </Layer>
          </Stage>
          {inlineEditor && inlineEditorLayout ? (
            <div className="inline-editor-layer">
              {inlineEditorLayout.multiline ? (
                <textarea
                  ref={inlineTextAreaRef}
                  className="inline-editor inline-editor-textarea"
                  style={{
                    left: inlineEditorLayout.left,
                    top: inlineEditorLayout.top,
                    width: inlineEditorLayout.width,
                    height: inlineEditorLayout.height,
                    fontSize: inlineEditorLayout.fontSize,
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
                  className="inline-editor inline-editor-input"
                  style={{
                    left: inlineEditorLayout.left,
                    top: inlineEditorLayout.top,
                    width: inlineEditorLayout.width,
                    height: inlineEditorLayout.height,
                    fontSize: inlineEditorLayout.fontSize,
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
          >
            <div className="minimap-title">Mini-map</div>
            <div
              className="minimap-canvas"
              style={{ width: minimapModel.miniWidth, height: minimapModel.miniHeight }}
            >
              {minimapModel.objects.map((item) => (
                <div
                  key={item.id}
                  className={`minimap-object ${item.id === selectedId ? 'selected' : ''}`}
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
                  disabled={isTimelineReplaying}
                >
                  {isTimelineReplaying ? 'Replaying…' : 'Replay'}
                </button>
              </div>
              <div className="side-panel-content">
                <div className="timeline-list">
                  {activityEvents.slice(0, 20).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="timeline-item"
                      onClick={() => {
                        if (event.targetId) {
                          setSelectedId(event.targetId)
                        }
                      }}
                    >
                      <span>{event.actorName}</span>
                      <span>{event.action}</span>
                    </button>
                  ))}
                  {activityEvents.length === 0 ? <p className="panel-note">No activity yet.</p> : null}
                </div>
              </div>
            </section>
          ) : null}

          {!showCommentsPanel && !showTimelinePanel ? (
            <section className="side-panel ai-panel-sidebar">
              <AICommandPanel
                disabled={!user}
                onSubmit={handleAiCommandSubmit}
                onIngestTextLines={ingestTextLinesAsStickies}
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
              <li>`Cmd/Ctrl + D`: duplicate selected object</li>
              <li>`Cmd/Ctrl + C`, `Cmd/Ctrl + V`: copy/paste selected object</li>
              <li>`Cmd/Ctrl + Z`: undo</li>
              <li>`Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y`: redo</li>
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
