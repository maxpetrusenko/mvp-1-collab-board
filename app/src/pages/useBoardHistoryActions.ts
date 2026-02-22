import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { Firestore } from 'firebase/firestore'
import type { User } from 'firebase/auth'

import type { BoardObject } from '../types/board'
import type {
  HistoryEntry,
} from './boardPageTypes'
import type {
  LocalConnectorOverride,
  LocalPositionOverride,
  LocalSizeOverride,
} from '../hooks/useObjectSync'
import { cloneBoardObject, toConnectorBounds } from '../lib/boardGeometry'
import { normalizeRotationDegrees, OBJECT_DUPLICATE_OFFSET } from './boardPageRuntimePrimitives'

type HistoryActionsContext = {
  canEditBoard: boolean
  db: Firestore | null
  deleteBoardObjectById: (objectId: string) => Promise<void>
  hasLiveBoardAccess: boolean
  historyFutureRef: MutableRefObject<HistoryEntry[]>
  historyPastRef: MutableRefObject<HistoryEntry[]>
  isApplyingHistoryRef: MutableRefObject<boolean>
  logActivity: (entry: {
    actorId: string
    actorName: string
    action: string
    targetId: string | null
    targetType: BoardObject['type'] | null
  }) => Promise<void>
  objectsRef: MutableRefObject<BoardObject[]>
  patchObject: (
    objectId: string,
    patch: Partial<BoardObject>,
    options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
  ) => Promise<void>
  pushHistory: (entry: HistoryEntry) => void
  selectedIdsRef: MutableRefObject<string[]>
  selectedObjects: BoardObject[]
  setInlineEditor: Dispatch<SetStateAction<{ objectId: string; field: 'text' | 'title'; value: string } | null>>
  setLocalConnectorGeometry: Dispatch<SetStateAction<Record<string, LocalConnectorOverride>>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setLocalObjectSizes: Dispatch<SetStateAction<Record<string, LocalSizeOverride>>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  touchBoard: () => void
  user: User | null
  writeBoardObject: (boardObject: BoardObject) => Promise<void>
  clipboardObjectsRef: MutableRefObject<BoardObject[]>
  clipboardPasteCountRef: MutableRefObject<number>
}

export const useBoardHistoryActions = ({
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
}: HistoryActionsContext) => {
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
  }, [canEditBoard, db, deleteBoardObjectById, hasLiveBoardAccess, isApplyingHistoryRef, logActivity, pushHistory, selectedObjects, setInlineEditor, setLocalConnectorGeometry, setLocalObjectPositions, setLocalObjectSizes, setSelectedIds, touchBoard, user])

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
    [canEditBoard, db, hasLiveBoardAccess, isApplyingHistoryRef, logActivity, objectsRef, pushHistory, setSelectedIds, touchBoard, user, writeBoardObject],
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
  }, [canEditBoard, duplicateObject, objectsRef, selectedIdsRef, selectedObjects, setSelectedIds])

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
  }, [clipboardObjectsRef, clipboardPasteCountRef, objectsRef, selectedIdsRef])

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
  }, [canEditBoard, clipboardObjectsRef, clipboardPasteCountRef, duplicateObject, selectedIdsRef, setSelectedIds])

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
    [deleteBoardObjectById, isApplyingHistoryRef, patchObject, setSelectedIds, user, writeBoardObject],
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
  }, [applyHistoryEntry, canEditBoard, historyFutureRef, historyPastRef])

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
  }, [applyHistoryEntry, canEditBoard, historyFutureRef, historyPastRef])

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

  return {
    copySelectionToClipboard,
    deleteSelected,
    duplicateObject,
    duplicateSelected,
    pasteClipboardObjects,
    redo,
    rotateSelectionBy,
    undo,
  }
}
