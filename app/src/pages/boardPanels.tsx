import { Copy, Plus, Trash2, X } from 'lucide-react'
import type { FormEvent } from 'react'

import type {
  BoardAccessRequest,
  BoardLinkAccess,
  BoardMeta,
} from './boardPageTypes'

interface BoardCreateFormProps {
  boardFormError: string | null
  newBoardDescription: string
  newBoardName: string
  onDescriptionChange: (value: string) => void
  onNameChange: (value: string) => void
  onSubmit: () => void
}

export const BoardCreateForm = (props: BoardCreateFormProps) => {
  const {
    boardFormError,
    newBoardDescription,
    newBoardName,
    onDescriptionChange,
    onNameChange,
    onSubmit,
  } = props

  return (
    <form
      className="board-create-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      data-testid="board-create-form"
    >
      <h4>Create Board</h4>
      <label className="board-field">
        <span>Name</span>
        <input
          value={newBoardName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Sprint planning"
          maxLength={80}
          data-testid="board-name-input"
        />
      </label>
      <label className="board-field">
        <span>Description</span>
        <textarea
          value={newBoardDescription}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Optional board summary"
          rows={3}
          maxLength={240}
          data-testid="board-description-input"
        />
      </label>
      {boardFormError ? (
        <p className="error-text" data-testid="board-form-error">
          {boardFormError}
        </p>
      ) : null}
      <button
        type="submit"
        className="button-icon button-primary with-tooltip tooltip-bottom board-create-icon-button"
        title="Create board"
        data-tooltip="Create board"
        aria-label="Create board"
        data-testid="create-board-button"
      >
        <Plus size={16} />
      </button>
    </form>
  )
}

interface BoardSharingCardProps {
  boardMeta: BoardMeta
  isShareSubmitting: boolean
  onApproveAccessRequest: (
    boardId: string,
    userId: string,
    role: 'edit' | 'view',
  ) => void
  onClose: () => void
  onCopyBoardUrl: () => void
  onLinkRoleChange: (role: BoardLinkAccess) => void
  onRevokeCollaborator: (boardId: string, collaboratorId: string) => void
  onShareEmailChange: (value: string) => void
  onShareInvite: () => void
  onShareRoleChange: (role: 'edit' | 'view') => void
  onSubmitLinkSharingUpdate: () => void
  pendingAccessRequests: BoardAccessRequest[]
  shareDialogBoardUrl: string
  shareEmail: string
  shareError: string | null
  shareLinkRole: BoardLinkAccess
  shareRole: 'edit' | 'view'
  shareStatus: string | null
}

export const BoardSharingCard = (props: BoardSharingCardProps) => {
  const {
    boardMeta,
    isShareSubmitting,
    onApproveAccessRequest,
    onClose,
    onCopyBoardUrl,
    onLinkRoleChange,
    onRevokeCollaborator,
    onShareEmailChange,
    onShareInvite,
    onShareRoleChange,
    onSubmitLinkSharingUpdate,
    pendingAccessRequests,
    shareDialogBoardUrl,
    shareEmail,
    shareError,
    shareLinkRole,
    shareRole,
    shareStatus,
  } = props

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onShareInvite()
  }

  return (
    <section className="share-dialog-card" data-testid="share-dialog">
      <div className="share-dialog-header">
        <h4>Share "{boardMeta.name}"</h4>
        <button
          type="button"
          className="button-icon"
          onClick={onClose}
          aria-label="Close share dialog"
        >
          <X size={14} />
        </button>
      </div>
      <form
        className="share-form"
        onSubmit={submitInvite}
        data-testid="share-board-form"
      >
        <label className="board-field">
          <span>Invite by email</span>
          <input
            type="email"
            value={shareEmail}
            onChange={(event) => onShareEmailChange(event.target.value)}
            placeholder="collaborator@example.com"
            data-testid="share-email-input"
          />
        </label>
        <label className="board-field">
          <span>Permission</span>
          <select
            value={shareRole}
            onChange={(event) =>
              onShareRoleChange(event.target.value === 'view' ? 'view' : 'edit')
            }
            data-testid="share-role-select"
          >
            <option value="edit">Can edit</option>
            <option value="view">Read only</option>
          </select>
        </label>
        <label className="board-field">
          <span>Anyone with URL</span>
          <select
            value={shareLinkRole}
            onChange={(event) => onLinkRoleChange(event.target.value as BoardLinkAccess)}
            data-testid="share-link-role-select"
          >
            <option value="restricted">Restricted</option>
            <option value="edit">Can edit</option>
            <option value="view">Read only</option>
          </select>
        </label>
        <button
          type="button"
          className="primary-button"
          onClick={onSubmitLinkSharingUpdate}
          disabled={isShareSubmitting}
          data-testid="share-link-role-submit-button"
        >
          {isShareSubmitting ? 'Updating…' : 'Update URL access'}
        </button>
        <label className="board-field">
          <span>Board URL</span>
          <input
            value={shareDialogBoardUrl}
            readOnly
            data-testid="share-link-url-input"
          />
        </label>
        <button
          type="button"
          className="button-icon with-tooltip tooltip-bottom board-list-action-button"
          title="Copy board URL"
          data-tooltip="Copy URL"
          aria-label="Copy board URL"
          data-testid="share-link-copy-button"
          onClick={onCopyBoardUrl}
        >
          <Copy size={14} />
        </button>
        {shareError ? (
          <p className="error-text" data-testid="share-error">
            {shareError}
          </p>
        ) : null}
        {shareStatus ? (
          <p className="panel-note" data-testid="share-status">
            {shareStatus}
          </p>
        ) : null}
        <button
          type="submit"
          className="primary-button"
          disabled={isShareSubmitting}
          data-testid="share-submit-button"
        >
          {isShareSubmitting ? 'Sharing…' : 'Share'}
        </button>
      </form>
      <div className="share-collaborators">
        <h5>Collaborators</h5>
        {boardMeta.sharedWith.length === 0 ? (
          <p className="panel-note">No collaborators yet.</p>
        ) : (
          boardMeta.sharedWith.map((collaboratorId) => (
            <div
              key={collaboratorId}
              className="share-collaborator-row"
              data-testid={`share-collaborator-${collaboratorId}`}
            >
              <span className="share-collaborator-id">{collaboratorId}</span>
              <span
                className="panel-note"
                data-testid={`share-collaborator-role-${collaboratorId}`}
              >
                {boardMeta.sharedRoles[collaboratorId] === 'view'
                  ? 'Read only'
                  : 'Can edit'}
              </span>
              <button
                type="button"
                className="button-icon with-tooltip tooltip-bottom board-list-action-button"
                disabled={isShareSubmitting}
                onClick={() => onRevokeCollaborator(boardMeta.id, collaboratorId)}
                title="Revoke access"
                data-tooltip="Revoke access"
                aria-label={`Revoke access for ${collaboratorId}`}
                data-testid={`revoke-collaborator-${collaboratorId}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="share-collaborators">
        <h5>Access requests</h5>
        {pendingAccessRequests.length === 0 ? (
          <p className="panel-note">No pending requests.</p>
        ) : (
          pendingAccessRequests.map((request) => (
            <div
              key={request.userId}
              className="share-collaborator-row"
              data-testid={`share-access-request-${request.userId}`}
            >
              <span className="share-collaborator-id">
                {request.email || request.userId}
              </span>
              <span className="panel-note">
                Requested {request.role === 'view' ? 'read only' : 'edit'} access
              </span>
              <button
                type="button"
                className="button-icon with-tooltip tooltip-bottom board-list-action-button"
                disabled={isShareSubmitting}
                onClick={() =>
                  onApproveAccessRequest(boardMeta.id, request.userId, request.role)
                }
                title="Approve access request"
                data-tooltip="Approve"
                aria-label={`Approve access request for ${request.email || request.userId}`}
                data-testid={`approve-access-request-${request.userId}`}
              >
                <Plus size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
