import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore'

import type { BoardLinkAccess, BoardMeta } from './boardPageTypes'

type SetState<T> = (value: T | ((previous: T) => T)) => void

type SharePayload = {
  sharedWith?: unknown
  sharedRoles?: unknown
  linkAccessRole?: unknown
  message?: string
}

type ShareUser = {
  uid: string
  getIdToken: () => Promise<string>
  displayName?: string | null
  email?: string | null
}

export const applyShareResponseToState = (args: {
  targetBoardId: string
  payload: SharePayload
  setBoards: SetState<BoardMeta[]>
  setBoardAccessMeta: SetState<BoardMeta | null>
  setShareStatus: SetState<string | null>
  normalizeSharedWith: (candidate: unknown) => string[]
  normalizeSharedRoles: (candidate: unknown, sharedWith: string[]) => Record<string, 'edit' | 'view'>
  normalizeLinkAccessRole: (candidate: unknown) => BoardLinkAccess
}) => {
  const {
    targetBoardId,
    payload,
    setBoards,
    setBoardAccessMeta,
    setShareStatus,
    normalizeSharedWith,
    normalizeSharedRoles,
    normalizeLinkAccessRole,
  } = args

  setBoards((previousBoards) =>
    previousBoards.map((boardMeta) => {
      if (boardMeta.id !== targetBoardId) {
        return boardMeta
      }
      const nextSharedWith = Array.isArray(payload.sharedWith)
        ? normalizeSharedWith(payload.sharedWith)
        : boardMeta.sharedWith
      const nextSharedRoles = normalizeSharedRoles(
        payload.sharedRoles !== undefined ? payload.sharedRoles : boardMeta.sharedRoles,
        nextSharedWith,
      )
      const nextLinkAccessRole =
        payload.linkAccessRole !== undefined
          ? normalizeLinkAccessRole(payload.linkAccessRole)
          : boardMeta.linkAccessRole
      return {
        ...boardMeta,
        linkAccessRole: nextLinkAccessRole,
        sharedWith: nextSharedWith,
        sharedRoles: nextSharedRoles,
      }
    }),
  )
  setBoardAccessMeta((previous) => {
    if (!previous || previous.id !== targetBoardId) {
      return previous
    }
    const nextSharedWith = Array.isArray(payload.sharedWith) ? normalizeSharedWith(payload.sharedWith) : previous.sharedWith
    const nextSharedRoles = normalizeSharedRoles(
      payload.sharedRoles !== undefined ? payload.sharedRoles : previous.sharedRoles,
      nextSharedWith,
    )
    const nextLinkAccessRole =
      payload.linkAccessRole !== undefined ? normalizeLinkAccessRole(payload.linkAccessRole) : previous.linkAccessRole
    return {
      ...previous,
      linkAccessRole: nextLinkAccessRole,
      sharedWith: nextSharedWith,
      sharedRoles: nextSharedRoles,
    }
  })
  if (payload.message) {
    setShareStatus(payload.message)
  }
}

