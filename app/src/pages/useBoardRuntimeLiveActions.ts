import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import Konva from 'konva'
import type { User } from 'firebase/auth'

import type { BoardActivityEvent, BoardObject, Point } from '../types/board'
import type {
  TimerState,
  Viewport,
  VoteConfettiParticle,
  HistoryEntry,
} from './boardPageTypes'
import { resolveSnappedConnectorEndpoint } from './boardActionHelpers'
import { submitBoardAiCommand } from './boardAiCommandSubmit'
import { useBoardInteractionActions } from './useBoardInteractionActions'
import { useBoardSidebarActions } from './useBoardSidebarActions'
import type { ConnectorPatch } from '../lib/boardGeometry'
import {
  CONNECTOR_SNAP_THRESHOLD_PX,
  DRAG_PUBLISH_INTERVAL_MS,
} from './boardPageRuntimePrimitives'
import type { LocalPositionOverride, LocalSizeOverride } from '../hooks/useObjectSync'

type UserIdentity = User | null

type UseBoardRuntimeLiveActionsArgs = {
  boardId: string
  canEditBoard: boolean
  commentDraft: string
  connectorPublishersRef: MutableRefObject<Record<string, (patch: ConnectorPatch) => void>>
  effectiveTimerMs: number
  hasLiveBoardAccess: boolean
  isTimelineReplaying: boolean
  isVotingMode: boolean
  lastWorldPointerRef: MutableRefObject<Point | null>
  lastWorldPointerTimestampRef: MutableRefObject<number>
  liveDragPositionsRef: MutableRefObject<Record<string, Point>>
  logActivity: (entry: Omit<BoardActivityEvent, 'id' | 'boardId' | 'createdAt'>) => Promise<void>
  minimapModel: ReturnType<typeof import('./boardPageViewModels').computeMinimapModel>
  multiDragSnapshotRef: MutableRefObject<Record<string, { anchor: Point; members: Array<{ id: string; start: Point }> }>>
  objectDragPublishersRef: MutableRefObject<Record<string, (patch: Partial<BoardObject>) => void>>
  objects: BoardObject[]
  objectsById: Map<string, BoardObject>
  objectsRef: MutableRefObject<BoardObject[]>
  patchObject: (
    objectId: string,
    patch: Partial<BoardObject>,
    options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
  ) => Promise<void>
  pushHistory: (entry: HistoryEntry) => void
  replayAbortRef: MutableRefObject<boolean>
  resolveContainingFrameId: (args: { objectId: string; position: Point; size: { width: number; height: number } }) => string | null
  resolveObjectPosition: (boardObject: BoardObject) => Point
  resolveObjectSize: (boardObject: BoardObject) => { width: number; height: number }
  resolveWorldPointer: (stage: Konva.Stage) => Point | null
  selectedId: string | null
  selectedIdSet: Set<string>
  selectedIds: string[]
  selectedObject: BoardObject | null
  selectedObjects: BoardObject[]
  selectObjectId: (objectId: string, additive?: boolean) => void
  setCommentDraft: Dispatch<SetStateAction<string>>
  setDraggingObjectId: Dispatch<SetStateAction<string | null>>
  setIsEditingTimer: Dispatch<SetStateAction<boolean>>
  setIsTimelineReplaying: Dispatch<SetStateAction<boolean>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setLocalObjectSizes: Dispatch<SetStateAction<Record<string, LocalSizeOverride>>>
  setReplayingEventId: Dispatch<SetStateAction<string | null>>
  setResizingObjectId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setTimerDraft: Dispatch<SetStateAction<string>>
  setTimerState: Dispatch<SetStateAction<TimerState>>
  setViewport: Dispatch<SetStateAction<Viewport>>
  setVoteConfettiParticles: Dispatch<SetStateAction<VoteConfettiParticle[]>>
  stageRef: MutableRefObject<Konva.Stage | null>
  stageSize: { width: number; height: number }
  startInlineEdit: (boardObject: BoardObject, field: 'text' | 'title') => void
  stopZoomMomentum: () => void
  timelineEvents: BoardActivityEvent[]
  timerDraft: string
  timerRef: MutableRefObject<ReturnType<typeof import('firebase/database').ref> | null>
  timerState: TimerState
  touchBoard: () => void
  user: UserIdentity
  viewport: Viewport
  writeBoardObject: (boardObject: BoardObject) => Promise<void>
}

export const useBoardRuntimeLiveActions = ({
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
}: UseBoardRuntimeLiveActionsArgs) => {
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
    [objectDragPublishersRef, patchObject],
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
    [connectorPublishersRef, patchObject],
  )

  const resolveSnappedEndpoint = useCallback((point: Point) => {
    return resolveSnappedConnectorEndpoint({
      point,
      objects: objectsRef.current,
      thresholdPx: CONNECTOR_SNAP_THRESHOLD_PX,
    })
  }, [objectsRef])

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

  const {
    handleObjectSelection,
    applyColorToSelection,
    beginObjectDrag,
    moveObjectDrag,
    endObjectDrag,
    resizeObjectLocal,
    commitResizeObject,
    handleMinimapNavigate,
  } = useBoardInteractionActions({
    canEditBoard,
    getObjectDragPublisher,
    isVotingMode,
    liveDragPositionsRef,
    minimapModel,
    multiDragSnapshotRef,
    objectsRef,
    patchObject,
    resolveContainingFrameId,
    resolveObjectPosition,
    resolveObjectSize,
    selectedId,
    selectedIdSet,
    selectedIds,
    selectedObjects,
    selectObjectId,
    setDraggingObjectId,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setResizingObjectId,
    setViewport,
    stageSize,
    startInlineEdit,
    stopZoomMomentum,
    toggleVoteOnObject,
  })

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
      lastWorldPointerRef,
      lastWorldPointerTimestampRef,
      logActivity,
      resolveWorldPointer,
      stageRef,
      stageSize,
      user,
      viewport,
    ],
  )

  return {
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
  }
}
