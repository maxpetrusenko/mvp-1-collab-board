import { signInAnonymously, type User } from 'firebase/auth'
import type Konva from 'konva'

import type { BoardObject, Point } from '../types/board'
import { auth } from '../firebase/client'
import { nowMs } from '../lib/time'
import {
  AI_COMMAND_POINTER_MAX_AGE_MS,
  aiCommandEndpoint,
} from './boardPageRuntimePrimitives'

type SubmitBoardAiCommandArgs = {
  boardId: string
  canEditBoard: boolean
  command: string
  hasLiveBoardAccess: boolean
  lastWorldPointerRef: { current: Point | null }
  lastWorldPointerTimestampRef: { current: number }
  logActivity: (event: {
    actorId: string
    actorName: string
    action: string
    targetId: string | null
    targetType: BoardObject['type'] | null
  }) => Promise<void>
  resolveWorldPointer: (stage: Konva.Stage) => Point | null
  stageRef: { current: Konva.Stage | null }
  stageSize: { width: number; height: number }
  user: User | null
  viewport: { x: number; y: number; scale: number }
}

export const submitBoardAiCommand = async ({
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
}: SubmitBoardAiCommandArgs) => {
  if (!user) {
    throw new Error('Sign in required')
  }
  if (!hasLiveBoardAccess) {
    throw new Error("You don't have permission to run AI commands on this board.")
  }
  if (!canEditBoard) {
    throw new Error('Switch to edit mode to run AI commands.')
  }

  const resolveAuthToken = async () => {
    if (typeof user.getIdToken === 'function') {
      return user.getIdToken()
    }

    if (auth?.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      return auth.currentUser.getIdToken()
    }

    if (import.meta.env.DEV && auth) {
      try {
        const credentials = await signInAnonymously(auth)
        return credentials.user.getIdToken()
      } catch (tokenError) {
        console.warn('Dev auth token fallback failed for AI command submit', tokenError)
      }
    }

    throw new Error(
      'AI command auth session missing. Sign in with QA email/password instead of local bypass.',
    )
  }

  const idToken = await resolveAuthToken()
  const viewportWorld = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: stageSize.width / viewport.scale,
    height: stageSize.height / viewport.scale,
  }
  const viewportCenter = {
    x: viewportWorld.x + viewportWorld.width / 2,
    y: viewportWorld.y + viewportWorld.height / 2,
  }
  const currentWorldPointer = stageRef.current ? resolveWorldPointer(stageRef.current) : null
  const now = nowMs()
  const lastPointerAge = now - lastWorldPointerTimestampRef.current
  const hasFreshLastWorldPointer =
    Boolean(lastWorldPointerRef.current) &&
    Number.isFinite(lastWorldPointerTimestampRef.current) &&
    lastWorldPointerTimestampRef.current > 0 &&
    lastPointerAge >= 0 &&
    lastPointerAge <= AI_COMMAND_POINTER_MAX_AGE_MS
  const placementPointer = currentWorldPointer || (hasFreshLastWorldPointer ? lastWorldPointerRef.current : null)
  const placementAnchor = placementPointer || viewportCenter
  console.info('[AI_UI_DEBUG] submit', {
    boardId,
    command,
    placementAnchor,
    pointer: placementPointer,
    viewportCenter,
  })

  const response = await fetch(aiCommandEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      boardId,
      userDisplayName: user.displayName || user.email || 'Anonymous',
      command,
      clientCommandId: crypto.randomUUID(),
      placement: {
        anchor: placementAnchor,
        pointer: placementPointer,
        viewportCenter,
        viewport: viewportWorld,
      },
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string
        result?: { message?: string; aiResponse?: string; level?: 'warning'; objectCount?: number }
      }
    | null
  console.info('[AI_UI_DEBUG] response', {
    boardId,
    command,
    status: response.status,
    ok: response.ok,
    message: payload?.result?.message || null,
    aiResponse: payload?.result?.aiResponse || null,
    level: payload?.result?.level || 'info',
    objectCount: payload?.result?.objectCount ?? null,
    error: payload?.error || null,
  })

  if (!response.ok) {
    throw new Error(payload?.error || 'AI command failed')
  }

  await logActivity({
    actorId: user.uid,
    actorName: user.displayName || user.email || 'Anonymous',
    action: 'ran AI command',
    targetId: null,
    targetType: null,
  })

  return payload?.result || { message: 'Command executed and synced to the board.' }
}
