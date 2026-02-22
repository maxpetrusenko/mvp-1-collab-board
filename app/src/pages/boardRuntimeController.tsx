import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Circle, Group, Layer, Rect, Stage, Text } from 'react-konva'
import Konva from 'konva'
import {
  Circle as CircleShapeIcon,
  Diamond,
  Square,
  Triangle,
} from 'lucide-react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { onValue, ref } from 'firebase/database'

import { defaultBoardId, syncBackend } from '../config/env'
import { db, rtdb } from '../firebase/client'
import { useAuth } from '../state/AuthContext'
import { YjsPilotMirror } from '../collab/yjs'
import type {
  BoardActivityEvent,
  BoardObject,
  CursorPresence,
  Point,
  ShapeKind,
} from '../types/board'
import type {
  AiCommandHistoryEntry,
  BoardAccessRequest,
  BoardLinkAccess,
  BoardMeta,
  CommandPaletteCommand,
  ConnectorDraft,
  CreatePopoverKey,
  HistoryEntry,
  InlineEditorDraft,
  ShapeDraft,
  TextDraft,
  TimerState,
  Viewport,
  VoteConfettiParticle,
} from './boardPageTypes'
import {
  computeInlineEditorAppearance,
  computeInlineEditorLayout,
  computeMinimapModel,
  computeSelectionBounds,
} from './boardPageViewModels'
import { resolveSnappedConnectorEndpoint } from './boardActionHelpers'
import {
  renderConnectorObject,
  renderFrameObject,
  renderShapeObject,
  renderStickyObject,
  renderTextObject,
} from './boardObjectRenderers'
import { BoardCreateForm, BoardSharingCard } from './boardPanels'
import { BoardRightSidebar, BoardShortcutsModal } from './boardSidebarPanels'
import { BoardFloatingToolbar } from './boardFloatingToolbar'
import {
  BoardCommandPaletteModal,
  BoardTemplateChooserModal,
} from './boardCommandOverlays'
import { BoardHeaderBar } from './boardHeaderBar'
import { BoardBoardsListPanel } from './boardBoardsListPanel'
import {
  buildCommandPaletteCommands,
  useBoardKeyboardShortcuts,
} from './boardKeyboardShortcuts'
import { submitBoardAiCommand } from './boardAiCommandSubmit'
import { useBoardCreationActions } from './useBoardCreationActions'
import { useBoardSidebarActions } from './useBoardSidebarActions'
import { useBoardWorkspaceActions } from './useBoardWorkspaceActions'
import { useBoardShareActions } from './useBoardShareActions'
import { useBoardZoomActions } from './useBoardZoomActions'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { usePresence } from '../hooks/usePresence'
import { useBoardSelection } from '../hooks/useBoardSelection'
import {
  useObjectSync,
  type LocalConnectorOverride,
  type LocalPositionOverride,
  type LocalSizeOverride,
} from '../hooks/useObjectSync'
import {
  clamp,
  cloneBoardObject,
  normalizeConnectorStyle,
  normalizeShapeKind,
  overlaps,
  toConnectorBounds,
  type ConnectorPatch,
} from '../lib/boardGeometry'
import { nowMs } from '../lib/time'
import {
  BOARD_HEADER_HEIGHT,
  canAccessBoardMeta,
  canEditBoardMeta,
  calculateRotationAngle,
  calculateRotationFromHandleTarget,
  CONNECTOR_COLOR_OPTIONS,
  CONNECTOR_HANDLE_RADIUS,
  CONNECTOR_SNAP_THRESHOLD_PX,
  CONNECTOR_STYLE_OPTIONS,
  DEFAULT_SHAPE_SIZES,
  DRAG_PUBLISH_INTERVAL_MS,
  FRAME_COLOR_OPTIONS,
  formatTimerLabel,
  getColorLabel,
  getObjectBounds,
  getVoteBadgeWidth,
  LAST_BOARD_STORAGE_PREFIX,
  MAX_ZOOM_SCALE,
  MIN_OBJECT_HEIGHT,
  MIN_OBJECT_WIDTH,
  MIN_ZOOM_SCALE,
  normalizeLinkAccessRole,
  normalizeRotationDegrees,
  OBJECT_DUPLICATE_OFFSET,
  PRESENCE_AWAY_THRESHOLD_MS,
  RESIZE_HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_SIZE,
  ROTATION_STEP_DEGREES,
  renderCommentBadge,
  renderVoteBadge,
  SHAPE_COLOR_OPTIONS,
  SHAPE_TYPE_OPTIONS,
  STICKY_COLOR_OPTIONS,
  STICKY_DROP_DURATION_SECONDS,
  TEXT_COLOR_OPTIONS,
  THEME_STORAGE_KEY,
  TIMER_DEFAULT_MS,
  toBoardMeta,
  VOTE_CONFETTI_DECAY,
  VOTE_CONFETTI_GRAVITY,
  ZOOM_MOMENTUM_EPSILON_POSITION,
  ZOOM_MOMENTUM_EPSILON_SCALE,
  ZOOM_MOMENTUM_SMOOTHING,
} from './boardPageRuntimePrimitives'

