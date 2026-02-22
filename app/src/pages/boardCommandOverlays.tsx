import type { MutableRefObject } from 'react'
import { X } from 'lucide-react'

import type { CommandPaletteCommand, TemplateKey } from './boardPageTypes'

interface BoardCommandPaletteModalProps {
  activeIndex: number
  filteredCommands: CommandPaletteCommand[]
  inputRef: MutableRefObject<HTMLInputElement | null>
  onActiveIndexChange: (next: number | ((previous: number) => number)) => void
  onClose: () => void
  onQueryChange: (value: string) => void
  onRunCommand: (entry: CommandPaletteCommand) => void
  open: boolean
  query: string
}

export const BoardCommandPaletteModal = (props: BoardCommandPaletteModalProps) => {
  const {
    activeIndex,
    filteredCommands,
    inputRef,
    onActiveIndexChange,
    onClose,
    onQueryChange,
    onRunCommand,
    open,
    query,
  } = props

  if (!open) {
    return null
  }

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      data-testid="command-palette-backdrop"
    >
      <section
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        data-testid="command-palette"
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
            onActiveIndexChange(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (filteredCommands.length > 0) {
                onActiveIndexChange((previous) => (previous + 1) % filteredCommands.length)
              }
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (filteredCommands.length > 0) {
                onActiveIndexChange(
                  (previous) => (previous - 1 + filteredCommands.length) % filteredCommands.length,
                )
              }
              return
            }
            if (event.key === 'Enter') {
              const activeEntry = filteredCommands[activeIndex]
              if (!activeEntry) {
                return
              }
              event.preventDefault()
              onRunCommand(activeEntry)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
          data-testid="command-palette-input"
        />
        <div className="command-palette-list" data-testid="command-palette-list">
          {filteredCommands.length === 0 ? (
            <p className="panel-note" data-testid="command-palette-empty">
              No commands found.
            </p>
          ) : (
            filteredCommands.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={`command-palette-item ${index === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => onActiveIndexChange(index)}
                onClick={() => onRunCommand(entry)}
                data-testid={`command-palette-item-${entry.id}`}
              >
                <span className="command-palette-item-label">{entry.label}</span>
                <span className="command-palette-item-description">{entry.description}</span>
                {entry.shortcut ? <span className="command-palette-item-shortcut">{entry.shortcut}</span> : null}
              </button>
            ))
          )}
        </div>
        <p className="command-palette-hint">Use ↑/↓ to navigate, Enter to run, Esc to close.</p>
      </section>
    </div>
  )
}

interface BoardTemplateChooserModalProps {
  canEditBoard: boolean
  onApplyTemplate: (template: TemplateKey) => void
  onClose: () => void
  open: boolean
}

export const BoardTemplateChooserModal = (props: BoardTemplateChooserModalProps) => {
  const { canEditBoard, onApplyTemplate, onClose, open } = props
  if (!open) {
    return null
  }

  return (
    <div
      className="template-chooser-backdrop"
      onClick={onClose}
      data-testid="template-chooser-backdrop"
    >
      <section
        className="template-chooser-modal"
        onClick={(event) => event.stopPropagation()}
        data-testid="template-chooser"
      >
        <div className="template-chooser-header">
          <h3>Start from a Template</h3>
          <button
            type="button"
            className="button-icon"
            onClick={onClose}
            aria-label="Close template chooser"
          >
            <X size={14} />
          </button>
        </div>
        <div className="template-chooser-grid">
          <button
            type="button"
            className="template-card"
            onClick={() => onApplyTemplate('retro')}
            disabled={!canEditBoard}
            data-testid="template-option-retro"
          >
            <strong>Retro</strong>
            <span>What went well, what didn&apos;t, and action items columns.</span>
          </button>
          <button
            type="button"
            className="template-card"
            onClick={() => onApplyTemplate('mindmap')}
            disabled={!canEditBoard}
            data-testid="template-option-mindmap"
          >
            <strong>Mindmap</strong>
            <span>Central topic with connected branches for fast brainstorming.</span>
          </button>
          <button
            type="button"
            className="template-card"
            onClick={() => onApplyTemplate('kanban')}
            disabled={!canEditBoard}
            data-testid="template-option-kanban"
          >
            <strong>Kanban</strong>
            <span>To Do, Doing, Done workflow scaffold with starter tasks.</span>
          </button>
        </div>
        {!canEditBoard ? (
          <p className="panel-note" data-testid="template-chooser-view-mode-note">
            Switch to edit mode to apply templates.
          </p>
        ) : null}
      </section>
    </div>
  )
}
