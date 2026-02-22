import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Firestore } from 'firebase/firestore'
import type { User } from 'firebase/auth'

import type { BoardLinkAccess, BoardMeta } from './boardPageTypes'
import {
  applyLinkAccessFallback as applyLinkAccessFallbackHelper,
  applyShareMutationFallback as applyShareMutationFallbackHelper,
  applyShareResponseToState,
  approveAccessRequest as approveAccessRequestHelper,
  requestBoardAccess as requestBoardAccessHelper,
  resolveCollaboratorIdByEmail as resolveCollaboratorIdByEmailHelper,
  revokeSharedCollaborator as revokeSharedCollaboratorHelper,
  submitLinkSharingUpdate as submitLinkSharingUpdateHelper,
  submitShareInvite as submitShareInviteHelper,
} from './boardSharingHelpers'
import {
  normalizeLinkAccessRole,
  normalizeSharedRoles,
  normalizeSharedWith,
  shareBoardEndpoint,
} from './boardPageRuntimePrimitives'

type ShareActionsContext = {
  boardId: string
  boards: BoardMeta[]
  db: Firestore | null
  setBoardAccessMeta: Dispatch<SetStateAction<BoardMeta | null>>
  setBoardAccessRequestError: Dispatch<SetStateAction<string | null>>
  setBoardAccessRequestStatus: Dispatch<SetStateAction<string | null>>
  setBoards: Dispatch<SetStateAction<BoardMeta[]>>
  setIsShareSubmitting: Dispatch<SetStateAction<boolean>>
  setIsSubmittingAccessRequest: Dispatch<SetStateAction<boolean>>
  setShareEmail: Dispatch<SetStateAction<string>>
  setShareError: Dispatch<SetStateAction<string | null>>
  setShareStatus: Dispatch<SetStateAction<string | null>>
  shareDialogBoardId: string | null
  shareEmail: string
  shareLinkRole: BoardLinkAccess
  shareRole: 'edit' | 'view'
  user: User | null
}

export const useBoardShareActions = ({
  boardId,
  boards,
  db,
  setBoardAccessMeta,
  setBoardAccessRequestError,
  setBoardAccessRequestStatus,
  setBoards,
  setIsShareSubmitting,
  setIsSubmittingAccessRequest,
  setShareEmail,
  setShareError,
  setShareStatus,
  shareDialogBoardId,
  shareEmail,
  shareLinkRole,
  shareRole,
  user,
}: ShareActionsContext) => {
  const applyShareResponse = useCallback(
    (
      targetBoardId: string,
      payload: { sharedWith?: unknown; sharedRoles?: unknown; linkAccessRole?: unknown; message?: string },
    ) => {
      applyShareResponseToState({
        targetBoardId,
        payload,
        setBoards,
        setBoardAccessMeta,
        setShareStatus,
        normalizeSharedWith,
        normalizeSharedRoles,
        normalizeLinkAccessRole,
      })
    },
    [setBoardAccessMeta, setBoards, setShareStatus],
  )

  const applyShareMutationFallback = useCallback(
    async (
      targetBoardId: string,
      collaboratorId: string,
      action: 'share' | 'revoke',
      role: 'edit' | 'view' = 'edit',
    ) => {
      if (!db || !user) {
        throw new Error('Unable to update board sharing right now.')
      }
      await applyShareMutationFallbackHelper({
        db,
        userUid: user.uid,
        boards,
        targetBoardId,
        collaboratorId,
        action,
        role,
        applyShareResponse,
      })
    },
    [applyShareResponse, boards, db, user],
  )

  const applyLinkAccessFallback = useCallback(
    async (targetBoardId: string, linkAccessRole: BoardLinkAccess) => {
      if (!db || !user) {
        throw new Error('Unable to update URL sharing right now.')
      }
      await applyLinkAccessFallbackHelper({
        db,
        userUid: user.uid,
        boards,
        targetBoardId,
        linkAccessRole,
        applyShareResponse,
      })
    },
    [applyShareResponse, boards, db, user],
  )

  const resolveCollaboratorIdByEmail = useCallback(
    async (emailLower: string) => {
      if (!db) {
        throw new Error('Unable to look up collaborator right now.')
      }

      return resolveCollaboratorIdByEmailHelper({
        db,
        emailLower,
      })
    },
    [db],
  )

  const submitShareInvite = useCallback(async () => {
    if (!shareDialogBoardId || !user) {
      return
    }
    await submitShareInviteHelper({
      shareDialogBoardId,
      shareEmail,
      role: shareRole,
      user,
      shareBoardEndpoint,
      setIsShareSubmitting,
      setShareError,
      setShareStatus,
      setShareEmail,
      applyShareResponse,
      applyShareMutationFallback,
      resolveCollaboratorIdByEmail,
    })
  }, [
    applyShareMutationFallback,
    applyShareResponse,
    resolveCollaboratorIdByEmail,
    setIsShareSubmitting,
    setShareEmail,
    setShareError,
    setShareStatus,
    shareDialogBoardId,
    shareEmail,
    shareRole,
    user,
  ])

  const revokeSharedCollaborator = useCallback(
    async (targetBoardId: string, collaboratorId: string) => {
      if (!user) {
        return
      }
      await revokeSharedCollaboratorHelper({
        targetBoardId,
        collaboratorId,
        user,
        shareBoardEndpoint,
        setIsShareSubmitting,
        setShareError,
        setShareStatus,
        applyShareResponse,
        applyShareMutationFallback,
      })
    },
    [applyShareMutationFallback, applyShareResponse, setIsShareSubmitting, setShareError, setShareStatus, user],
  )

  const submitLinkSharingUpdate = useCallback(async () => {
    if (!shareDialogBoardId || !user) {
      return
    }
    await submitLinkSharingUpdateHelper({
      shareDialogBoardId,
      shareLinkRole,
      user,
      shareBoardEndpoint,
      setIsShareSubmitting,
      setShareError,
      setShareStatus,
      applyShareResponse,
      applyLinkAccessFallback,
    })
  }, [
    applyLinkAccessFallback,
    applyShareResponse,
    setIsShareSubmitting,
    setShareError,
    setShareStatus,
    shareDialogBoardId,
    shareLinkRole,
    user,
  ])

  const approveAccessRequest = useCallback(
    async (targetBoardId: string, requesterId: string, role: 'edit' | 'view') => {
      if (!user) {
        return
      }
      await approveAccessRequestHelper({
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
      })
    },
    [applyShareMutationFallback, applyShareResponse, db, setIsShareSubmitting, setShareError, setShareStatus, user],
  )

  const requestBoardAccess = useCallback(async () => {
    if (!user) {
      return
    }
    await requestBoardAccessHelper({
      boardId,
      user,
      shareBoardEndpoint,
      setIsSubmittingAccessRequest,
      setBoardAccessRequestError,
      setBoardAccessRequestStatus,
    })
  }, [boardId, setBoardAccessRequestError, setBoardAccessRequestStatus, setIsSubmittingAccessRequest, user])

  return {
    applyLinkAccessFallback,
    applyShareMutationFallback,
    applyShareResponse,
    approveAccessRequest,
    requestBoardAccess,
    resolveCollaboratorIdByEmail,
    revokeSharedCollaborator,
    submitLinkSharingUpdate,
    submitShareInvite,
  }
}