export const BoardRuntimeController = () => {
  const { boardId: boardIdParam } = useParams()
  const navigate = useNavigate()
  const { user, signOutUser } = useAuth()
  const userId = user?.uid || ''

  const boardId = boardIdParam || defaultBoardId

  const [objects, setObjects] = useState<BoardObject[]>([])
  const objectsRef = useRef<BoardObject[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef<string[]>([])
  const clipboardObjectsRef = useRef<BoardObject[]>([])
  const clipboardPasteCountRef = useRef(0)
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
  const [isEditingTimer, setIsEditingTimer] = useState(false)
  const [timerDraft, setTimerDraft] = useState(formatTimerLabel(TIMER_DEFAULT_MS))
  const [inlineEditor, setInlineEditor] = useState<InlineEditorDraft | null>(null)
  const [nowMsValue, setNowMsValue] = useState(Date.now())
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [isTimelineReplaying, setIsTimelineReplaying] = useState(false)
  const [replayingEventId, setReplayingEventId] = useState<string | null>(null)
  const [, setYjsPilotMetrics] = useState({ objects: 0, bytes: 0 })
  const connectionStatus = useConnectionStatus()
  const [boards, setBoards] = useState<BoardMeta[]>([])
  const [boardAccessMeta, setBoardAccessMeta] = useState<BoardMeta | null>(null)
  const [boardAccessState, setBoardAccessState] = useState<'checking' | 'granted' | 'denied'>('checking')
  const [boardAccessError, setBoardAccessError] = useState<string | null>(null)
  const [boardAccessRequestStatus, setBoardAccessRequestStatus] = useState<string | null>(null)
  const [boardAccessRequestError, setBoardAccessRequestError] = useState<string | null>(null)
  const [isSubmittingAccessRequest, setIsSubmittingAccessRequest] = useState(false)
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
  const [shareLinkRole, setShareLinkRole] = useState<BoardLinkAccess>('restricted')
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [isShareSubmitting, setIsShareSubmitting] = useState(false)
  const [pendingAccessRequests, setPendingAccessRequests] = useState<BoardAccessRequest[]>([])
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
  const {
    selectedId,
    selectedIdSet,
    selectedObjects,
    selectionBox,
    setSelectionBox,
    beginSelectionBox: beginSelectionBoxFromHook,
    updateSelectionBox: updateSelectionBoxFromHook,
    completeSelectionBox: completeSelectionBoxFromHook,
  } = useBoardSelection({ objects, selectedIds, setSelectedIds })

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [shapeCreateDraft, setShapeCreateDraft] = useState<ShapeDraft>({
    shapeType: 'rectangle',
    color: SHAPE_COLOR_OPTIONS[0],
    text: 'New shape',
  })
  const [connectorCreateDraft, setConnectorCreateDraft] = useState<ConnectorDraft>({
    style: 'arrow',
    color: CONNECTOR_COLOR_OPTIONS[0],
  })
  const [textCreateDraft, setTextCreateDraft] = useState<TextDraft>({
    text: '',
    color: TEXT_COLOR_OPTIONS[0],
    fontSize: 24,
  })
  const [voteConfettiParticles, setVoteConfettiParticles] = useState<VoteConfettiParticle[]>([])
  const objectsCreatedCountRef = useRef(0)
  const activeBoardMeta = useMemo(
    () => boards.find((boardMeta) => boardMeta.id === boardId) || boardAccessMeta,
    [boardAccessMeta, boardId, boards],
  )
  const roleCanEditBoard = useMemo(() => {
    if (!userId) {
      return false
    }
    if (!activeBoardMeta) {
      return false
    }
    return canEditBoardMeta(activeBoardMeta, userId)
  }, [activeBoardMeta, userId])
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
  const lastWorldPointerRef = useRef<Point | null>(null)
  const lastWorldPointerTimestampRef = useRef<number>(0)
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
  const objectDragPublishersRef = useRef<Record<string, (patch: Partial<BoardObject>) => void>>({})
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
    if (!activeBoardMeta) {
      return
    }
    if (roleCanEditBoard || interactionMode === 'view') {
      return
    }
    setInteractionMode('view')
  }, [activeBoardMeta, interactionMode, roleCanEditBoard])
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
  }, [canEditBoard, setSelectionBox])
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
    setBoardAccessRequestStatus(null)
    setBoardAccessRequestError(null)
    setBoardAccessMeta(null)

    const boardRef = doc(db, 'boards', boardId)
    void (async () => {
      try {
        const snapshot = await getDoc(boardRef)
        if (!snapshot.exists()) {
          const createdBoardMeta: BoardMeta = {
            id: boardId,
            name: `Board ${boardId.slice(0, 8)}`,
            description: 'Untitled board',
            ownerId: user.uid,
            linkAccessRole: 'restricted',
            sharedWith: [],
            sharedRoles: {},
            createdBy: user.uid,
            updatedBy: user.uid,
          }
          await setDoc(boardRef, {
            ...createdBoardMeta,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          if (!cancelled) {
            setBoardAccessMeta(createdBoardMeta)
            setBoardAccessState('granted')
          }
          return
        }

        const boardMeta = toBoardMeta(
          snapshot.id,
          snapshot.data() as Partial<BoardMeta> & {
            ownerId?: unknown
            linkAccessRole?: unknown
            sharedWith?: unknown
            sharedRoles?: unknown
            deleted?: boolean
          },
        )
        if (!boardMeta || !canAccessBoardMeta(boardMeta, user.uid)) {
          if (!cancelled) {
            setBoardAccessMeta(null)
            setBoardAccessState('denied')
            setBoardAccessError("You don't have permission to access this board.")
          }
          return
        }

        if (!cancelled) {
          setBoardAccessMeta(boardMeta)
          setBoardAccessState('granted')
        }

        const rawData = snapshot.data() as Partial<BoardMeta> & {
          ownerId?: unknown
          linkAccessRole?: unknown
          sharedWith?: unknown
          sharedRoles?: unknown
        }
        const requiresBackfill =
          typeof rawData.ownerId !== 'string' ||
          !Array.isArray(rawData.sharedWith) ||
          !rawData.sharedRoles ||
          typeof rawData.sharedRoles !== 'object' ||
          Array.isArray(rawData.sharedRoles) ||
          normalizeLinkAccessRole(rawData.linkAccessRole) !== rawData.linkAccessRole ||
          typeof rawData.createdBy !== 'string' ||
          rawData.createdBy.trim().length === 0
        if (requiresBackfill && boardMeta.ownerId === user.uid) {
          await setDoc(
            boardRef,
            {
              createdBy: boardMeta.createdBy,
              ownerId: boardMeta.ownerId,
              linkAccessRole: boardMeta.linkAccessRole,
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
            setBoardAccessMeta(null)
            setBoardAccessState('denied')
            setBoardAccessError("You don't have permission to access this board.")
          }
          return
        }

        console.error('Failed to resolve board access', error)
        if (!cancelled) {
          setBoardAccessMeta(null)
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
            linkAccessRole?: unknown
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
  useEffect(() => {
    const current = boards.find((boardMeta) => boardMeta.id === boardId)
    if (current) {
      setBoardAccessMeta(current)
    }
  }, [boardId, boards])


  useEffect(() => {
    objectsCreatedCountRef.current = 0
  }, [boardId])

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
        const data = docSnap.data() as Partial<AiCommandHistoryEntry> & { result?: { level?: string } }
        if (!data.command || !data.status) {
          return
        }
        const historyStatus: AiCommandHistoryEntry['status'] =
          data.status === 'success' && data.result?.level === 'warning' ? 'warning' : data.status
        nextHistory.push({
          id: docSnap.id,
          command: data.command,
          status: historyStatus,
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

  const currentBoardMeta = useMemo(() => activeBoardMeta || null, [activeBoardMeta])
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
    () =>
      boards.find((boardMeta) => boardMeta.id === shareDialogBoardId) ||
      (shareDialogBoardId && activeBoardMeta?.id === shareDialogBoardId ? activeBoardMeta : null),
    [activeBoardMeta, boards, shareDialogBoardId],
  )
  const shareDialogBoardUrl = useMemo(() => {
    if (!shareDialogBoardMeta) {
      return ''
    }
    if (typeof window === 'undefined') {
      return `/b/${shareDialogBoardMeta.id}`
    }
    return `${window.location.origin}/b/${shareDialogBoardMeta.id}`
  }, [shareDialogBoardMeta])
  useEffect(() => {
    if (!shareDialogBoardMeta) {
      return
    }
    setShareLinkRole(shareDialogBoardMeta.linkAccessRole)
  }, [shareDialogBoardMeta])
  useEffect(() => {
    if (!db || !user || !shareDialogBoardMeta || shareDialogBoardMeta.ownerId !== user.uid) {
      setPendingAccessRequests([])
      return
    }

    const accessRequestsQuery = query(
      collection(db, 'boards', shareDialogBoardMeta.id, 'accessRequests'),
      where('status', '==', 'pending'),
      firestoreLimit(40),
    )

    const unsubscribe = onSnapshot(
      accessRequestsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((docSnap): BoardAccessRequest | null => {
            const data = docSnap.data() as {
              userId?: unknown
              role?: unknown
              email?: unknown
              requestedAt?: unknown
            }
            const userIdValue =
              typeof data.userId === 'string' && data.userId.trim().length > 0 ? data.userId.trim() : docSnap.id
            if (!userIdValue) {
              return null
            }
            const roleValue = data.role === 'view' ? 'view' : 'edit'
            const emailValue = typeof data.email === 'string' ? data.email.trim() : ''
            return {
              userId: userIdValue,
              role: roleValue,
              email: emailValue,
              ...(typeof data.requestedAt === 'number' ? { requestedAt: data.requestedAt } : {}),
            }
          })
          .filter((entry): entry is BoardAccessRequest => Boolean(entry))
          .sort((left, right) => (left.requestedAt || 0) - (right.requestedAt || 0))
        setPendingAccessRequests(next)
      },
      (error) => {
        console.warn('Access requests query failed', error)
        setPendingAccessRequests([])
      },
    )

    return () => unsubscribe()
  }, [shareDialogBoardMeta, user])
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
  const onlineDisplayNames = useMemo(
    () => [selfDisplayName, ...remotePresenceEntries.map((cursor) => cursor.displayName)],
    [remotePresenceEntries, selfDisplayName],
  )
  const effectiveTimerMs = timerState.running && timerState.endsAt
    ? Math.max(0, timerState.endsAt - nowMsValue)
    : timerState.remainingMs
  useEffect(() => {
    if (isEditingTimer) {
      return
    }
    setTimerDraft(formatTimerLabel(effectiveTimerMs))
  }, [effectiveTimerMs, isEditingTimer])
  useEffect(() => {
    if (!canEditBoard && isEditingTimer) {
      setIsEditingTimer(false)
    }
  }, [canEditBoard, isEditingTimer])
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
  const inlineEditorLayout = useMemo(
    () =>
      computeInlineEditorLayout({
        inlineEditor,
        inlineEditorTarget,
        localObjectPositions,
        localObjectRotations,
        viewport,
      }),
    [inlineEditor, inlineEditorTarget, localObjectPositions, localObjectRotations, viewport],
  )
  const inlineEditorAppearance = useMemo(
    () =>
      computeInlineEditorAppearance({
        inlineEditor,
        inlineEditorTarget,
      }),
    [inlineEditor, inlineEditorTarget],
  )
  const minimapModel = useMemo(
    () =>
      computeMinimapModel({
        objects,
        viewport,
        stageSize,
        getObjectBounds: (boardObject) => getObjectBounds(boardObject, objectsById),
      }),
    [objects, objectsById, stageSize, viewport],
  )
  const selectionBounds = useMemo(() => computeSelectionBounds(selectionBox), [selectionBox])
  const selectObjectId = useCallback((objectId: string, additive = false) => {
    const previous = selectedIdsRef.current
    let nextIds: string[] = []
    if (!additive) {
      nextIds = [objectId]
    } else if (previous.includes(objectId)) {
      nextIds = previous.filter((id) => id !== objectId)
    } else {
      nextIds = [...previous, objectId]
    }
    selectedIdsRef.current = nextIds
    setSelectedIds(nextIds)
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
      beginSelectionBoxFromHook(start)
    },
    [beginSelectionBoxFromHook],
  )
  const updateSelectionBox = useCallback((nextPoint: Point) => {
    updateSelectionBoxFromHook(nextPoint)
  }, [updateSelectionBoxFromHook])
  const completeSelectionBox = useCallback(
    (additive: boolean) => {
      completeSelectionBoxFromHook({
        additive,
        resolveObjectBounds: (boardObject) => {
          const position = resolveObjectPosition(boardObject)
          const size = resolveObjectSize(boardObject)
          return boardObject.type === 'connector'
            ? getObjectBounds(boardObject, objectsById)
            : {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
              }
        },
      })
    },
    [completeSelectionBoxFromHook, objectsById, resolveObjectPosition, resolveObjectSize],
  )
  const {
    beginBoardRename,
    cancelBoardRename,
    closeShareDialog,
    createBoard,
    deleteBoardMeta,
    duplicateBoardMeta,
    handleBoardDescriptionInputChange,
    handleBoardNameInputChange,
    handleShareEmailChange,
    handleShareLinkCopy,
    handleShareLinkRoleChange,
    handleShareRoleChange,
    openShareDialog,
    scheduleBoardNavigate,
    submitBoardRename,
  } = useBoardWorkspaceActions({
    boardAccessMeta,
    boardId,
    boardNavigationTimeoutRef,
    boards,
    currentBoardMeta,
    db,
    navigate,
    newBoardDescription,
    newBoardName,
    renameBoardName,
    renamingBoardId,
    setBoardAccessMeta,
    setBoardFormError,
    setBoards,
    setCommandPaletteActiveIndex,
    setCommandPaletteQuery,
    setNewBoardDescription,
    setNewBoardName,
    setRenameBoardError,
    setRenameBoardName,
    setRenamingBoardId,
    setSelectedIds,
    setSelectionBox,
    setShareDialogBoardId,
    setShareEmail,
    setShareError,
    setShareLinkRole,
    setShareRole,
    setShareStatus,
    setShowBoardsPanel,
    setShowCommandPalette,
    setShowTemplateChooser,
    shareDialogBoardUrl,
    user,
  })
  const {
    approveAccessRequest,
    requestBoardAccess,
    revokeSharedCollaborator,
    submitLinkSharingUpdate,
    submitShareInvite,
  } = useBoardShareActions({
    boardId,
    boards,
    db,
    setBoardAccessMeta,
    setBoardAccessRequestError,
    setBoardAccessRequestStatus,
    setBoards,
    setIsShareSubmitting,
    setIsSubmittingAccessRequest,
    setShareEmail,
    setShareError,
    setShareStatus,
    shareDialogBoardId,
    shareEmail,
    shareLinkRole,
    shareRole,
    user,
  })
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

  const {
    createObject,
    toggleCreatePopover,
    createShapeFromPopover,
    createConnectorFromPopover,
    createTextFromPopover,
    applyTemplate,
  } = useBoardCreationActions({
    boardId,
    dbAvailable: Boolean(db),
    canEditBoard,
    hasLiveBoardAccess,
    user,
    stageSize,
    viewport,
    objectsRef,
    pendingStickyDropIdsRef,
    objectsCreatedCountRef,
    shapeCreateDraft,
    connectorCreateDraft,
    textCreateDraft,
    activeCreatePopover,
    createPopoverContainerRef,
    setActiveCreatePopover,
    setSelectionMode,
    setShowTemplateChooser,
    setSelectedIds,
    setTextCreateDraft,
    writeBoardObject,
    pushHistory,
    logActivity,
    touchBoard,
  })

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
    async (source: BoardObject, options?: { selectAfter?: boolean; offset?: number }) => {
      if (!db || !user || !hasLiveBoardAccess || !canEditBoard) {
        return null
      }

      const id = crypto.randomUUID()
      const now = Date.now()
      const duplicateOffset = typeof options?.offset === 'number' ? options.offset : OBJECT_DUPLICATE_OFFSET
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
                x: source.start.x + duplicateOffset,
                y: source.start.y + duplicateOffset,
              },
              end: {
                x: source.end.x + duplicateOffset,
                y: source.end.y + duplicateOffset,
              },
              ...toConnectorBounds(
                {
                  x: source.start.x + duplicateOffset,
                  y: source.start.y + duplicateOffset,
                },
                {
                  x: source.end.x + duplicateOffset,
                  y: source.end.y + duplicateOffset,
                },
              ),
              fromObjectId: null,
              toObjectId: null,
              fromAnchor: null,
              toAnchor: null,
              comments: [],
              votesByUser: {},
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
                x: source.position.x + duplicateOffset,
                y: source.position.y + duplicateOffset,
              },
              comments: [],
              votesByUser: {},
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
    if (!canEditBoard) {
      return
    }

    const sourceIds = selectedIdsRef.current
    const sourceObjects = selectedObjects.length > 0
      ? selectedObjects
      : sourceIds
          .map((id) => objectsRef.current.find((boardObject) => boardObject.id === id))
          .filter((boardObject): boardObject is BoardObject => Boolean(boardObject))
    if (sourceObjects.length === 0) {
      return
    }

    const duplicatedIds: string[] = []
    for (const boardObject of sourceObjects) {
      const duplicated = await duplicateObject(boardObject, { selectAfter: false })
      if (duplicated) {
        duplicatedIds.push(duplicated.id)
      }
    }

    if (duplicatedIds.length > 0) {
      selectedIdsRef.current = duplicatedIds
      setSelectedIds(duplicatedIds)
    }
  }, [canEditBoard, duplicateObject, selectedObjects])

  const copySelectionToClipboard = useCallback(() => {
    const sourceIds = selectedIdsRef.current
    const sourceObjects = sourceIds
      .map((id) => objectsRef.current.find((boardObject) => boardObject.id === id))
      .filter((boardObject): boardObject is BoardObject => Boolean(boardObject))

    if (sourceObjects.length === 0) {
      return false
    }

    clipboardObjectsRef.current = sourceObjects.map((boardObject) => cloneBoardObject(boardObject))
    clipboardPasteCountRef.current = 0
    return true
  }, [])

  const pasteClipboardObjects = useCallback(async () => {
    if (!canEditBoard || clipboardObjectsRef.current.length === 0) {
      return
    }

    const pasteIteration = clipboardPasteCountRef.current + 1
    const pasteOffset = OBJECT_DUPLICATE_OFFSET * pasteIteration
    const duplicatedIds: string[] = []
    for (const source of clipboardObjectsRef.current) {
      const duplicated = await duplicateObject(source, { selectAfter: false, offset: pasteOffset })
      if (duplicated) {
        duplicatedIds.push(duplicated.id)
      }
    }

    if (duplicatedIds.length === 0) {
      return
    }

    clipboardPasteCountRef.current = pasteIteration
    selectedIdsRef.current = duplicatedIds
    setSelectedIds(duplicatedIds)
  }, [canEditBoard, duplicateObject])

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

  const {
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
  } = useBoardZoomActions({
    objects,
    objectsById,
    queueZoomMomentum,
    stageSize,
    viewport,
    zoomMomentumTargetRef,
  })
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
    () =>
      buildCommandPaletteCommands({
        boardId,
        canEditBoard,
        createObject,
        duplicateBoardMeta,
        roleCanEditBoard,
        selectionMode,
        setActiveCreatePopover,
        setBoardFormError,
        setInteractionMode,
        setSelectionMode,
        setShowBoardsPanel,
        setShowShortcuts,
        setShowTemplateChooser,
        themeMode,
        toggleThemeMode,
        zoomToFit,
      }),
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

  useBoardKeyboardShortcuts({
    activeCreatePopover,
    canEditBoard,
    closeCommandPalette,
    commandPaletteActiveIndex,
    setCommandPaletteActiveIndex,
    copySelectionToClipboard,
    deleteSelected,
    duplicateObject,
    duplicateSelected,
    filteredCommandPaletteCommands,
    objectsRef,
    openCommandPalette,
    pasteClipboardObjects,
    redo,
    roleCanEditBoard,
    rotateSelectionBy,
    runCommandPaletteEntry,
    selectedIds,
    selectedIdsRef,
    selectedObject,
    selectionMode,
    setActiveCreatePopover,
    setInteractionMode,
    setSelectedIds,
    setSelectionMode,
    setShowShortcuts,
    setShowTemplateChooser,
    showCommandPalette,
    showTemplateChooser,
    undo,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
    clipboardObjectsRef,
  })

  const getObjectDragPublisher = useCallback(
    (objectId: string) => {
      if (!objectDragPublishersRef.current[objectId]) {
        let lastDragPublishAt = 0
        objectDragPublishersRef.current[objectId] = (patch: Partial<BoardObject>) => {
          const now = Date.now()
          if (now - lastDragPublishAt < DRAG_PUBLISH_INTERVAL_MS) {
            return
          }

          lastDragPublishAt = now
          void patchObject(objectId, patch, { recordHistory: false, logEvent: false })
        }
      }

      return objectDragPublishersRef.current[objectId]
    },
    [patchObject],
  )

  const getConnectorPublisher = useCallback(
    (objectId: string) => {
      if (!connectorPublishersRef.current[objectId]) {
        let lastDragPublishAt = 0
        connectorPublishersRef.current[objectId] = (patch: ConnectorPatch) => {
          const now = Date.now()
          if (now - lastDragPublishAt < DRAG_PUBLISH_INTERVAL_MS) {
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
    return resolveSnappedConnectorEndpoint({
      point,
      objects: objectsRef.current,
      thresholdPx: CONNECTOR_SNAP_THRESHOLD_PX,
    })
  }, [])

  const {
    beginTimerEdit,
    cancelTimerEdit,
    commitTimerEdit,
    startTimer,
    pauseTimer,
    resetTimer,
    toggleVoteOnObject,
    addComment,
    ingestTextLinesAsStickies,
    replayTimeline,
    exportBoard,
  } = useBoardSidebarActions({
    boardId,
    canEditBoard,
    commentDraft,
    effectiveTimerMs,
    isTimelineReplaying,
    logActivity,
    objects,
    objectsById,
    objectsRef,
    patchObject,
    pushHistory,
    replayAbortRef,
    resolveObjectPosition,
    resolveObjectSize,
    selectedObject,
    setCommentDraft,
    setIsEditingTimer,
    setIsTimelineReplaying,
    setReplayingEventId,
    setSelectedIds,
    setTimerDraft,
    setTimerState,
    setViewport,
    setVoteConfettiParticles,
    stageRef,
    stageSize,
    stopZoomMomentum,
    timelineEvents,
    timerDraft,
    timerRef,
    timerState,
    touchBoard,
    user,
    viewport,
    writeBoardObject,
  })

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
  const moveObjectDrag = useCallback(
    (boardObject: BoardObject, nextPos: Point) => {
      const snapshot = multiDragSnapshotRef.current[boardObject.id]
      if (!snapshot) {
        liveDragPositionsRef.current[boardObject.id] = nextPos
        getObjectDragPublisher(boardObject.id)({ position: nextPos })
        return
      }

      const dx = nextPos.x - snapshot.anchor.x
      const dy = nextPos.y - snapshot.anchor.y
      snapshot.members.forEach((member) => {
        const memberPosition = {
          x: member.start.x + dx,
          y: member.start.y + dy,
        }
        liveDragPositionsRef.current[member.id] = memberPosition
        getObjectDragPublisher(member.id)({ position: memberPosition })
      })
    },
    [getObjectDragPublisher],
  )
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

  const handleAiCommandSubmit = useCallback(
    async (command: string) =>
      submitBoardAiCommand({
        boardId,
        canEditBoard,
        command,
        hasLiveBoardAccess,
        lastWorldPointerRef,
        lastWorldPointerTimestampRef,
        logActivity,
        resolveWorldPointer,
        stageRef,
        stageSize,
        user,
        viewport,
      }),
    [
      boardId,
      canEditBoard,
      hasLiveBoardAccess,
      logActivity,
      resolveWorldPointer,
      stageSize,
      user,
      viewport,
    ],
  )
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
        <section className="setup-warning board-access-denied-card" data-testid="board-access-denied">
          <h2>Access denied</h2>
          <p>{boardAccessError || "You don't have permission to access this board."}</p>
          {boardAccessRequestError ? (
            <p className="error-text" data-testid="board-access-request-error">
              {boardAccessRequestError}
            </p>
          ) : null}
          {boardAccessRequestStatus ? (
            <p className="panel-note" data-testid="board-access-request-status">
              {boardAccessRequestStatus}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void requestBoardAccess()
            }}
            disabled={isSubmittingAccessRequest}
            data-testid="board-access-request-button"
          >
            {isSubmittingAccessRequest ? 'Requesting…' : 'Request access'}
          </button>
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
      <BoardHeaderBar
        boardId={boardId}
        canEditBoard={canEditBoard}
        canManageCurrentBoardSharing={canManageCurrentBoardSharing}
        closeCommandPalette={closeCommandPalette}
        connectionStatus={connectionStatus}
        currentBoardMeta={currentBoardMeta}
        isEditingTimer={isEditingTimer}
        isRenamingCurrentBoard={isRenamingCurrentBoard}
        onBeginBoardRenameCurrent={() => {
          if (currentBoardMeta) {
            beginBoardRename(currentBoardMeta)
          }
        }}
        onBeginTimerEdit={beginTimerEdit}
        onCancelBoardRename={cancelBoardRename}
        onCancelTimerEdit={cancelTimerEdit}
        onPauseTimer={() => {
          void pauseTimer()
        }}
        onRenameBoardNameChange={(value) => {
          setRenameBoardName(value)
          if (renameBoardError) {
            setRenameBoardError(null)
          }
        }}
        onResetTimer={() => {
          void resetTimer()
        }}
        onShareCurrentBoard={() => {
          if (!currentBoardMeta) {
            return
          }
          setBoardFormError(null)
          closeCommandPalette()
          cancelBoardRename()
          setShowBoardsPanel(true)
          openShareDialog(currentBoardMeta.id)
        }}
        onSignOut={() => {
          void signOutUser()
        }}
        onStartTimer={() => {
          void startTimer()
        }}
        onSubmitBoardRenameCurrent={() => {
          if (currentBoardMeta) {
            void submitBoardRename(currentBoardMeta.id)
          }
        }}
        onSubmitTimerEdit={() => {
          void commitTimerEdit()
        }}
        onToggleBoardsPanel={() => {
          setBoardFormError(null)
          if (showBoardsPanel) {
            closeShareDialog()
            cancelBoardRename()
          }
          setShowBoardsPanel((prev) => !prev)
        }}
        onToggleShortcuts={() => setShowShortcuts((prev) => !prev)}
        onToggleThemeMode={toggleThemeMode}
        renameBoardError={renameBoardError}
        renameBoardName={renameBoardName}
        showConnectionStatusPill={showConnectionStatusPill}
        showShortcuts={showShortcuts}
        themeMode={themeMode}
        timerDisplayLabel={formatTimerLabel(effectiveTimerMs)}
        timerDraft={timerDraft}
        timerRunning={timerState.running}
        onTimerDraftChange={setTimerDraft}
      />
      <BoardBoardsListPanel
        boards={boards}
        currentBoardId={boardId}
        onBeginBoardRename={beginBoardRename}
        onCancelBoardRename={cancelBoardRename}
        onClose={() => {
          closeShareDialog()
          cancelBoardRename()
          setShowBoardsPanel(false)
        }}
        onDeleteBoard={(targetBoardId) => {
          void deleteBoardMeta(targetBoardId)
        }}
        onDuplicateBoard={(targetBoardId) => {
          void duplicateBoardMeta(targetBoardId)
        }}
        onOpenShareDialog={openShareDialog}
        onRenameBoardNameChange={(value) => {
          setRenameBoardName(value)
          if (renameBoardError) {
            setRenameBoardError(null)
          }
        }}
        onScheduleBoardNavigate={scheduleBoardNavigate}
        onSubmitBoardRename={(targetBoardId) => {
          void submitBoardRename(targetBoardId)
        }}
        open={showBoardsPanel}
        ownedBoards={ownedBoards}
        renamingBoardId={renamingBoardId}
        renameBoardError={renameBoardError}
        renameBoardName={renameBoardName}
        sharedBoards={sharedBoards}
        sideContent={
          <>
            <BoardCreateForm
              boardFormError={boardFormError}
              newBoardDescription={newBoardDescription}
              newBoardName={newBoardName}
              onDescriptionChange={handleBoardDescriptionInputChange}
              onNameChange={handleBoardNameInputChange}
              onSubmit={() => {
                void createBoard()
              }}
            />
            {shareDialogBoardId && shareDialogBoardMeta ? (
              <BoardSharingCard
                boardMeta={shareDialogBoardMeta}
                isShareSubmitting={isShareSubmitting}
                onApproveAccessRequest={(targetBoardId, requesterId, role) => {
                  void approveAccessRequest(targetBoardId, requesterId, role)
                }}
                onClose={closeShareDialog}
                onCopyBoardUrl={handleShareLinkCopy}
                onLinkRoleChange={handleShareLinkRoleChange}
                onRevokeCollaborator={(targetBoardId, collaboratorId) => {
                  void revokeSharedCollaborator(targetBoardId, collaboratorId)
                }}
                onShareEmailChange={handleShareEmailChange}
                onShareInvite={() => {
                  void submitShareInvite()
                }}
                onShareRoleChange={handleShareRoleChange}
                onSubmitLinkSharingUpdate={() => {
                  void submitLinkSharingUpdate()
                }}
                pendingAccessRequests={pendingAccessRequests}
                shareDialogBoardUrl={shareDialogBoardUrl}
                shareEmail={shareEmail}
                shareError={shareError}
                shareLinkRole={shareLinkRole}
                shareRole={shareRole}
                shareStatus={shareStatus}
              />
            ) : null}
          </>
        }
        userId={userId}
      />
      <BoardCommandPaletteModal
        activeIndex={commandPaletteActiveIndex}
        filteredCommands={filteredCommandPaletteCommands}
        inputRef={commandPaletteInputRef}
        onActiveIndexChange={setCommandPaletteActiveIndex}
        onClose={closeCommandPalette}
        onQueryChange={setCommandPaletteQuery}
        onRunCommand={runCommandPaletteEntry}
        open={showCommandPalette}
        query={commandPaletteQuery}
      />
      <BoardTemplateChooserModal
        canEditBoard={canEditBoard}
        onApplyTemplate={(templateKey) => {
          void applyTemplate(templateKey)
        }}
        onClose={() => setShowTemplateChooser(false)}
        open={showTemplateChooser}
      />

      <BoardFloatingToolbar
        activeCreatePopover={activeCreatePopover}
        canEditBoard={canEditBoard}
        connectorCreateDraft={connectorCreateDraft}
        createPopoverContainerRef={createPopoverContainerRef}
        duplicateSelectionDisabled={!canEditBoard || selectedIds.length === 0}
        interactionModeCanEdit={canEditBoard}
        isVotingMode={isVotingMode}
        onCreateConnector={() => {
          void createConnectorFromPopover()
        }}
        onCreateFrame={() => {
          void createObject('frame')
        }}
        onCreateShape={() => {
          void createShapeFromPopover()
        }}
        onCreateSticky={() => {
          void createObject('stickyNote')
        }}
        onCreateText={() => {
          void createTextFromPopover()
        }}
        onDeleteSelection={() => {
          if (selectedIds.length > 0) {
            void deleteSelected()
          }
        }}
        onDuplicateSelection={() => {
          if (selectedIds.length > 0) {
            void duplicateSelected()
            return
          }
          if (selectedObject) {
            void duplicateObject(selectedObject)
          }
        }}
        onExportPdf={() => {
          void exportBoard('pdf', 'selection')
        }}
        onExportPng={() => {
          void exportBoard('png', 'selection')
        }}
        onRedo={() => {
          void redo()
        }}
        onSetConnectorCreateDraft={setConnectorCreateDraft}
        onSetInteractionMode={setInteractionMode}
        onSetSelectionMode={setSelectionMode}
        onSetShapeCreateDraft={setShapeCreateDraft}
        onSetShowTemplateChooser={setShowTemplateChooser}
        onSetTextCreateDraft={setTextCreateDraft}
        onSetVotingMode={setIsVotingMode}
        onToggleCreatePopover={toggleCreatePopover}
        onUndo={() => {
          void undo()
        }}
        roleCanEditBoard={roleCanEditBoard}
        selectionMode={selectionMode}
        shapeCreateDraft={shapeCreateDraft}
        textCreateDraft={textCreateDraft}
      />

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

              lastWorldPointerRef.current = worldPoint
              lastWorldPointerTimestampRef.current = nowMs()

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

              const worldPoint = resolveWorldPointer(stage)
              if (worldPoint) {
                lastWorldPointerRef.current = worldPoint
                lastWorldPointerTimestampRef.current = nowMs()
              }

              if (selectionMode === 'area' || event.evt.shiftKey) {
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
                  return renderStickyObject({
                    boardObject,
                    position,
                    size,
                    selected,
                    hovered,
                    canEditBoard,
                    selectionMode,
                    resizingObjectId,
                    rotatingObjectId,
                    inlineEditor,
                    selectedIdsCount: selectedIds.length,
                    handleObjectSelection,
                    startInlineEdit,
                    setHoveredObjectId,
                    beginObjectDrag,
                    moveObjectDrag,
                    endObjectDrag,
                    localObjectRotations,
                    localObjectRotationsRef,
                    setResizingObjectId,
                    resizeObjectLocal,
                    commitResizeObject,
                    setRotatingObjectId,
                    calculateRotationFromHandleTarget,
                    setLocalRotation,
                    patchObject,
                    clearLocalRotation,
                    minObjectWidth: MIN_OBJECT_WIDTH,
                    minObjectHeight: MIN_OBJECT_HEIGHT,
                    resizeHandleSize: RESIZE_HANDLE_SIZE,
                    rotationHandleOffset: ROTATION_HANDLE_OFFSET,
                    rotationHandleSize: ROTATION_HANDLE_SIZE,
                    getVoteBadgeWidth,
                    renderVoteBadge,
                    renderCommentBadge,
                    themeMode,
                  })
                }

                if (boardObject.type === 'shape') {
                  return renderShapeObject({
                    boardObject,
                    position,
                    size,
                    selected,
                    hovered,
                    canEditBoard,
                    selectionMode,
                    resizingObjectId,
                    rotatingObjectId,
                    inlineEditor,
                    selectedIdsCount: selectedIds.length,
                    handleObjectSelection,
                    startInlineEdit,
                    setHoveredObjectId,
                    beginObjectDrag,
                    moveObjectDrag,
                    endObjectDrag,
                    localObjectRotations,
                    localObjectRotationsRef,
                    setResizingObjectId,
                    resizeObjectLocal,
                    commitResizeObject,
                    setRotatingObjectId,
                    calculateRotationFromHandleTarget,
                    setLocalRotation,
                    patchObject,
                    clearLocalRotation,
                    minObjectWidth: MIN_OBJECT_WIDTH,
                    minObjectHeight: MIN_OBJECT_HEIGHT,
                    resizeHandleSize: RESIZE_HANDLE_SIZE,
                    rotationHandleOffset: ROTATION_HANDLE_OFFSET,
                    rotationHandleSize: ROTATION_HANDLE_SIZE,
                    getVoteBadgeWidth,
                    renderVoteBadge,
                    renderCommentBadge,
                    themeMode,
                  })
                }

                if (boardObject.type === 'connector') {
                  return renderConnectorObject({
                    boardObject,
                    selected,
                    hovered,
                    canEditBoard,
                    themeMode,
                    localConnectorGeometry,
                    localObjectPositions,
                    localObjectSizes,
                    objectsById,
                    connectorHandleRadius: CONNECTOR_HANDLE_RADIUS,
                    handleObjectSelection,
                    setHoveredObjectId,
                    setDraggingConnectorId,
                    setLocalConnectorGeometry,
                    resolveSnappedEndpoint,
                    getConnectorPublisher,
                    patchObject,
                    renderVoteBadge,
                    renderCommentBadge,
                  })
                }

                if (boardObject.type === 'frame') {
                  return renderFrameObject({
                    boardObject,
                    position,
                    size,
                    selected,
                    hovered,
                    canEditBoard,
                    selectionMode,
                    resizingObjectId,
                    rotatingObjectId,
                    inlineEditor,
                    selectedIdsCount: selectedIds.length,
                    selectedIdSet,
                    localObjectPositions,
                    localObjectRotations,
                    localObjectRotationsRef,
                    liveDragPositionsRef,
                    objectsRef,
                    frameDragSnapshotRef,
                    multiDragSnapshotRef,
                    setDraggingObjectId,
                    setHoveredObjectId,
                    setLocalObjectPositions,
                    setResizingObjectId,
                    setRotatingObjectId,
                    handleObjectSelection,
                    startInlineEdit,
                    beginObjectDrag,
                    moveObjectDrag,
                    endObjectDrag,
                    resizeObjectLocal,
                    commitResizeObject,
                    getObjectDragPublisher,
                    calculateRotationFromHandleTarget,
                    setLocalRotation,
                    clearLocalRotation,
                    patchObject,
                    renderVoteBadge,
                    renderCommentBadge,
                    getVoteBadgeWidth,
                    minObjectWidth: MIN_OBJECT_WIDTH,
                    minObjectHeight: MIN_OBJECT_HEIGHT,
                    resizeHandleSize: RESIZE_HANDLE_SIZE,
                    rotationHandleOffset: ROTATION_HANDLE_OFFSET,
                    rotationHandleSize: ROTATION_HANDLE_SIZE,
                  })
                }

                if (boardObject.type === 'text') {
                  return renderTextObject({
                    boardObject,
                    position,
                    size,
                    selected,
                    hovered,
                    canEditBoard,
                    selectionMode,
                    resizingObjectId,
                    rotatingObjectId,
                    inlineEditor,
                    selectedIdsCount: selectedIds.length,
                    handleObjectSelection,
                    startInlineEdit,
                    setHoveredObjectId,
                    beginObjectDrag,
                    moveObjectDrag,
                    endObjectDrag,
                    localObjectRotations,
                    localObjectRotationsRef,
                    setResizingObjectId,
                    resizeObjectLocal,
                    commitResizeObject,
                    setRotatingObjectId,
                    calculateRotationFromHandleTarget,
                    setLocalRotation,
                    patchObject,
                    clearLocalRotation,
                    resizeHandleSize: RESIZE_HANDLE_SIZE,
                    rotationHandleOffset: ROTATION_HANDLE_OFFSET,
                    rotationHandleSize: ROTATION_HANDLE_SIZE,
                    getVoteBadgeWidth,
                    renderVoteBadge,
                    renderCommentBadge,
                    minTextWidth: 80,
                    minTextHeight: 28,
                    themeMode,
                  })
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

        <BoardRightSidebar
          addComment={() => {
            void addComment()
          }}
          aiCommandHistory={aiCommandHistory}
          aiDisabled={!user || !canEditBoard || !hasLiveBoardAccess}
          commentDraft={commentDraft}
          isTimelineReplaying={isTimelineReplaying}
          onCommentDraftChange={setCommentDraft}
          onIngestTextLines={ingestTextLinesAsStickies}
          onReplayTimeline={() => {
            void replayTimeline()
          }}
          onSelectTimelineTarget={(targetId) => {
            setSelectedIds([targetId])
          }}
          onShowAi={() => {
            setShowCommentsPanel(false)
            setShowTimelinePanel(false)
          }}
          onShowComments={() => {
            setShowCommentsPanel(true)
            setShowTimelinePanel(false)
          }}
          onShowTimeline={() => {
            setShowCommentsPanel(false)
            setShowTimelinePanel(true)
          }}
          onSubmitAiCommand={handleAiCommandSubmit}
          onlineDisplayNames={onlineDisplayNames}
          replayingEventId={replayingEventId}
          selectedComments={selectedComments}
          selectedObject={selectedObject}
          showCommentsPanel={showCommentsPanel}
          showTimelinePanel={showTimelinePanel}
          timelineEvents={timelineEvents}
        />
      </section>
      <BoardShortcutsModal
        onClose={() => setShowShortcuts(false)}
        open={showShortcuts}
      />
    </main>
  )
}
