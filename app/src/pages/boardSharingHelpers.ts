import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore'

import type { BoardLinkAccess, BoardMeta } from './boardPageTypes'
import type { SetState, SharePayload, ShareResponseUpdater } from './boardSharingTypes'

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
  applyShareResponse: ShareResponseUpdater
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
  applyShareResponse: ShareResponseUpdater
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

export {
  approveAccessRequest,
  requestBoardAccess,
  revokeSharedCollaborator,
  submitLinkSharingUpdate,
  submitShareInvite,
} from './boardSharingRequests'
