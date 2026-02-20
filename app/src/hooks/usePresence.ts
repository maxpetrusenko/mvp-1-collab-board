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

export const usePresence = ({ rtdb, boardId, user, enabled = true }: UsePresenceArgs) => {
  const [cursors, setCursors] = useState<Record<string, CursorPresence>>({})
  const presenceRef = useRef<ReturnType<typeof ref> | null>(null)
  const lastCursorPublishAtRef = useRef(0)

  useEffect(() => {
    if (!rtdb || !enabled) {
      return
    }

    const boardPresenceRef = ref(rtdb, `presence/${boardId}`)
    const unsubscribe = onValue(boardPresenceRef, (snapshot) => {
      const next = snapshot.val() as Record<string, CursorPresence> | null
      setCursors(next || {})
    })

    return () => unsubscribe()
  }, [boardId, enabled, rtdb])

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

  const publishCursorPosition = useCallback((point: Point) => {
    const now = Date.now()
    if (now - lastCursorPublishAtRef.current < 50) {
      return
    }

    lastCursorPublishAtRef.current = now
    if (!presenceRef.current) {
      return
    }

    void update(presenceRef.current, {
      x: point.x,
      y: point.y,
    })
  }, [])

  return {
    cursors,
    publishCursorPosition,
  }
}
