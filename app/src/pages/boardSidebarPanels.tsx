import { AICommandPanel } from '../components/AICommandPanel'
import type {
  BoardActivityEvent,
  BoardComment,
  BoardObject,
} from '../types/board'
import type {
  AiCommandHistoryEntry,
} from './boardPageTypes'

interface BoardRightSidebarProps {
  addComment: () => void | Promise<void>
  aiCommandHistory: AiCommandHistoryEntry[]
  aiDisabled: boolean
  commentDraft: string
  isTimelineReplaying: boolean
  onCommentDraftChange: (value: string) => void
  onIngestTextLines: (lines: string[]) => Promise<void>
  onReplayTimeline: () => void | Promise<void>
  onSelectTimelineTarget: (targetId: string) => void
  onShowAi: () => void
  onShowComments: () => void
  onShowTimeline: () => void
  onSubmitAiCommand: (command: string) => Promise<unknown>
  onlineDisplayNames: string[]
  replayingEventId: string | null
  selectedComments: BoardComment[]
  selectedObject: BoardObject | null
  showCommentsPanel: boolean
  showTimelinePanel: boolean
  timelineEvents: BoardActivityEvent[]
}

export const BoardRightSidebar = (props: BoardRightSidebarProps) => {
  const {
    addComment,
    aiCommandHistory,
    aiDisabled,
    commentDraft,
    isTimelineReplaying,
    onCommentDraftChange,
    onIngestTextLines,
    onReplayTimeline,
    onSelectTimelineTarget,
    onShowAi,
    onShowComments,
    onShowTimeline,
    onSubmitAiCommand,
    onlineDisplayNames,
    replayingEventId,
    selectedComments,
    selectedObject,
    showCommentsPanel,
    showTimelinePanel,
    timelineEvents,
  } = props

  return (
    <aside className="right-column">
      <div className="side-tabs">
        <button
          type="button"
          className={`side-tab-button ${showCommentsPanel ? 'active' : ''}`}
          onClick={onShowComments}
          title="Show comments panel"
          aria-pressed={showCommentsPanel}
        >
          Comments
        </button>
        <button
          type="button"
          className={`side-tab-button ${showTimelinePanel ? 'active' : ''}`}
          onClick={onShowTimeline}
          title="Show activity timeline"
          aria-pressed={showTimelinePanel}
        >
          Timeline
        </button>
        <button
          type="button"
          className={`side-tab-button ${!showCommentsPanel && !showTimelinePanel ? 'active' : ''}`}
          onClick={onShowAi}
          title="Show AI assistant"
          aria-pressed={!showCommentsPanel && !showTimelinePanel}
        >
          AI
        </button>
      </div>
      {showCommentsPanel ? (
        <section className="side-panel comments-panel">
          <div className="side-panel-header">
            <h3>Comments</h3>
            {selectedObject ? (
              <span className="value-badge">{selectedComments.length}</span>
            ) : null}
          </div>
          {selectedObject ? (
            <div className="side-panel-content">
              <p className="panel-note">
                Online users: {onlineDisplayNames.join(', ') || 'none'}
              </p>
              <div className="comments-list">
                {selectedComments.length === 0 ? (
                  <p className="panel-note">No comments yet.</p>
                ) : (
                  selectedComments
                    .slice()
                    .sort((left, right) => left.createdAt - right.createdAt)
                    .map((comment) => (
                      <article key={comment.id} className="comment-item">
                        <strong>{comment.createdByName}</strong>
                        <p>{comment.text}</p>
                      </article>
                    ))
                )}
              </div>
              <textarea
                className="ai-input comment-input"
                placeholder="Add comment, mention teammates with @name"
                value={commentDraft}
                onChange={(event) => onCommentDraftChange(event.target.value)}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void addComment()
                }}
              >
                Add Comment
              </button>
            </div>
          ) : (
            <p className="panel-note">Select an object to view and add comments.</p>
          )}
        </section>
      ) : null}

      {showTimelinePanel ? (
        <section className="side-panel timeline-panel">
          <div className="side-panel-header">
            <h3>Activity Timeline</h3>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void onReplayTimeline()
              }}
            >
              {isTimelineReplaying ? 'Stop' : 'Replay'}
            </button>
          </div>
          <div className="side-panel-content">
            <div className="timeline-list">
              {timelineEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`timeline-item ${replayingEventId === event.id ? 'active' : ''}`}
                  onClick={() => {
                    if (event.targetId) {
                      onSelectTimelineTarget(event.targetId)
                    }
                  }}
                >
                  <span className="timeline-item-actor">{event.actorName}</span>
                  <span className="timeline-item-action">{event.action}</span>
                  <span className="timeline-item-time">
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              ))}
              {timelineEvents.length === 0 ? (
                <p className="panel-note">No activity yet.</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!showCommentsPanel && !showTimelinePanel ? (
        <section className="side-panel ai-panel-sidebar">
          <AICommandPanel
            disabled={aiDisabled}
            onSubmit={onSubmitAiCommand}
            onIngestTextLines={onIngestTextLines}
            history={aiCommandHistory}
          />
        </section>
      ) : null}
    </aside>
  )
}

interface BoardShortcutsModalProps {
  onClose: () => void
  open: boolean
}

export const BoardShortcutsModal = (props: BoardShortcutsModalProps) => {
  const { onClose, open } = props
  if (!open) {
    return null
  }

  return (
    <div className="shortcut-modal-backdrop" onClick={onClose}>
      <section className="shortcut-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <ul>
          <li>`Delete` or `Backspace`: delete selected object</li>
          <li>`Escape`: deselect all objects</li>
          <li>`Escape` in Box select mode: switch back to Pointer mode</li>
          <li>`Shift + Drag` (or Area tool): marquee multi-select</li>
          <li>`Cmd/Ctrl + A`: select all objects</li>
          <li>`Cmd/Ctrl + D`: duplicate selected object</li>
          <li>`Cmd/Ctrl + C`, `Cmd/Ctrl + V`: copy/paste selected object(s)</li>
          <li>`Cmd/Ctrl + Z`: undo</li>
          <li>`Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y`: redo</li>
          <li>`Shift + E`: toggle view/edit mode</li>
          <li>`/`: open command palette</li>
          <li>`?`: open/close shortcuts panel</li>
        </ul>
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  )
}
