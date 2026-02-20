import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { collection, onSnapshot, type Firestore } from 'firebase/firestore'

import type { AnchorKind, BoardObject, ConnectorObject, Point } from '../types/board'

export type LocalPositionOverride = {
  point: Point
  mode: 'dragging' | 'pending'
  updatedAt: number
}

export type LocalSizeOverride = {
  size: { width: number; height: number }
  mode: 'resizing' | 'pending'
  updatedAt: number
}

export type LocalConnectorOverride = {
  start: Point
  end: Point
  fromObjectId: string | null
  toObjectId: string | null
  fromAnchor: AnchorKind | null
  toAnchor: AnchorKind | null
  mode: 'dragging' | 'pending'
  updatedAt: number
}

type YjsMirrorLike = {
  replaceSnapshot: (objects: BoardObject[]) => void
  getEncodedByteLength: () => number
}

type UseObjectSyncArgs = {
  db: Firestore | null
  boardId: string
  enabled?: boolean
  draggingObjectId: string | null
  draggingConnectorId: string | null
  resizingObjectId: string | null
  objectsRef: MutableRefObject<BoardObject[]>
  yjsMirrorRef: MutableRefObject<YjsMirrorLike | null>
  setYjsPilotMetrics: Dispatch<SetStateAction<{ objects: number; bytes: number }>>
  setObjects: Dispatch<SetStateAction<BoardObject[]>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setLocalObjectSizes: Dispatch<SetStateAction<Record<string, LocalSizeOverride>>>
  setLocalConnectorGeometry: Dispatch<SetStateAction<Record<string, LocalConnectorOverride>>>
}

const LOCAL_PENDING_TTL_MS = 3_000

const positionsEqual = (left: Point, right: Point, epsilon = 0.5) =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon

const sizesEqual = (
  left: { width: number; height: number },
  right: { width: number; height: number },
  epsilon = 0.5,
) => Math.abs(left.width - right.width) <= epsilon && Math.abs(left.height - right.height) <= epsilon

const connectorBindingsEqual = (left: LocalConnectorOverride, right: ConnectorObject) =>
  (right.fromObjectId ?? null) === left.fromObjectId &&
  (right.toObjectId ?? null) === left.toObjectId &&
  (right.fromAnchor ?? null) === left.fromAnchor &&
  (right.toAnchor ?? null) === left.toAnchor

export const useObjectSync = ({
  db,
  boardId,
  enabled = true,
  draggingObjectId,
  draggingConnectorId,
  resizingObjectId,
  objectsRef,
  yjsMirrorRef,
  setYjsPilotMetrics,
  setObjects,
  setLocalObjectPositions,
  setLocalObjectSizes,
  setLocalConnectorGeometry,
}: UseObjectSyncArgs) => {
  useEffect(() => {
    if (!db || !enabled) {
      return
    }

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
      if (yjsMirrorRef.current) {
        yjsMirrorRef.current.replaceSnapshot(nextObjects)
        setYjsPilotMetrics({
          objects: nextObjects.length,
          bytes: yjsMirrorRef.current.getEncodedByteLength(),
        })
      }

      setObjects((prevObjects) => {
        if (draggingObjectId) {
          return nextObjects.map((objectEntry) =>
            objectEntry.id === draggingObjectId
              ? prevObjects.find((candidate) => candidate.id === draggingObjectId) || objectEntry
              : objectEntry,
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

          if (localOverride.mode === 'pending' && now - localOverride.updatedAt > LOCAL_PENDING_TTL_MS) {
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

      setLocalObjectSizes((prev) => {
        if (Object.keys(prev).length === 0) {
          return prev
        }

        const now = Date.now()
        const objectById = new Map(nextObjects.map((boardObject) => [boardObject.id, boardObject]))
        const next: Record<string, LocalSizeOverride> = {}
        let changed = false

        Object.entries(prev).forEach(([objectId, localOverride]) => {
          const serverObject = objectById.get(objectId)
          if (!serverObject) {
            changed = true
            return
          }

          if (sizesEqual(serverObject.size, localOverride.size)) {
            changed = true
            return
          }

          if (localOverride.mode === 'pending' && now - localOverride.updatedAt > LOCAL_PENDING_TTL_MS) {
            changed = true
            return
          }

          if (localOverride.mode === 'resizing' && resizingObjectId !== objectId) {
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

          if (localOverride.mode === 'pending' && now - localOverride.updatedAt > LOCAL_PENDING_TTL_MS) {
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
  }, [
    boardId,
    db,
    enabled,
    draggingConnectorId,
    draggingObjectId,
    objectsRef,
    resizingObjectId,
    setLocalConnectorGeometry,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setObjects,
    setYjsPilotMetrics,
    yjsMirrorRef,
  ])
}