export const applyShareMutationFallback = async (args: {
  db: Firestore
  userUid: string
  boards: BoardMeta[]
  targetBoardId: string
  collaboratorId: string
  action: 'share' | 'revoke'
  role?: 'edit' | 'view'
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
}) => {
  const {
    db,
    userUid,
    boards,
    targetBoardId,
    collaboratorId,
    action,
    role = 'edit',
    applyShareResponse,
  } = args

  const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
  if (!targetBoardMeta) {
    throw new Error('Board metadata unavailable.')
  }
  if (targetBoardMeta.ownerId !== userUid) {
    throw new Error('Only the board owner can manage sharing.')
  }

  const sharedWithSet = new Set(targetBoardMeta.sharedWith)
  const nextSharedRoles = { ...targetBoardMeta.sharedRoles }
  if (action === 'revoke') {
    sharedWithSet.delete(collaboratorId)
    delete nextSharedRoles[collaboratorId]
  } else {
    sharedWithSet.add(collaboratorId)
    nextSharedRoles[collaboratorId] = role
  }

  const nextSharedWith = [...sharedWithSet]
  const normalizedSharedRoles = nextSharedWith.reduce<Record<string, 'edit' | 'view'>>((acc, userId) => {
    acc[userId] = nextSharedRoles[userId] === 'view' ? 'view' : 'edit'
    return acc
  }, {})

  await setDoc(
    doc(db, 'boards', targetBoardId),
    {
      ownerId: targetBoardMeta.ownerId,
      linkAccessRole: targetBoardMeta.linkAccessRole,
      sharedWith: nextSharedWith,
      sharedRoles: normalizedSharedRoles,
      updatedBy: userUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  applyShareResponse(targetBoardId, {
    sharedWith: nextSharedWith,
    sharedRoles: normalizedSharedRoles,
    message:
      action === 'revoke'
        ? 'Collaborator access removed.'
        : `Board shared successfully (${role === 'view' ? 'read-only' : 'can edit'}).`,
  })
}

export const applyLinkAccessFallback = async (args: {
  db: Firestore
  userUid: string
  boards: BoardMeta[]
  targetBoardId: string
  linkAccessRole: BoardLinkAccess
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
}) => {
  const { db, userUid, boards, targetBoardId, linkAccessRole, applyShareResponse } = args
  const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
  if (!targetBoardMeta) {
    throw new Error('Board metadata unavailable.')
  }
  if (targetBoardMeta.ownerId !== userUid) {
    throw new Error('Only the board owner can manage sharing.')
  }

  await setDoc(
    doc(db, 'boards', targetBoardId),
    {
      ownerId: targetBoardMeta.ownerId,
      linkAccessRole,
      updatedBy: userUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  applyShareResponse(targetBoardId, {
    linkAccessRole,
    message:
      linkAccessRole === 'restricted'
        ? 'Link sharing disabled.'
        : `Anyone with link can ${linkAccessRole === 'edit' ? 'edit' : 'view'}.`,
  })
}

export const resolveCollaboratorIdByEmail = async (args: {
  db: Firestore
  emailLower: string
}) => {
  const { db, emailLower } = args
  const lookupQuery = query(
    collection(db, 'users'),
    where('emailLower', '==', emailLower),
    firestoreLimit(1),
  )
  const snapshot = await getDocs(lookupQuery)
  const docSnap = snapshot.docs[0]
  if (!docSnap?.id) {
    throw new Error('Collaborator email not found.')
  }
  return docSnap.id
}

const postShareMutation = async (args: {
  user: ShareUser
  shareBoardEndpoint: string
  body: Record<string, unknown>
  defaultErrorMessage: string
}) => {
  const { user, shareBoardEndpoint, body, defaultErrorMessage } = args
  const idToken = await user.getIdToken()
  const response = await fetch(shareBoardEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & SharePayload)
    | null
  if (!response.ok) {
    throw new Error(payload?.error || defaultErrorMessage)
  }
  return payload
}

export const submitShareInvite = async (args: {
  shareDialogBoardId: string
  shareEmail: string
  role: 'edit' | 'view'
  user: ShareUser
  shareBoardEndpoint: string
  setIsShareSubmitting: SetState<boolean>
  setShareError: SetState<string | null>
  setShareStatus: SetState<string | null>
  setShareEmail: SetState<string>
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
  applyShareMutationFallback: (
    targetBoardId: string,
    collaboratorId: string,
    action: 'share' | 'revoke',
    role?: 'edit' | 'view',
  ) => Promise<void>
  resolveCollaboratorIdByEmail: (emailLower: string) => Promise<string>
}) => {
  const {
    shareDialogBoardId,
    shareEmail,
    role,
    user,
    shareBoardEndpoint,
    setIsShareSubmitting,
    setShareError,
    setShareStatus,
    setShareEmail,
    applyShareResponse,
    applyShareMutationFallback,
    resolveCollaboratorIdByEmail,
  } = args

  const trimmedEmail = shareEmail.trim().toLowerCase()
  if (!trimmedEmail) {
    setShareError('Enter an email address to share this board.')
    return
  }

  setIsShareSubmitting(true)
  setShareError(null)
  setShareStatus(null)
  try {
    try {
      const payload = await postShareMutation({
        user,
        shareBoardEndpoint,
        body: {
          boardId: shareDialogBoardId,
          email: trimmedEmail,
          action: 'share',
          role,
        },
        defaultErrorMessage: 'Unable to share board right now.',
      })

      applyShareResponse(shareDialogBoardId, {
        sharedWith: payload?.sharedWith,
        sharedRoles: payload?.sharedRoles,
        linkAccessRole: payload?.linkAccessRole,
        message:
          payload?.message ||
          `Shared with ${trimmedEmail} (${role === 'view' ? 'read-only' : 'can edit'}).`,
      })
    } catch {
      try {
        const collaboratorId = await resolveCollaboratorIdByEmail(trimmedEmail)
        await applyShareMutationFallback(shareDialogBoardId, collaboratorId, 'share', role)
        setShareStatus(`Shared with ${trimmedEmail} (${role === 'view' ? 'read-only' : 'can edit'}).`)
      } catch (resolveError) {
        const resolveMessage = resolveError instanceof Error ? resolveError.message : ''
        if (/not found/i.test(resolveMessage)) {
          throw new Error(
            'Collaborator not found. Verify the email or use the URL access controls explicitly.',
          )
        } else {
          throw resolveError
        }
      }
    }

    setShareEmail('')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to share board right now.'
    setShareError(message)
  } finally {
    setIsShareSubmitting(false)
  }
}

export const revokeSharedCollaborator = async (args: {
  targetBoardId: string
  collaboratorId: string
  user: ShareUser
  shareBoardEndpoint: string
  setIsShareSubmitting: SetState<boolean>
  setShareError: SetState<string | null>
  setShareStatus: SetState<string | null>
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
  applyShareMutationFallback: (
    targetBoardId: string,
    collaboratorId: string,
    action: 'share' | 'revoke',
    role?: 'edit' | 'view',
  ) => Promise<void>
}) => {
  const {
    targetBoardId,
    collaboratorId,
    user,
    shareBoardEndpoint,
    setIsShareSubmitting,
    setShareError,
    setShareStatus,
    applyShareResponse,
    applyShareMutationFallback,
  } = args

  setIsShareSubmitting(true)
  setShareError(null)
  setShareStatus(null)
  try {
    try {
      const payload = await postShareMutation({
        user,
        shareBoardEndpoint,
        body: {
          boardId: targetBoardId,
          userId: collaboratorId,
          action: 'revoke',
        },
        defaultErrorMessage: 'Unable to remove collaborator right now.',
      })
      applyShareResponse(targetBoardId, {
        sharedWith: payload?.sharedWith,
        sharedRoles: payload?.sharedRoles,
        linkAccessRole: payload?.linkAccessRole,
        message: payload?.message || 'Collaborator access removed.',
      })
    } catch {
      await applyShareMutationFallback(targetBoardId, collaboratorId, 'revoke')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove collaborator right now.'
    setShareError(message)
  } finally {
    setIsShareSubmitting(false)
  }
}

export const submitLinkSharingUpdate = async (args: {
  shareDialogBoardId: string
  shareLinkRole: BoardLinkAccess
  user: ShareUser
  shareBoardEndpoint: string
  setIsShareSubmitting: SetState<boolean>
  setShareError: SetState<string | null>
  setShareStatus: SetState<string | null>
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
  applyLinkAccessFallback: (targetBoardId: string, linkAccessRole: BoardLinkAccess) => Promise<void>
}) => {
  const {
    shareDialogBoardId,
    shareLinkRole,
    user,
    shareBoardEndpoint,
    setIsShareSubmitting,
    setShareError,
    setShareStatus,
    applyShareResponse,
    applyLinkAccessFallback,
  } = args

  setIsShareSubmitting(true)
  setShareError(null)
  setShareStatus(null)
  try {
    try {
      const payload = await postShareMutation({
        user,
        shareBoardEndpoint,
        body: {
          boardId: shareDialogBoardId,
          action: 'set-link-access',
          linkRole: shareLinkRole,
        },
        defaultErrorMessage: 'Unable to update URL sharing right now.',
      })
      applyShareResponse(shareDialogBoardId, {
        linkAccessRole: payload?.linkAccessRole ?? shareLinkRole,
        message:
          payload?.message ||
          (shareLinkRole === 'restricted'
            ? 'Link sharing disabled.'
            : `Anyone with link can ${shareLinkRole === 'edit' ? 'edit' : 'view'}.`),
      })
    } catch {
      await applyLinkAccessFallback(shareDialogBoardId, shareLinkRole)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update URL sharing right now.'
    setShareError(message)
  } finally {
    setIsShareSubmitting(false)
  }
}

export const approveAccessRequest = async (args: {
  targetBoardId: string
  requesterId: string
  role: 'edit' | 'view'
  user: ShareUser
  db: Firestore | null | undefined
  shareBoardEndpoint: string
  setIsShareSubmitting: SetState<boolean>
  setShareError: SetState<string | null>
  setShareStatus: SetState<string | null>
  applyShareResponse: (targetBoardId: string, payload: SharePayload) => void
  applyShareMutationFallback: (
    targetBoardId: string,
    collaboratorId: string,
    action: 'share' | 'revoke',
    role?: 'edit' | 'view',
  ) => Promise<void>
}) => {
  const {
    targetBoardId,
    requesterId,
    role,
    user,
    db,
    shareBoardEndpoint,
    setIsShareSubmitting,
    setShareError,
    setShareStatus,
    applyShareResponse,
    applyShareMutationFallback,
  } = args

  setIsShareSubmitting(true)
  setShareError(null)
  setShareStatus(null)
  try {
    try {
      const payload = await postShareMutation({
        user,
        shareBoardEndpoint,
        body: {
          boardId: targetBoardId,
          userId: requesterId,
          action: 'approve-request',
          role,
        },
        defaultErrorMessage: 'Unable to approve access request right now.',
      })
      applyShareResponse(targetBoardId, {
        sharedWith: payload?.sharedWith,
        sharedRoles: payload?.sharedRoles,
        message: payload?.message || `Access granted (${role === 'view' ? 'read-only' : 'can edit'}).`,
      })
    } catch {
      await applyShareMutationFallback(targetBoardId, requesterId, 'share', role)
      if (db) {
        await setDoc(
          doc(db, 'boards', targetBoardId, 'accessRequests', requesterId),
          {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }
      setShareStatus(`Access granted (${role === 'view' ? 'read-only' : 'can edit'}).`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to approve access request right now.'
    setShareError(message)
  } finally {
    setIsShareSubmitting(false)
  }
}

export const requestBoardAccess = async (args: {
  boardId: string
  user: ShareUser
  shareBoardEndpoint: string
  setIsSubmittingAccessRequest: SetState<boolean>
  setBoardAccessRequestError: SetState<string | null>
  setBoardAccessRequestStatus: SetState<string | null>
}) => {
  const {
    boardId,
    user,
    shareBoardEndpoint,
    setIsSubmittingAccessRequest,
    setBoardAccessRequestError,
    setBoardAccessRequestStatus,
  } = args

  setIsSubmittingAccessRequest(true)
  setBoardAccessRequestError(null)
  setBoardAccessRequestStatus(null)
  try {
    const payload = await postShareMutation({
      user,
      shareBoardEndpoint,
      body: {
        boardId,
        action: 'request-access',
        role: 'edit',
      },
      defaultErrorMessage: 'Unable to submit access request right now.',
    })
    setBoardAccessRequestStatus(payload?.message || 'Access request sent to board owner.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit access request right now.'
    setBoardAccessRequestError(message)
  } finally {
    setIsSubmittingAccessRequest(false)
  }
}
