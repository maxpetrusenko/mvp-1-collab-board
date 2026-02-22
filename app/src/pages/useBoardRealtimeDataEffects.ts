import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  collection,
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

import type { BoardActivityEvent, BoardObject } from '../types/board'
import type {
  AiCommandHistoryEntry,
  BoardMeta,
  TimerState,
} from './boardPageTypes'
import {
  canAccessBoardMeta,
  normalizeLinkAccessRole,
  TIMER_DEFAULT_MS,
  toBoardMeta,
} from './boardPageRuntimePrimitives'
import {
  useObjectSync,
  type LocalConnectorOverride,
  type LocalPositionOverride,
  type LocalSizeOverride,
} from '../hooks/useObjectSync'
import type { YjsPilotMirror } from '../collab/yjs'

type UserIdentity = {
  uid: string
} | null

type UseBoardRealtimeDataEffectsArgs = {
  aiCommandsLimit?: number
  boardId: string
  dbInstance: import('firebase/firestore').Firestore | null
  draggingConnectorId: string | null
  draggingObjectId: string | null
  eventsLimit?: number
  hasLiveBoardAccess: boolean
  objectsRef: MutableRefObject<BoardObject[]>
  rtdbInstance: import('firebase/database').Database | null
  resizingObjectId: string | null
  setActivityEvents: Dispatch<SetStateAction<BoardActivityEvent[]>>
  setAiCommandHistory: Dispatch<SetStateAction<AiCommandHistoryEntry[]>>
  setBoardAccessError: Dispatch<SetStateAction<string | null>>
  setBoardAccessMeta: Dispatch<SetStateAction<BoardMeta | null>>
  setBoardAccessRequestError: Dispatch<SetStateAction<string | null>>
  setBoardAccessRequestStatus: Dispatch<SetStateAction<string | null>>
  setBoardAccessState: Dispatch<SetStateAction<'checking' | 'granted' | 'denied'>>
  setBoards: Dispatch<SetStateAction<BoardMeta[]>>
  setLocalConnectorGeometry: Dispatch<SetStateAction<Record<string, LocalConnectorOverride>>>
  setLocalObjectPositions: Dispatch<SetStateAction<Record<string, LocalPositionOverride>>>
  setLocalObjectSizes: Dispatch<SetStateAction<Record<string, LocalSizeOverride>>>
  setObjects: Dispatch<SetStateAction<BoardObject[]>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setTimerState: Dispatch<SetStateAction<TimerState>>
  setYjsPilotMetrics: Dispatch<SetStateAction<{ objects: number; bytes: number }>>
  timerRef: MutableRefObject<ReturnType<typeof ref> | null>
  user: UserIdentity
  yjsPilotMirrorRef: MutableRefObject<YjsPilotMirror | null>
}

export const useBoardRealtimeDataEffects = ({
  aiCommandsLimit = 24,
  boardId,
  dbInstance,
  draggingConnectorId,
  draggingObjectId,
  eventsLimit = 120,
  hasLiveBoardAccess,
  objectsRef,
  rtdbInstance,
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
}: UseBoardRealtimeDataEffectsArgs) => {
  useEffect(() => {
    if (!dbInstance || !user) {
      return
    }

    let cancelled = false
    setBoardAccessState('checking')
    setBoardAccessError(null)
    setBoardAccessRequestStatus(null)
    setBoardAccessRequestError(null)
    setBoardAccessMeta(null)

    const boardRef = doc(dbInstance, 'boards', boardId)
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
  }, [boardId, dbInstance, setBoardAccessError, setBoardAccessMeta, setBoardAccessRequestError, setBoardAccessRequestStatus, setBoardAccessState, user])

  useEffect(() => {
    if (!dbInstance || !user) {
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

    const ownerQuery = query(collection(dbInstance, 'boards'), where('ownerId', '==', user.uid), firestoreLimit(80))
    const legacyOwnerQuery = query(collection(dbInstance, 'boards'), where('createdBy', '==', user.uid), firestoreLimit(80))
    const sharedQuery = query(
      collection(dbInstance, 'boards'),
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
  }, [dbInstance, setBoards, user])

  useObjectSync({
    boardId,
    db: dbInstance,
    draggingConnectorId,
    draggingObjectId,
    enabled: hasLiveBoardAccess,
    objectsRef,
    resizingObjectId,
    setLocalConnectorGeometry,
    setLocalObjectPositions,
    setLocalObjectSizes,
    setObjects,
    setYjsPilotMetrics,
    yjsMirrorRef: yjsPilotMirrorRef,
  })

  useEffect(() => {
    if (hasLiveBoardAccess) {
      return
    }
    objectsRef.current = []
    setObjects([])
    setSelectedIds([])
  }, [hasLiveBoardAccess, objectsRef, setObjects, setSelectedIds])

  useEffect(() => {
    if (!rtdbInstance || !hasLiveBoardAccess) {
      return
    }

    const boardTimerRef = ref(rtdbInstance, `controls/${boardId}/timer`)
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
  }, [boardId, hasLiveBoardAccess, rtdbInstance, setTimerState, timerRef])

  useEffect(() => {
    if (!dbInstance || !hasLiveBoardAccess) {
      return
    }

    const eventsQuery = query(
      collection(dbInstance, 'boards', boardId, 'events'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(eventsLimit),
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
  }, [boardId, dbInstance, eventsLimit, hasLiveBoardAccess, setActivityEvents])

  useEffect(() => {
    if (!dbInstance || !hasLiveBoardAccess) {
      return
    }

    const commandsQuery = query(
      collection(dbInstance, 'boards', boardId, 'aiCommands'),
      orderBy('queuedAt', 'desc'),
      firestoreLimit(aiCommandsLimit),
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
  }, [aiCommandsLimit, boardId, dbInstance, hasLiveBoardAccess, setAiCommandHistory])
}
