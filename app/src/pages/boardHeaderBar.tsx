import { Keyboard, LayoutGrid, LogOut, Moon, Pause, Play, RotateCcw, Share2, Sun, Timer } from 'lucide-react'

import type { ConnectionStatus } from '../hooks/useConnectionStatus'
import type { BoardMeta } from './boardPageTypes'

interface BoardHeaderBarProps {
  boardId: string
  canEditBoard: boolean
  canManageCurrentBoardSharing: boolean
  closeCommandPalette: () => void
  connectionStatus: ConnectionStatus
  currentBoardMeta: BoardMeta | null
  isEditingTimer: boolean
  isRenamingCurrentBoard: boolean
  onBeginBoardRenameCurrent: () => void
  onBeginTimerEdit: () => void
  onCancelBoardRename: () => void
  onCancelTimerEdit: () => void
  onPauseTimer: () => void
  onRenameBoardNameChange: (value: string) => void
  onResetTimer: () => void
  onShareCurrentBoard: () => void
  onSignOut: () => void
  onStartTimer: () => void
  onSubmitBoardRenameCurrent: () => void
  onSubmitTimerEdit: () => void
  onToggleBoardsPanel: () => void
  onToggleShortcuts: () => void
  onToggleThemeMode: () => void
  renameBoardError: string | null
  renameBoardName: string
  showConnectionStatusPill: boolean
  showShortcuts: boolean
  themeMode: 'light' | 'dark'
  timerDisplayLabel: string
  timerDraft: string
  timerRunning: boolean
  onTimerDraftChange: (value: string) => void
}

export const BoardHeaderBar = (props: BoardHeaderBarProps) => {
  const {
    boardId,
    canEditBoard,
    canManageCurrentBoardSharing,
    closeCommandPalette,
    connectionStatus,
    currentBoardMeta,
    isEditingTimer,
    isRenamingCurrentBoard,
    onBeginBoardRenameCurrent,
    onBeginTimerEdit,
    onCancelBoardRename,
    onCancelTimerEdit,
    onPauseTimer,
    onRenameBoardNameChange,
    onResetTimer,
    onShareCurrentBoard,
    onSignOut,
    onStartTimer,
    onSubmitBoardRenameCurrent,
    onSubmitTimerEdit,
    onToggleBoardsPanel,
    onToggleShortcuts,
    onToggleThemeMode,
    renameBoardError,
    renameBoardName,
    showConnectionStatusPill,
    showShortcuts,
    themeMode,
    timerDisplayLabel,
    timerDraft,
    timerRunning,
    onTimerDraftChange,
  } = props

  return (
    <header className="board-header">
      <div className="board-header-left">
        <h1>CollabBoard</h1>
        {isRenamingCurrentBoard && currentBoardMeta ? (
          <input
            className="board-name-pill-input"
            value={renameBoardName}
            onChange={(event) => onRenameBoardNameChange(event.target.value)}
            onBlur={onSubmitBoardRenameCurrent}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmitBoardRenameCurrent()
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelBoardRename()
              }
            }}
            autoFocus
            maxLength={80}
            aria-label="Rename current board"
            data-testid="current-board-name-input"
          />
        ) : (
          <span
            className={`board-name-pill ${canManageCurrentBoardSharing ? 'board-name-pill-editable' : ''}`}
            onDoubleClick={(event) => {
              if (!canManageCurrentBoardSharing || !currentBoardMeta) {
                return
              }
              event.preventDefault()
              onBeginBoardRenameCurrent()
            }}
            title={canManageCurrentBoardSharing ? 'Double-click to rename board' : undefined}
            data-testid="current-board-name"
          >
            {currentBoardMeta?.name || `Board ${boardId.slice(0, 8)}`}
          </span>
        )}
        {isRenamingCurrentBoard && renameBoardError ? (
          <span className="error-text board-name-rename-error" data-testid="current-board-name-error">
            {renameBoardError}
          </span>
        ) : null}
        {showConnectionStatusPill ? (
          <span
            className={`sync-state-pill ${
              connectionStatus === 'reconnecting' ? 'sync-state-pill-warning' : 'sync-state-pill-syncing'
            }`}
            data-testid="connection-status-pill"
          >
            {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Syncing…'}
          </span>
        ) : null}
        <span
          className={`sync-state-pill ${canEditBoard ? 'sync-state-pill-ok' : 'sync-state-pill-warning'}`}
          data-testid="interaction-mode-pill"
        >
          {canEditBoard ? 'Edit mode' : 'View mode'}
        </span>
        <div className="timer-widget">
          <span className="timer-icon" aria-hidden>
            <Timer size={14} />
          </span>
          {isEditingTimer ? (
            <input
              className="timer-edit-input"
              value={timerDraft}
              onChange={(event) => onTimerDraftChange(event.target.value)}
              onBlur={onSubmitTimerEdit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmitTimerEdit()
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelTimerEdit()
                }
              }}
              autoFocus
              aria-label="Edit timer"
              data-testid="timer-edit-input"
            />
          ) : (
            <button
              type="button"
              className="timer-display"
              onClick={onBeginTimerEdit}
              disabled={!canEditBoard}
              title={canEditBoard ? 'Edit timer' : 'Timer is read-only in view mode'}
              aria-label="Timer display"
              data-testid="timer-display"
            >
              {timerDisplayLabel}
            </button>
          )}
          {timerRunning ? (
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom"
              onClick={onPauseTimer}
              title="Pause timer"
              data-tooltip="Pause timer"
              aria-label="Pause timer"
              data-testid="timer-pause-button"
            >
              <Pause size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="button-icon with-tooltip tooltip-bottom"
              onClick={onStartTimer}
              title="Start timer"
              data-tooltip="Start timer"
              aria-label="Start timer"
              data-testid="timer-start-button"
            >
              <Play size={16} />
            </button>
          )}
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={onResetTimer}
            title="Reset timer"
            data-tooltip="Reset timer"
            aria-label="Reset timer"
            data-testid="timer-reset-button"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div className="header-actions">
        {canManageCurrentBoardSharing && currentBoardMeta ? (
          <button
            type="button"
            className="button-icon with-tooltip tooltip-bottom"
            onClick={onShareCurrentBoard}
            title="Share board"
            data-tooltip="Share board"
            aria-label="Share current board"
            data-testid="share-current-board-button"
          >
            <Share2 size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="button-icon with-tooltip tooltip-bottom"
          onClick={() => {
            closeCommandPalette()
            onToggleBoardsPanel()
          }}
          title="Boards"
          data-tooltip="Boards"
          aria-label="Open boards panel"
          data-testid="open-boards-panel"
        >
          <LayoutGrid size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip tooltip-bottom"
          onClick={onToggleThemeMode}
          title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          data-tooltip={themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          data-testid="theme-toggle-button"
        >
          {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          type="button"
          className="button-icon with-tooltip tooltip-bottom"
          onClick={onToggleShortcuts}
          title="Keyboard shortcuts (?)"
          data-tooltip="Keyboard shortcuts"
          aria-label={showShortcuts ? 'Close keyboard shortcuts' : 'Open keyboard shortcuts'}
        >
          <Keyboard size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip tooltip-bottom"
          onClick={onSignOut}
          title="Sign out"
          data-tooltip="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
