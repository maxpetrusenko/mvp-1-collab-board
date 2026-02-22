import type { BoardLinkAccess } from './boardPageTypes'

export type SetState<T> = (value: T | ((previous: T) => T)) => void

export type SharePayload = {
  sharedWith?: unknown
  sharedRoles?: unknown
  linkAccessRole?: unknown
  message?: string
}

export type ShareUser = {
  uid: string
  getIdToken: () => Promise<string>
  displayName?: string | null
  email?: string | null
}

export type ShareResponseUpdater = (targetBoardId: string, payload: SharePayload) => void

export type ShareMutationFallback = (
  targetBoardId: string,
  collaboratorId: string,
  action: 'share' | 'revoke',
  role?: 'edit' | 'view',
) => Promise<void>

export type LinkAccessFallback = (targetBoardId: string, linkAccessRole: BoardLinkAccess) => Promise<void>

export type ResolveCollaboratorByEmail = (emailLower: string) => Promise<string>
