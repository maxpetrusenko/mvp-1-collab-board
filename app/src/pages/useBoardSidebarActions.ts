import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { set } from 'firebase/database'
import Konva from 'konva'

import type { BoardActivityEvent, BoardComment, BoardObject, Point } from '../types/board'
import type { TimerState, VoteConfettiParticle } from './boardPageTypes'
import { createImportedStickies, createVoteConfettiParticles, exportStageSnapshot } from './boardActionHelpers'
import {
  MAX_EXPORT_PIXEL_COUNT,
  MAX_PDF_EDGE_PX,
  notifyExportComplete,
  parseTimerLabelToMs,
  STICKY_COLOR_OPTIONS,
  TIMER_DEFAULT_MS,
  VOTE_CONFETTI_COLORS,
  VOTE_CONFETTI_PARTICLE_COUNT,
  formatTimerLabel,
} from './boardPageRuntimePrimitives'
import { waitMs as wait } from '../lib/time'
import { getObjectBounds } from '../lib/boardGeometry'

type SidebarActionsContext = {
  boardId: string
  canEditBoard: boolean
  commentDraft: string
  effectiveTimerMs: number
  isTimelineReplaying: boolean
  logActivity: (entry: {
    actorId: string
    actorName: string
    action: string
    targetId: string | null
    targetType: BoardObject['type'] | null
  }) => Promise<void>
  objects: BoardObject[]
  objectsById: Map<string, BoardObject>
  objectsRef: MutableRefObject<BoardObject[]>
  patchObject: (
    objectId: string,
    patch: Partial<BoardObject>,
    options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
  ) => Promise<void>
  pushHistory: (entry: { type: 'create'; object: BoardObject }) => void
  replayAbortRef: MutableRefObject<boolean>
  resolveObjectPosition: (boardObject: BoardObject) => Point
  resolveObjectSize: (boardObject: BoardObject) => { width: number; height: number }
  selectedObject: BoardObject | null
  setCommentDraft: Dispatch<SetStateAction<string>>
  setIsEditingTimer: Dispatch<SetStateAction<boolean>>
  setIsTimelineReplaying: Dispatch<SetStateAction<boolean>>
  setReplayingEventId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setTimerDraft: Dispatch<SetStateAction<string>>
  setTimerState: Dispatch<SetStateAction<TimerState>>
  setViewport: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>
  setVoteConfettiParticles: Dispatch<SetStateAction<VoteConfettiParticle[]>>
  stageRef: MutableRefObject<Konva.Stage | null>
  stageSize: { width: number; height: number }
  stopZoomMomentum: () => void
  timelineEvents: BoardActivityEvent[]
  timerDraft: string
  timerRef: MutableRefObject<import('firebase/database').DatabaseReference | null>
  timerState: TimerState
  touchBoard: () => void
  user: import('firebase/auth').User | null
  viewport: { x: number; y: number; scale: number }
  writeBoardObject: (boardObject: BoardObject) => Promise<void>
}

