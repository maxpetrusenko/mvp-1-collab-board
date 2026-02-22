import type { ReactNode } from 'react'
import { Copy, Eye, Pencil, Share2, Trash2, X } from 'lucide-react'

import { canEditBoardMeta } from './boardPageRuntimePrimitives'
import type { BoardMeta } from './boardPageTypes'

interface BoardBoardsListPanelProps {
  boards: BoardMeta[]
  currentBoardId: string
  onBeginBoardRename: (boardMeta: BoardMeta) => void
  onCancelBoardRename: () => void
  onClose: () => void
  onDeleteBoard: (boardId: string) => void
  onDuplicateBoard: (boardId: string) => void
  onOpenShareDialog: (boardId: string) => void
  onRenameBoardNameChange: (value: string) => void
  onScheduleBoardNavigate: (boardId: string) => void
  onSubmitBoardRename: (boardId: string) => void
  open: boolean
  ownedBoards: BoardMeta[]
  renamingBoardId: string | null
  renameBoardError: string | null
  renameBoardName: string
  sharedBoards: BoardMeta[]
  sideContent: ReactNode
  userId: string
}

export const BoardBoardsListPanel = (props: BoardBoardsListPanelProps) => {
  const {
    boards,
    currentBoardId,
    onBeginBoardRename,
    onCancelBoardRename,
    onClose,
    onDeleteBoard,
    onDuplicateBoard,
    onOpenShareDialog,
    onRenameBoardNameChange,
    onScheduleBoardNavigate,
    onSubmitBoardRename,
    open,
    ownedBoards,
    renamingBoardId,
    renameBoardError,
    renameBoardName,
    sharedBoards,
    sideContent,
    userId,
  } = props

  if (!open) {
    return null
  }

  const renderBoardListItem = (boardMeta: BoardMeta) => {
    const isOwner = boardMeta.ownerId === userId
    const canDuplicateBoard = canEditBoardMeta(boardMeta, userId)
    const collaboratorsCount = Object.keys(boardMeta.sharedRoles || {}).length

    return (
      <article
        key={boardMeta.id}
        className={`board-list-item ${boardMeta.id === currentBoardId ? 'active' : ''}`}
        data-testid={`board-list-item-${boardMeta.id}`}
      >
        <div className="board-list-link">
          {renamingBoardId === boardMeta.id ? (
            <input
              className="board-list-rename-input"
              value={renameBoardName}
              onChange={(event) => onRenameBoardNameChange(event.target.value)}
              onMouseDown={(event) => {
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.stopPropagation()
              }}
              onBlur={() => {
                onSubmitBoardRename(boardMeta.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmitBoardRename(boardMeta.id)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelBoardRename()
                }
              }}
              autoFocus
              maxLength={80}
              data-testid={`rename-board-input-${boardMeta.id}`}
            />
          ) : (
            <span
              className={`board-list-name ${isOwner ? 'board-list-name-editable' : ''}`}
              onDoubleClick={(event) => {
                if (!isOwner) {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
                onBeginBoardRename(boardMeta)
              }}
              data-testid={`board-name-${boardMeta.id}`}
            >
              {boardMeta.name}
            </span>
          )}
          {boardMeta.description ? <span className="board-list-description">{boardMeta.description}</span> : null}
          <span className="board-list-meta">
            {isOwner ? 'Owner' : 'Shared with you'}
            {isOwner && collaboratorsCount > 0
              ? ` · ${collaboratorsCount} collaborator${collaboratorsCount === 1 ? '' : 's'}`
              : ''}
          </span>
        </div>
        <div className="board-list-actions">
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom board-list-action-button"
            onClick={() => onScheduleBoardNavigate(boardMeta.id)}
            title="Open board"
            data-tooltip="Open board"
            aria-label={`Open board ${boardMeta.name}`}
            disabled={renamingBoardId === boardMeta.id}
            data-testid={`open-board-${boardMeta.id}`}
          >
            <Eye size={14} />
          </button>
          {isOwner ? (
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom board-list-action-button"
              onClick={() => onBeginBoardRename(boardMeta)}
              title="Rename board"
              data-tooltip="Rename board"
              aria-label={`Rename board ${boardMeta.name}`}
              data-testid={`rename-board-${boardMeta.id}`}
            >
              <Pencil size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom board-list-action-button"
            onClick={() => onDuplicateBoard(boardMeta.id)}
            title="Duplicate board"
            data-tooltip="Duplicate board"
            aria-label={`Duplicate board ${boardMeta.name}`}
            disabled={!canDuplicateBoard}
            data-testid={`duplicate-board-${boardMeta.id}`}
          >
            <Copy size={14} />
          </button>
          {isOwner ? (
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom board-list-action-button"
              onClick={() => onOpenShareDialog(boardMeta.id)}
              title="Share board"
              data-tooltip="Share board"
              aria-label={`Share board ${boardMeta.name}`}
              data-testid={`share-board-${boardMeta.id}`}
            >
              <Share2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom board-list-action-button"
            onClick={() => onDeleteBoard(boardMeta.id)}
            title="Delete board"
            data-tooltip="Delete board"
            aria-label={`Delete board ${boardMeta.name}`}
            disabled={!isOwner || boards.length <= 1}
            data-testid={`delete-board-${boardMeta.id}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
        {renamingBoardId === boardMeta.id && renameBoardError ? <p className="error-text">{renameBoardError}</p> : null}
      </article>
    )
  }

  return (
    <div
      className="boards-panel-backdrop"
      onClick={onClose}
      data-testid="boards-panel-backdrop"
    >
      <section
        className="boards-panel"
        onClick={(event) => event.stopPropagation()}
        data-testid="boards-panel"
      >
        <div className="boards-panel-header">
          <h3>Boards</h3>
          <button
            type="button"
            className="button-icon"
            onClick={onClose}
            aria-label="Close boards panel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="boards-panel-body">
          <div className="boards-list" data-testid="board-list">
            {boards.length === 0 ? <p className="panel-note">No boards yet.</p> : null}
            {ownedBoards.length > 0 ? (
              <section className="board-list-section" data-testid="board-list-owned">
                <h4 className="board-list-section-title">My boards</h4>
                {ownedBoards.map((boardMeta) => renderBoardListItem(boardMeta))}
              </section>
            ) : null}
            {sharedBoards.length > 0 ? (
              <section className="board-list-section" data-testid="board-list-shared">
                <h4 className="board-list-section-title">Shared with me</h4>
                {sharedBoards.map((boardMeta) => renderBoardListItem(boardMeta))}
              </section>
            ) : null}
          </div>
          <div className="boards-side">{sideContent}</div>
        </div>
      </section>
    </div>
  )
}
