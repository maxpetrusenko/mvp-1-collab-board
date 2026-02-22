import { doc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore'

import type { BoardLinkAccess } from './boardPageTypes'
import type {
  LinkAccessFallback,
  ResolveCollaboratorByEmail,
  SetState,
  ShareMutationFallback,
  SharePayload,
  ShareResponseUpdater,
  ShareUser,
} from './boardSharingTypes'

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
  applyShareResponse: ShareResponseUpdater
  applyShareMutationFallback: ShareMutationFallback
  resolveCollaboratorIdByEmail: ResolveCollaboratorByEmail
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
  applyShareResponse: ShareResponseUpdater
  applyShareMutationFallback: ShareMutationFallback
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
  applyShareResponse: ShareResponseUpdater
  applyLinkAccessFallback: LinkAccessFallback
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
  applyShareResponse: ShareResponseUpdater
  applyShareMutationFallback: ShareMutationFallback
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