export const useBoardSidebarActions = ({
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
}: SidebarActionsContext) => {
  const beginTimerEdit = useCallback(() => {
    if (!canEditBoard) {
      return
    }
    setTimerDraft(formatTimerLabel(effectiveTimerMs))
    setIsEditingTimer(true)
  }, [canEditBoard, effectiveTimerMs, setIsEditingTimer, setTimerDraft])

  const cancelTimerEdit = useCallback(() => {
    setIsEditingTimer(false)
    setTimerDraft(formatTimerLabel(effectiveTimerMs))
  }, [effectiveTimerMs, setIsEditingTimer, setTimerDraft])

  const updateBoardTimer = useCallback(
    async (nextTimer: TimerState) => {
      if (!timerRef.current) {
        return
      }

      await set(timerRef.current, nextTimer)
      setTimerState(nextTimer)
    },
    [setTimerState, timerRef],
  )

  const commitTimerEdit = useCallback(async () => {
    const parsedMs = parseTimerLabelToMs(timerDraft)
    setIsEditingTimer(false)
    if (parsedMs === null) {
      setTimerDraft(formatTimerLabel(effectiveTimerMs))
      return
    }

    await updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: parsedMs,
    })
  }, [effectiveTimerMs, setIsEditingTimer, setTimerDraft, timerDraft, updateBoardTimer])

  const startTimer = useCallback(async () => {
    setIsEditingTimer(false)
    const remaining = timerState.running && timerState.endsAt
      ? Math.max(0, timerState.endsAt - Date.now())
      : timerState.remainingMs
    const next = {
      running: true,
      remainingMs: remaining,
      endsAt: Date.now() + Math.max(1_000, remaining),
    } satisfies TimerState
    await updateBoardTimer(next)
  }, [setIsEditingTimer, timerState.endsAt, timerState.remainingMs, timerState.running, updateBoardTimer])

  const pauseTimer = useCallback(async () => {
    setIsEditingTimer(false)
    const remaining = timerState.running && timerState.endsAt
      ? Math.max(0, timerState.endsAt - Date.now())
      : timerState.remainingMs
    await updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: remaining,
    })
  }, [setIsEditingTimer, timerState.endsAt, timerState.remainingMs, timerState.running, updateBoardTimer])

  const resetTimer = useCallback(async () => {
    setIsEditingTimer(false)
    await updateBoardTimer({
      running: false,
      endsAt: null,
      remainingMs: TIMER_DEFAULT_MS,
    })
  }, [setIsEditingTimer, updateBoardTimer])

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
      const particles = createVoteConfettiParticles({
        stickyObjectId: stickyObject.id,
        origin,
        colors: VOTE_CONFETTI_COLORS,
        count: VOTE_CONFETTI_PARTICLE_COUNT,
      })

      setVoteConfettiParticles((prev) => [...prev, ...particles].slice(-200))
    },
    [resolveObjectPosition, resolveObjectSize, setVoteConfettiParticles],
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
  }, [canEditBoard, commentDraft, patchObject, selectedObject, setCommentDraft, user])

  const ingestTextLinesAsStickies = useCallback(
    async (lines: string[]) => {
      if (!user) {
        return
      }
      const baseZIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )
      const basePoint = {
        x: (-viewport.x + stageSize.width / 2) / viewport.scale - 280,
        y: (-viewport.y + stageSize.height / 2) / viewport.scale - 180,
      }
      const stickies = createImportedStickies({
        lines,
        boardId,
        userUid: user.uid,
        baseZIndex,
        basePoint,
        stickyColors: STICKY_COLOR_OPTIONS,
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
      setSelectedIds,
      objectsRef,
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
  }, [isTimelineReplaying, objectsById, stageSize.height, stageSize.width, stopZoomMomentum, timelineEvents, setIsTimelineReplaying, setReplayingEventId, setSelectedIds, setViewport, objectsRef, replayAbortRef])

  const exportBoard = useCallback(
    async (format: 'png' | 'pdf', scope: 'full' | 'selection') => {
      const stage = stageRef.current
      if (!stage) {
        return
      }
      await exportStageSnapshot({
        stage,
        format,
        scope,
        viewport,
        stageSize,
        objects,
        getObjectBounds: (boardObject) => getObjectBounds(boardObject, objectsById),
        maxExportPixelCount: MAX_EXPORT_PIXEL_COUNT,
        maxPdfEdgePx: MAX_PDF_EDGE_PX,
        notifyExportComplete,
      })
    },
    [objects, objectsById, stageSize, viewport, stageRef],
  )

  return {
    addComment,
    beginTimerEdit,
    cancelTimerEdit,
    commitTimerEdit,
    exportBoard,
    ingestTextLinesAsStickies,
    pauseTimer,
    replayTimeline,
    resetTimer,
    startTimer,
    toggleVoteOnObject,
  }
}
