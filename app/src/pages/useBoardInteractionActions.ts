import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { BoardObject, Point } from '../types/board'
import { nowMs } from '../lib/time'
import type {
  LocalPositionOverride,
  LocalSizeOverride,
} from '../hooks/useObjectSync'

type MultiDragSnapshot = {
  anchor: Point
  members: Array<{
    id: string
    start: Point
  }>
}

type InteractionActionsContext = {
  canEditBoard: boolean
  getObjectDragPublisher: (objectId: string) => (patch: Partial<BoardObject>) => void
  isVotingMode: boolean
  liveDragPositionsRef: MutableRefObject<Record<string, Point>>
  minimapModel: {
    miniHeight: number
    miniWidth: number
    viewportWorld: { x: number; y: number; width: number; height: number }
    world: { x: number; y: number; width: number; height: number }
  }
  multiDragSnapshotRef: MutableRefObject<Record<string, MultiDragSnapshot>>
  objectsRef: MutableRefObject<BoardObject[]>
  patchObject: (
    objectId: string,
    patch: Partial<BoardObject>,
    options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
  ) => Promise<void>
  resolveContainingFrameId: (args: {
    objectId: string
    position: Point
    size: { width: number; height: number }
  }) => string | null
  resolveObjectPosition: (boardObject: BoardObject) => Point
  resolveObjectSize: (boardObject: BoardObject) => { width: number; height: number }
  selectedId: string | null
  selectedIdSet: Set<string>
  selectedIds: string[]
  selectedObjects: BoardObject[]
  selectObjectId: (objectId: string, additive?: boolean) => void
  setDraggingObjectId: Dispatch<SetStateAction<string | null>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setLocalObjectSizes: Dispatch<SetStateAction<Record<string, LocalSizeOverride>>>
  setResizingObjectId: Dispatch<SetStateAction<string | null>>
  setViewport: Dispatch<SetStateAction<{ x: number; y: number; scale: number }>>
  stageSize: { width: number; height: number }
  startInlineEdit: (boardObject: BoardObject, field: 'text' | 'title') => void
  stopZoomMomentum: () => void
  toggleVoteOnObject: (boardObject: BoardObject) => void
}

export const useBoardInteractionActions = ({
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
}: InteractionActionsContext) => {
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
    [liveDragPositionsRef, multiDragSnapshotRef, objectsRef, resolveObjectPosition, selectedIdSet, selectedIds, setDraggingObjectId],
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
    [getObjectDragPublisher, liveDragPositionsRef, multiDragSnapshotRef],
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
    [liveDragPositionsRef, multiDragSnapshotRef, objectsRef, patchObject, resolveContainingFrameId, resolveObjectSize, setDraggingObjectId, setLocalObjectPositions],
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
  }, [setLocalObjectSizes])

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
    [patchObject, setLocalObjectSizes, setResizingObjectId],
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
      setViewport,
      stageSize.height,
      stageSize.width,
      stopZoomMomentum,
    ],
  )

  return {
    applyColorToSelection,
    beginObjectDrag,
    commitResizeObject,
    endObjectDrag,
    handleMinimapNavigate,
    handleObjectSelection,
    moveObjectDrag,
    resizeObjectLocal,
  }
}
