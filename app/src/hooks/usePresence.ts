import { useCallback, useEffect, useRef, useState } from 'react'
import { onDisconnect, onValue, ref, remove, set, update, type Database } from 'firebase/database'

import { stableColor } from '../lib/color'
import type { CursorPresence, Point } from '../types/board'

type PresenceUser = {
  uid: string
  displayName?: string | null
  email?: string | null
} | null

type UsePresenceArgs = {
  rtdb: Database | null
  boardId: string
  user: PresenceUser
  enabled?: boolean
}

const PRESENCE_STATE_FLUSH_MS = 50
const PRESENCE_STALE_THRESHOLD_MS = 2 * 60_000
const MAX_PRESENCE_ENTRIES = 200

export const usePresence = ({ rtdb, boardId, user, enabled = true }: UsePresenceArgs) => {
  const [cursors, setCursors] = useState<Record<string, CursorPresence>>({})
  const presenceRef = useRef<ReturnType<typeof ref> | null>(null)
  const lastCursorPublishAtRef = useRef(0)
  const pendingCursorRef = useRef<Point | null>(null)
  const publishTimeoutRef = useRef<number | null>(null)
  const pendingCursorsRef = useRef<Record<string, CursorPresence> | null>(null)
  const stateFlushTimeoutRef = useRef<number | null>(null)

  const flushCursorState = useCallback(() => {
    if (stateFlushTimeoutRef.current !== null) {
      window.clearTimeout(stateFlushTimeoutRef.current)
      stateFlushTimeoutRef.current = null
    }

    const pending = pendingCursorsRef.current
    if (!pending) {
      return
    }
    pendingCursorsRef.current = null

    const now = Date.now()
    const normalized = Object.entries(pending)
      .filter(([, value]) => Boolean(value && typeof value.userId === 'string' && value.userId.trim()))
      .map(([key, value]) => [key, value] as const)
      .sort((left, right) => (right[1].lastSeen || 0) - (left[1].lastSeen || 0))
      .filter(([, value], index) => {
        if (index >= MAX_PRESENCE_ENTRIES) {
          return false
        }
        const lastSeen = typeof value.lastSeen === 'number' ? value.lastSeen : 0
        return now - lastSeen <= PRESENCE_STALE_THRESHOLD_MS
      })

    setCursors(Object.fromEntries(normalized))
  }, [])

  const scheduleCursorStateFlush = useCallback(() => {
    if (stateFlushTimeoutRef.current !== null) {
      return
    }

    stateFlushTimeoutRef.current = window.setTimeout(() => {
      flushCursorState()
    }, PRESENCE_STATE_FLUSH_MS)
  }, [flushCursorState])

  useEffect(() => {
    if (!rtdb || !enabled) {
      pendingCursorsRef.current = null
      if (stateFlushTimeoutRef.current !== null) {
        window.clearTimeout(stateFlushTimeoutRef.current)
        stateFlushTimeoutRef.current = null
      }
      pendingCursorsRef.current = {}
      scheduleCursorStateFlush()
      return
    }

    const boardPresenceRef = ref(rtdb, `presence/${boardId}`)
    const unsubscribe = onValue(boardPresenceRef, (snapshot) => {
      const next = snapshot.val() as Record<string, CursorPresence> | null
      pendingCursorsRef.current = next || {}
      scheduleCursorStateFlush()
    })

    return () => {
      unsubscribe()
      pendingCursorsRef.current = null
      if (stateFlushTimeoutRef.current !== null) {
        window.clearTimeout(stateFlushTimeoutRef.current)
        stateFlushTimeoutRef.current = null
      }
    }
  }, [boardId, enabled, rtdb, scheduleCursorStateFlush])

  useEffect(() => {
    if (!rtdb || !user || !enabled) {
      return
    }

    const userPresenceRef = ref(rtdb, `presence/${boardId}/${user.uid}`)
    presenceRef.current = userPresenceRef

    void set(userPresenceRef, {
      boardId,
      userId: user.uid,
      displayName: user.displayName || user.email || 'Anonymous',
      color: stableColor(user.uid),
      x: 0,
      y: 0,
      lastSeen: Date.now(),
      connectionId: crypto.randomUUID(),
    } satisfies CursorPresence)

    const disconnectHandler = onDisconnect(userPresenceRef)
    void disconnectHandler.remove()

    return () => {
      presenceRef.current = null
      void remove(userPresenceRef)
    }
  }, [boardId, enabled, rtdb, user])

  useEffect(() => {
    if (!presenceRef.current || !enabled) {
      return
    }

    const heartbeat = window.setInterval(() => {
      if (!presenceRef.current) {
        return
      }

      void update(presenceRef.current, { lastSeen: Date.now() })
    }, 10_000)

    return () => window.clearInterval(heartbeat)
  }, [boardId, enabled, user])

  useEffect(() => () => {
    if (publishTimeoutRef.current !== null) {
      window.clearTimeout(publishTimeoutRef.current)
      publishTimeoutRef.current = null
    }
    if (stateFlushTimeoutRef.current !== null) {
      window.clearTimeout(stateFlushTimeoutRef.current)
      stateFlushTimeoutRef.current = null
    }
    pendingCursorsRef.current = null
    pendingCursorRef.current = null
  }, [])

  const flushCursorPublish = useCallback(() => {
    if (!presenceRef.current || !pendingCursorRef.current) {
      return
    }

    const cursor = pendingCursorRef.current
    pendingCursorRef.current = null
    const publishedAt = Date.now()
    lastCursorPublishAtRef.current = publishedAt

    void update(presenceRef.current, {
      x: cursor.x,
      y: cursor.y,
      lastSeen: publishedAt,
    })
  }, [])

  const scheduleCursorPublish = useCallback((delayMs: number) => {
    if (publishTimeoutRef.current !== null) {
      return
    }
    publishTimeoutRef.current = window.setTimeout(() => {
      publishTimeoutRef.current = null
      flushCursorPublish()
    }, delayMs)
  }, [flushCursorPublish])

  const publishCursorPosition = useCallback((point: Point) => {
    if (!presenceRef.current || !enabled) {
      return
    }

    pendingCursorRef.current = point
    const now = Date.now()
    const elapsedSinceLastPublish = now - lastCursorPublishAtRef.current
    const minPublishIntervalMs = 50

    if (elapsedSinceLastPublish >= minPublishIntervalMs && publishTimeoutRef.current === null) {
      flushCursorPublish()
      return
    }

    const waitMs = Math.max(0, minPublishIntervalMs - elapsedSinceLastPublish)
    scheduleCursorPublish(waitMs)
  }, [enabled, flushCursorPublish, scheduleCursorPublish])

  return {
    cursors,
    publishCursorPosition,
  }
}
