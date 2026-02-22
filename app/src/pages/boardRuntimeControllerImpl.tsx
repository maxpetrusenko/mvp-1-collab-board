/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { ref } from 'firebase/database'

import { defaultBoardId, syncBackend } from '../config/env'
import { db, rtdb } from '../firebase/client'
import { useAuth } from '../state/AuthContext'
import { YjsPilotMirror } from '../collab/yjs'
import type {
  BoardActivityEvent,
  BoardObject,
  Point,
} from '../types/board'
import type {
  AiCommandHistoryEntry,
  BoardAccessRequest,
  BoardLinkAccess,
  BoardMeta,
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
import { useBoardCreationActions } from './useBoardCreationActions'
import { useBoardDerivedViewModels } from './useBoardDerivedViewModels'
import { useBoardObjectActions } from './useBoardObjectActions'
import { useBoardRuntimeCommandPalette } from './useBoardRuntimeCommandPalette'
import { useBoardRuntimeComputedState } from './useBoardRuntimeComputedState'
import { useBoardRuntimeLiveActions } from './useBoardRuntimeLiveActions'
import { useBoardRealtimeDataEffects } from './useBoardRealtimeDataEffects'
import { useBoardSelectionMarqueeEffect } from './useBoardSelectionMarqueeEffect'
import { useBoardSpatialInteractions } from './useBoardSpatialInteractions'
import { useBoardWorkspaceActions } from './useBoardWorkspaceActions'
import { useBoardShareActions } from './useBoardShareActions'
import { useBoardZoomActions } from './useBoardZoomActions'
import { useBoardHistoryActions } from './useBoardHistoryActions'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { usePresence } from '../hooks/usePresence'
import { useBoardSelection } from '../hooks/useBoardSelection'
import {
  type LocalConnectorOverride,
  type LocalPositionOverride,
  type LocalSizeOverride,
} from '../hooks/useObjectSync'
import {
  clamp,
  normalizeConnectorStyle,
  normalizeShapeKind,
  type ConnectorPatch,
} from '../lib/boardGeometry'
import { nowMs } from '../lib/time'
import {
  BOARD_HEADER_HEIGHT,
  canEditBoardMeta,
  calculateRotationFromHandleTarget,
  CONNECTOR_COLOR_OPTIONS,
  CONNECTOR_HANDLE_RADIUS,
  CONNECTOR_STYLE_OPTIONS,
  DEFAULT_SHAPE_SIZES,
  formatTimerLabel,
  getColorLabel,
  getObjectBounds,
  getVoteBadgeWidth,
  LAST_BOARD_STORAGE_PREFIX,
  MAX_ZOOM_SCALE,
  MIN_OBJECT_HEIGHT,
  MIN_OBJECT_WIDTH,
  MIN_ZOOM_SCALE,
  PRESENCE_AWAY_THRESHOLD_MS,
  RESIZE_HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_SIZE,
  ROTATION_STEP_DEGREES,
  renderCommentBadge,
  renderVoteBadge,
  SHAPE_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  THEME_STORAGE_KEY,
  TIMER_DEFAULT_MS,
  VOTE_CONFETTI_DECAY,
  VOTE_CONFETTI_GRAVITY,
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
  const [nowMsValue, setNowMsValue] = useState(() => Date.now())
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

  useBoardRealtimeDataEffects({
    boardId,
    dbInstance: db,
    draggingConnectorId,
    draggingObjectId,
    hasLiveBoardAccess,
    objectsRef,
    rtdbInstance: rtdb,
    resizingObjectId,
    setActivityEvents,
    setAiCommandHistory,
    setBoardAccessError,
    setBoardAccessMeta,
    setBoardAccessRequestError,
    setBoardAccessRequestStatus,
    setBoardAccessState,
    setBoards,
    setLocalConnectorGeometry,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setObjects,
    setSelectedIds,
    setTimerState,
    setYjsPilotMetrics,
    timerRef,
    user,
    yjsPilotMirrorRef,
  })

  useEffect(() => {
    const current = boards.find((boardMeta) => boardMeta.id === boardId)
    if (current) {
      setBoardAccessMeta(current)
    }
  }, [boardId, boards])

  useEffect(() => {
    objectsCreatedCountRef.current = 0
  }, [boardId])

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

  const {
    canManageCurrentBoardSharing,
    currentBoardMeta,
    effectiveTimerMs,
    isRenamingCurrentBoard,
    objectsById,
    onlineDisplayNames,
    ownedBoards,
    remotePresenceEntries,
    renderObjects,
    selectedColorOptions,
    selectedComments,
    selectedObject,
    selectedShapeOptions,
    selfDisplayName,
    shareDialogBoardMeta,
    shareDialogBoardUrl,
    sharedBoards,
    showConnectionStatusPill,
  } = useBoardRuntimeComputedState({
    activeBoardMeta,
    boards,
    canEditBoard,
    connectionStatus,
    cursors,
    dbInstance: db,
    isEditingTimer,
    nowMsValue,
    objects,
    renamingBoardId,
    selectedId,
    selectedIdSet,
    setIsEditingTimer,
    setPendingAccessRequests,
    setShareLinkRole,
    setTimerDraft,
    shareDialogBoardId,
    stageSize,
    timerState,
    user,
    userId,
    viewport,
  })
  const {
    inlineEditorAppearance,
    inlineEditorLayout,
    inlineEditorTarget,
    minimapModel,
    selectionBounds,
    timelineEvents,
  } = useBoardDerivedViewModels({
    activityEvents,
    getObjectBounds: (boardObject) => getObjectBounds(boardObject, objectsById),
    inlineEditor,
    localObjectPositions,
    localObjectRotations,
    objects,
    selectionBox,
    stageSize,
    viewport,
  })
  const {
    beginSelectionBox,
    completeSelectionBox,
    queueZoomMomentum,
    resolveContainingFrameId,
    resolveObjectPosition,
    resolveObjectSize,
    resolveWorldPointer,
    rotationOverlayHandles,
    selectObjectId,
    selectedObjectMenuPosition,
    startRotationOverlayDrag,
    stopZoomMomentum,
    updateSelectionBox,
  } = useBoardSpatialInteractions({
    beginSelectionBoxFromHook,
    canEditBoard,
    completeSelectionBoxFromHook,
    getObjectBounds: (boardObject) => getObjectBounds(boardObject, objectsById),
    liveDragPositionsRef,
    localObjectPositions,
    localObjectRotations,
    localObjectRotationsRef,
    localObjectSizes,
    objects,
    objectsRef,
    pendingStickyDropIdsRef,
    rotationOverlayDragRef,
    selectedIdsRef,
    selectedObject,
    selectedObjects,
    selectionMode,
    setRotatingObjectId,
    setSelectedIds,
    setViewport,
    stageRef,
    stageSize,
    stickyDropTweensRef,
    updateSelectionBoxFromHook,
    viewport,
    zoomMomentumFrameRef,
    zoomMomentumTargetRef,
  })
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
  const {
    cancelInlineEdit,
    clearLocalRotation,
    commitInlineEdit,
    deleteBoardObjectById,
    patchObject,
    setLocalRotation,
    startInlineEdit,
    writeBoardObject,
  } = useBoardObjectActions({
    boardId,
    canEditBoard,
    dbInstance: db,
    hasLiveBoardAccess,
    inlineEditor,
    inlineEditorTarget,
    inlineInputRef,
    inlineTextAreaRef,
    isApplyingHistoryRef,
    localObjectRotationsRef,
    objectsRef,
    pushHistory,
    rotationOverlayDragRef,
    setInlineEditor,
    setLocalObjectRotations,
    setRotatingObjectId,
    setSelectedIds,
    touchBoard,
    user,
    logActivity,
  })

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

  const {
    copySelectionToClipboard,
    deleteSelected,
    duplicateObject,
    duplicateSelected,
    pasteClipboardObjects,
    redo,
    rotateSelectionBy,
    undo,
  } = useBoardHistoryActions({
    canEditBoard,
    db,
    deleteBoardObjectById,
    hasLiveBoardAccess,
    historyFutureRef,
    historyPastRef,
    isApplyingHistoryRef,
    logActivity,
    objectsRef,
    patchObject,
    pushHistory,
    selectedIdsRef,
    selectedObjects,
    setInlineEditor,
    setLocalConnectorGeometry,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setSelectedIds,
    touchBoard,
    user,
    writeBoardObject,
    clipboardObjectsRef,
    clipboardPasteCountRef,
  })

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
  useBoardSelectionMarqueeEffect({
    selectionActive: Boolean(selectionBox?.active),
    selectionScanAnimationRef,
    selectionScanLayerRef,
    selectionScanRectRef,
  })

  const {
    clampedCommandPaletteActiveIndex,
    closeCommandPalette,
    filteredCommandPaletteCommands,
    runCommandPaletteEntry,
    toggleThemeMode,
  } = useBoardRuntimeCommandPalette({
    activeCreatePopover,
    boardId,
    canEditBoard,
    clipboardObjectsRef,
    commandPaletteActiveIndex,
    commandPaletteInputRef,
    commandPaletteQuery,
    copySelectionToClipboard,
    createObject,
    deleteSelected,
    duplicateBoardMeta,
    duplicateObject,
    duplicateSelected,
    objectsRef,
    pasteClipboardObjects,
    redo,
    roleCanEditBoard,
    rotateSelectionBy,
    selectedIds,
    selectedIdsRef,
    selectedObject,
    selectionMode,
    setActiveCreatePopover,
    setBoardFormError,
    setCommandPaletteActiveIndex,
    setCommandPaletteQuery,
    setInteractionMode,
    setSelectedIds,
    setSelectionMode,
    setShowBoardsPanel,
    setShowCommandPalette,
    setShowShortcuts,
    setShowTemplateChooser,
    setThemeMode,
    showCommandPalette,
    showTemplateChooser,
    themeMode,
    undo,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
  })

  const {
    addComment,
    applyColorToSelection,
    beginObjectDrag,
    beginTimerEdit,
    cancelTimerEdit,
    commitResizeObject,
    commitTimerEdit,
    endObjectDrag,
    exportBoard,
    getConnectorPublisher,
    getObjectDragPublisher,
    handleAiCommandSubmit,
    handleMinimapNavigate,
    handleObjectSelection,
    ingestTextLinesAsStickies,
    moveObjectDrag,
    pauseTimer,
    replayTimeline,
    resetTimer,
    resizeObjectLocal,
    resolveSnappedEndpoint,
    startTimer,
  } = useBoardRuntimeLiveActions({
    boardId,
    canEditBoard,
    commentDraft,
    connectorPublishersRef,
    effectiveTimerMs,
    hasLiveBoardAccess,
    isTimelineReplaying,
    isVotingMode,
    lastWorldPointerRef,
    lastWorldPointerTimestampRef,
    liveDragPositionsRef,
    logActivity,
    minimapModel,
    multiDragSnapshotRef,
    objectDragPublishersRef,
    objects,
    objectsById,
    objectsRef,
    patchObject,
    pushHistory,
    replayAbortRef,
    resolveContainingFrameId,
    resolveObjectPosition,
    resolveObjectSize,
    resolveWorldPointer,
    selectedId,
    selectedIdSet,
    selectedIds,
    selectedObject,
    selectedObjects,
    selectObjectId,
    setCommentDraft,
    setDraggingObjectId,
    setIsEditingTimer,
    setIsTimelineReplaying,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setReplayingEventId,
    setResizingObjectId,
    setSelectedIds,
    setTimerDraft,
    setTimerState,
    setViewport,
    setVoteConfettiParticles,
    stageRef,
    stageSize,
    startInlineEdit,
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
        activeIndex={clampedCommandPaletteActiveIndex}
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
