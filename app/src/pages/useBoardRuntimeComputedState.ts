import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { collection, limit as firestoreLimit, onSnapshot, query, where } from 'firebase/firestore'

import type { BoardObject, CursorPresence } from '../types/board'
import type {
  BoardAccessRequest,
  BoardLinkAccess,
  BoardMeta,
  TimerState,
  Viewport,
} from './boardPageTypes'
import {
  CONNECTOR_COLOR_OPTIONS,
  formatTimerLabel,
  FRAME_COLOR_OPTIONS,
  getObjectBounds,
  SHAPE_COLOR_OPTIONS,
  SHAPE_TYPE_OPTIONS,
  STICKY_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
} from './boardPageRuntimePrimitives'
import { overlaps } from '../lib/boardGeometry'

type UserIdentity = {
  uid: string
  displayName?: string | null
  email?: string | null
} | null

type UseBoardRuntimeComputedStateArgs = {
  activeBoardMeta: BoardMeta | null
  boards: BoardMeta[]
  canEditBoard: boolean
  connectionStatus: string
  cursors: Record<string, CursorPresence>
  dbInstance: import('firebase/firestore').Firestore | null
  isEditingTimer: boolean
  nowMsValue: number
  objects: BoardObject[]
  renamingBoardId: string | null
  selectedId: string | null
  selectedIdSet: Set<string>
  setIsEditingTimer: Dispatch<SetStateAction<boolean>>
  setPendingAccessRequests: Dispatch<SetStateAction<BoardAccessRequest[]>>
  setShareLinkRole: Dispatch<SetStateAction<BoardLinkAccess>>
  setTimerDraft: Dispatch<SetStateAction<string>>
  shareDialogBoardId: string | null
  stageSize: { width: number; height: number }
  timerState: TimerState
  user: UserIdentity
  userId: string
  viewport: Viewport
}

export const useBoardRuntimeComputedState = ({
  activeBoardMeta,
  boards,
  canEditBoard,
  connectionStatus,
  cursors,
  dbInstance,
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
}: UseBoardRuntimeComputedStateArgs) => {
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
  }, [setShareLinkRole, shareDialogBoardMeta])

  useEffect(() => {
    if (!dbInstance || !user || !shareDialogBoardMeta || shareDialogBoardMeta.ownerId !== user.uid) {
      setPendingAccessRequests([])
      return
    }

    const accessRequestsQuery = query(
      collection(dbInstance, 'boards', shareDialogBoardMeta.id, 'accessRequests'),
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
  }, [dbInstance, setPendingAccessRequests, shareDialogBoardMeta, user])

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
      const candidateUserId = candidate.userId.trim()
      const displayName = String(candidate.displayName || '').trim()
      if (!candidateUserId || !displayName) {
        continue
      }

      const existing = deduped.get(candidateUserId)
      if (!existing || candidate.lastSeen > existing.lastSeen) {
        deduped.set(candidateUserId, {
          ...candidate,
          userId: candidateUserId,
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
  }, [effectiveTimerMs, isEditingTimer, setTimerDraft])

  useEffect(() => {
    if (!canEditBoard && isEditingTimer) {
      setIsEditingTimer(false)
    }
  }, [canEditBoard, isEditingTimer, setIsEditingTimer])

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
      return [] as typeof SHAPE_TYPE_OPTIONS
    }
    return SHAPE_TYPE_OPTIONS
  }, [selectedObject])

  const selectedComments = selectedObject?.comments || []

  return {
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
  }
}
