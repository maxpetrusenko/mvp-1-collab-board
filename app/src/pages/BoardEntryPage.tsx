import { useEffect, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'

import { db } from '../firebase/client'
import { useAuth } from '../state/AuthContext'

type BoardMeta = {
  id: string
  name: string
  ownerId: string
  sharedWith: string[]
  sharedRoles: Record<string, 'edit' | 'view'>
  createdBy: string
  updatedAt?: number
}

const LAST_BOARD_STORAGE_PREFIX = 'collabboard-last-board-id'

const normalizeSharedWith = (candidate: unknown): string[] => {
  if (!Array.isArray(candidate)) {
    return []
  }
  return candidate
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

const normalizeSharedRoles = (
  candidate: unknown,
  sharedWith: string[],
): Record<string, 'edit' | 'view'> => {
  const normalized: Record<string, 'edit' | 'view'> = {}
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    Object.entries(candidate as Record<string, unknown>).forEach(([userId, roleValue]) => {
      if (!sharedWith.includes(userId)) {
        return
      }
      normalized[userId] = roleValue === 'view' ? 'view' : 'edit'
    })
  }
  sharedWith.forEach((userId) => {
    if (!normalized[userId]) {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}

const toBoardMeta = (
  id: string,
  data: Partial<BoardMeta> & {
    id?: string
    ownerId?: unknown
    sharedWith?: unknown
    sharedRoles?: unknown
    deleted?: boolean
  },
): BoardMeta | null => {
  if (data.deleted) {
    return null
  }

  const ownerIdCandidate =
    typeof data.ownerId === 'string' && data.ownerId.trim() ? data.ownerId.trim() : ''
  const createdByCandidate =
    typeof data.createdBy === 'string' && data.createdBy.trim() ? data.createdBy.trim() : ''
  const ownerId = ownerIdCandidate || createdByCandidate
  if (!ownerId) {
    return null
  }

  const createdBy = createdByCandidate || ownerId
  const sharedWith = normalizeSharedWith(data.sharedWith).filter((entry) => entry !== ownerId)
  const sharedRoles = normalizeSharedRoles(data.sharedRoles, sharedWith)

  return {
    id: (typeof data.id === 'string' && data.id.trim() ? data.id : id).trim(),
    name: (typeof data.name === 'string' && data.name.trim() ? data.name : `Board ${id.slice(0, 8)}`).trim(),
    ownerId,
    sharedWith,
    sharedRoles,
    createdBy,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : undefined,
  }
}

const canAccessBoardMeta = (boardMeta: BoardMeta, userId: string) =>
  boardMeta.ownerId === userId || boardMeta.sharedWith.includes(userId)

export const BoardEntryPage = () => {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const lastBoardStorageKey = useMemo(
    () => (user ? `${LAST_BOARD_STORAGE_PREFIX}:${user.uid}` : LAST_BOARD_STORAGE_PREFIX),
    [user],
  )

  useEffect(() => {
    if (!user || !db) {
      return
    }

    let cancelled = false

    const parseSnapshot = (snapshot: {
      forEach: (callback: (docSnap: { id: string; data: () => unknown }) => void) => void
    }) => {
      const next: BoardMeta[] = []
      snapshot.forEach((docSnap) => {
        const boardMeta = toBoardMeta(
          docSnap.id,
          docSnap.data() as Partial<BoardMeta> & {
            ownerId?: unknown
            sharedWith?: unknown
            sharedRoles?: unknown
            deleted?: boolean
          },
        )
        if (!boardMeta) {
          return
        }
        if (!canAccessBoardMeta(boardMeta, user.uid)) {
          return
        }
        next.push(boardMeta)
      })
      return next
    }

    void (async () => {
      try {
        const ownerQuery = query(collection(db, 'boards'), where('ownerId', '==', user.uid), firestoreLimit(80))
        const legacyOwnerQuery = query(collection(db, 'boards'), where('createdBy', '==', user.uid), firestoreLimit(80))
        const sharedQuery = query(
          collection(db, 'boards'),
          where('sharedWith', 'array-contains', user.uid),
          firestoreLimit(80),
        )

        const [ownerSnap, legacyOwnerSnap, sharedSnap] = await Promise.all([
          getDocs(ownerQuery),
          getDocs(legacyOwnerQuery),
          getDocs(sharedQuery),
        ])

        const mergedById = new Map<string, BoardMeta>()
        ;[...parseSnapshot(ownerSnap), ...parseSnapshot(legacyOwnerSnap), ...parseSnapshot(sharedSnap)].forEach(
          (boardMeta) => {
            const existing = mergedById.get(boardMeta.id)
            if (!existing || (boardMeta.updatedAt || 0) >= (existing.updatedAt || 0)) {
              mergedById.set(boardMeta.id, boardMeta)
            }
          },
        )

        const accessibleBoards = [...mergedById.values()].sort(
          (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0),
        )

        let targetBoardId: string | null = null
        const lastBoardId = window.localStorage.getItem(lastBoardStorageKey)
        if (lastBoardId && accessibleBoards.some((boardMeta) => boardMeta.id === lastBoardId)) {
          targetBoardId = lastBoardId
        } else if (accessibleBoards.length > 0) {
          targetBoardId = accessibleBoards[0].id
        }

        if (!targetBoardId) {
          targetBoardId = crypto.randomUUID()
          await setDoc(doc(db, 'boards', targetBoardId), {
            id: targetBoardId,
            name: 'My first board',
            description: '',
            ownerId: user.uid,
            sharedWith: [],
            sharedRoles: {},
            createdBy: user.uid,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        if (cancelled) {
          return
        }
        navigate(`/b/${targetBoardId}`, { replace: true })
      } catch (resolverError) {
        console.error('Failed to resolve workspace entry board', resolverError)
        if (cancelled) {
          return
        }
        navigate(`/b/${crypto.randomUUID()}`, { replace: true })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [lastBoardStorageKey, navigate, user])

  if (loading) {
    return (
      <main className="loading-shell">
        <p>Loading session...</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!db) {
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
    <main className="loading-shell" data-testid="board-entry-resolving">
      <p>Opening your workspace...</p>
    </main>
  )
}
