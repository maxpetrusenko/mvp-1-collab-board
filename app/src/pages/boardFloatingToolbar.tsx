import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  Circle as CircleShapeIcon,
  Copy,
  Diamond,
  Download,
  Eye,
  FileText,
  LayoutGrid,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  SquareDashed,
  SquareDashedMousePointer,
  StickyNote,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Vote,
  Waypoints,
} from 'lucide-react'
import { clamp } from '../lib/boardGeometry'
import type { CreatePopoverKey, ConnectorDraft, ShapeDraft, TextDraft } from './boardPageTypes'
import {
  CONNECTOR_COLOR_OPTIONS,
  CONNECTOR_STYLE_OPTIONS,
  SHAPE_COLOR_OPTIONS,
  SHAPE_TYPE_OPTIONS,
  TEXT_COLOR_OPTIONS,
  getColorLabel,
} from './boardPageRuntimePrimitives'
interface BoardFloatingToolbarProps {
  activeCreatePopover: CreatePopoverKey | null
  canEditBoard: boolean
  connectorCreateDraft: ConnectorDraft
  createPopoverContainerRef: MutableRefObject<HTMLDivElement | null>
  duplicateSelectionDisabled: boolean
  interactionModeCanEdit: boolean
  isVotingMode: boolean
  onCreateConnector: () => void
  onCreateFrame: () => void
  onCreateShape: () => void
  onCreateSticky: () => void
  onCreateText: () => void
  onDeleteSelection: () => void
  onDuplicateSelection: () => void
  onExportPdf: () => void; onExportPng: () => void
  onRedo: () => void
  onSetConnectorCreateDraft: Dispatch<SetStateAction<ConnectorDraft>>
  onSetInteractionMode: (mode: 'edit' | 'view') => void
  onSetSelectionMode: (mode: 'select' | 'area') => void
  onSetShapeCreateDraft: Dispatch<SetStateAction<ShapeDraft>>
  onSetShowTemplateChooser: (value: boolean) => void
  onSetTextCreateDraft: Dispatch<SetStateAction<TextDraft>>
  onSetVotingMode: Dispatch<SetStateAction<boolean>>
  onToggleCreatePopover: (popoverKey: CreatePopoverKey) => void
  onUndo: () => void
  roleCanEditBoard: boolean
  selectionMode: 'select' | 'area'
  shapeCreateDraft: ShapeDraft
  textCreateDraft: TextDraft
}
export const BoardFloatingToolbar = (props: BoardFloatingToolbarProps) => {
  const {
    activeCreatePopover,
    canEditBoard,
    connectorCreateDraft,
    createPopoverContainerRef,
    duplicateSelectionDisabled,
    interactionModeCanEdit,
    isVotingMode,
    onCreateConnector,
    onCreateFrame,
    onCreateShape,
    onCreateSticky,
    onCreateText,
    onDeleteSelection,
    onDuplicateSelection,
    onExportPdf,
    onExportPng,
    onRedo,
    onSetConnectorCreateDraft,
    onSetInteractionMode,
    onSetSelectionMode,
    onSetShapeCreateDraft,
    onSetShowTemplateChooser,
    onSetTextCreateDraft,
    onSetVotingMode,
    onToggleCreatePopover,
    onUndo,
    roleCanEditBoard,
    selectionMode,
    shapeCreateDraft,
    textCreateDraft,
  } = props
  return (
    <div className="floating-toolbar">
      <div className="tool-group" ref={createPopoverContainerRef}>
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={() => onSetShowTemplateChooser(true)}
          disabled={!canEditBoard}
          title="Template chooser"
          data-tooltip="Template chooser"
          aria-label="Open template chooser"
          data-testid="template-chooser-button"
        >
          <LayoutGrid size={16} />
        </button>
        <button
          type="button"
          className="button-icon button-primary with-tooltip"
          onClick={onCreateSticky}
          disabled={!canEditBoard}
          title="Add sticky note (S)"
          data-tooltip="Add sticky note (S)"
        >
          <StickyNote size={16} />
        </button>
        <div className="tool-launcher">
          <button
            type="button"
            className={`button-icon with-tooltip ${activeCreatePopover === 'shape' ? 'button-primary' : ''}`}
            onClick={() => onToggleCreatePopover('shape')}
            disabled={!canEditBoard}
            title="Add shape"
            data-tooltip="Add shape"
            aria-label="Open shape options"
            aria-expanded={activeCreatePopover === 'shape'}
            data-testid="add-shape-button"
          >
            <Square size={16} />
          </button>
          {activeCreatePopover === 'shape' ? (
            <div className="toolbar-popover" data-testid="shape-create-popover">
              <div className="toolbar-popover-section" data-testid="shape-create-shape-picker">
                {SHAPE_TYPE_OPTIONS.map((shapeOption) => (
                  <button
                    key={`new-shape-${shapeOption.kind}`}
                    type="button"
                    className={`shape-option ${shapeCreateDraft.shapeType === shapeOption.kind ? 'active' : ''}`}
                    onClick={() =>
                      onSetShapeCreateDraft((previous) => ({
                        ...previous,
                        shapeType: shapeOption.kind,
                      }))
                    }
                    title={`Set new shape type to ${shapeOption.label}`}
                    aria-label={`Set new shape type to ${shapeOption.label}`}
                  >
                    <span className="shape-icon" aria-hidden>
                      {shapeOption.kind === 'rectangle' ? <Square size={14} /> : null}
                      {shapeOption.kind === 'circle' ? <CircleShapeIcon size={14} /> : null}
                      {shapeOption.kind === 'diamond' ? <Diamond size={14} /> : null}
                      {shapeOption.kind === 'triangle' ? <Triangle size={14} /> : null}
                    </span>
                  </button>
                ))}
              </div>
              <div className="toolbar-popover-section toolbar-popover-swatches" data-testid="shape-create-color-picker">
                {SHAPE_COLOR_OPTIONS.map((color) => (
                  <button
                    key={`new-shape-color-${color}`}
                    type="button"
                    className={`swatch-button ${shapeCreateDraft.color === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      onSetShapeCreateDraft((previous) => ({
                        ...previous,
                        color,
                      }))
                    }
                    title={`Set new shape color to ${getColorLabel(color)}`}
                    aria-label={`Set new shape color to ${getColorLabel(color)}`}
                  />
                ))}
              </div>
              <input
                className="toolbar-popover-input"
                value={shapeCreateDraft.text}
                onChange={(event) =>
                  onSetShapeCreateDraft((previous) => ({
                    ...previous,
                    text: event.target.value,
                  }))
                }
                maxLength={120}
                placeholder="Shape label"
                data-testid="shape-create-text-input"
              />
              <button
                type="button"
                className="primary-button toolbar-popover-submit"
                onClick={onCreateShape}
                data-testid="shape-create-submit"
              >
                Add shape
              </button>
            </div>
          ) : null}
        </div>
        <div className="tool-launcher">
          <button
            type="button"
            className={`button-icon with-tooltip ${activeCreatePopover === 'text' ? 'button-primary' : ''}`}
            onClick={() => onToggleCreatePopover('text')}
            disabled={!canEditBoard}
            title="Add text (T)"
            data-tooltip="Add text (T)"
            data-testid="add-text-button"
            aria-label="Open text options"
            aria-expanded={activeCreatePopover === 'text'}
          >
            <Type size={16} />
          </button>
          {activeCreatePopover === 'text' ? (
            <div className="toolbar-popover" data-testid="text-create-popover">
              <textarea
                className="toolbar-popover-input toolbar-popover-textarea"
                value={textCreateDraft.text}
                onChange={(event) =>
                  onSetTextCreateDraft((previous) => ({
                    ...previous,
                    text: event.target.value,
                  }))
                }
                maxLength={240}
                rows={3}
                placeholder="Write any text"
                data-testid="text-create-input"
              />
              <div className="toolbar-popover-section toolbar-popover-swatches" data-testid="text-create-color-picker">
                {TEXT_COLOR_OPTIONS.map((color) => (
                  <button
                    key={`new-text-color-${color}`}
                    type="button"
                    className={`swatch-button ${textCreateDraft.color === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      onSetTextCreateDraft((previous) => ({
                        ...previous,
                        color,
                      }))
                    }
                    title={`Set new text color to ${getColorLabel(color)}`}
                    aria-label={`Set new text color to ${getColorLabel(color)}`}
                  />
                ))}
              </div>
              <label className="toolbar-popover-field">
                <span>Size</span>
                <input
                  type="number"
                  min={12}
                  max={72}
                  value={textCreateDraft.fontSize}
                  onChange={(event) =>
                    onSetTextCreateDraft((previous) => ({
                      ...previous,
                      fontSize: clamp(Number(event.target.value) || 24, 12, 72),
                    }))
                  }
                  data-testid="text-create-font-size"
                />
              </label>
              <button
                type="button"
                className="primary-button toolbar-popover-submit"
                onClick={onCreateText}
                data-testid="text-create-submit"
              >
                Add text
              </button>
            </div>
          ) : null}
        </div>
        <div className="selection-mode-toggle" role="group" aria-label="Selection mode">
          <button
            type="button"
            className={`button-icon with-tooltip ${selectionMode === 'select' ? 'button-primary' : ''}`}
            onClick={() => onSetSelectionMode('select')}
            title="Pointer mode"
            data-tooltip="Pointer mode"
            aria-label="Pointer mode"
            aria-pressed={selectionMode === 'select'}
            data-testid="selection-mode-select"
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            className={`button-icon with-tooltip ${selectionMode === 'area' ? 'button-primary' : ''}`}
            onClick={() => onSetSelectionMode('area')}
            title="Box select mode"
            data-tooltip="Box select mode"
            aria-label="Box select mode"
            aria-pressed={selectionMode === 'area'}
            data-testid="selection-mode-area"
          >
            <SquareDashedMousePointer size={16} />
          </button>
        </div>
        <div className="selection-mode-toggle" role="group" aria-label="Board interaction mode">
          <button
            type="button"
            className={`button-icon with-tooltip ${interactionModeCanEdit ? 'button-primary' : ''}`}
            onClick={() => {
              if (!roleCanEditBoard) {
                return
              }
              onSetInteractionMode('edit')
            }}
            disabled={!roleCanEditBoard}
            title="Edit mode"
            data-tooltip="Edit mode"
            aria-label="Enable edit mode"
            aria-pressed={interactionModeCanEdit}
            data-testid="interaction-mode-edit"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className={`button-icon with-tooltip ${!interactionModeCanEdit ? 'button-primary' : ''}`}
            onClick={() => onSetInteractionMode('view')}
            title="View mode"
            data-tooltip="View mode"
            aria-label="Enable view mode"
            aria-pressed={!interactionModeCanEdit}
            data-testid="interaction-mode-view"
          >
            <Eye size={16} />
          </button>
        </div>
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={onCreateFrame}
          disabled={!canEditBoard}
          title="Add frame (F)"
          data-tooltip="Add frame (F)"
        >
          <SquareDashed size={16} />
        </button>
        <div className="tool-launcher">
          <button
            type="button"
            className={`button-icon with-tooltip ${activeCreatePopover === 'connector' ? 'button-primary' : ''}`}
            onClick={() => onToggleCreatePopover('connector')}
            disabled={!canEditBoard}
            title="Add connector (C)"
            data-tooltip="Add connector (C)"
            aria-label="Open connector options"
            aria-expanded={activeCreatePopover === 'connector'}
            data-testid="add-connector-button"
          >
            <Waypoints size={16} />
          </button>
          {activeCreatePopover === 'connector' ? (
            <div className="toolbar-popover" data-testid="connector-create-popover">
              <div className="toolbar-popover-section" data-testid="new-connector-style-picker">
                {CONNECTOR_STYLE_OPTIONS.map((option) => (
                  <button
                    key={`new-connector-${option.value}`}
                    type="button"
                    className={`shape-option ${connectorCreateDraft.style === option.value ? 'active' : ''}`}
                    onClick={() =>
                      onSetConnectorCreateDraft((previous) => ({
                        ...previous,
                        style: option.value,
                      }))
                    }
                    title={`Set new connector style to ${option.label}`}
                    aria-label={`Set new connector style to ${option.label}`}
                  >
                    <span className="shape-icon" aria-hidden>
                      {option.value === 'arrow' ? '→' : '—'}
                    </span>
                  </button>
                ))}
              </div>
              <div className="toolbar-popover-section toolbar-popover-swatches" data-testid="connector-create-color-picker">
                {CONNECTOR_COLOR_OPTIONS.map((color) => (
                  <button
                    key={`new-connector-color-${color}`}
                    type="button"
                    className={`swatch-button ${connectorCreateDraft.color === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      onSetConnectorCreateDraft((previous) => ({
                        ...previous,
                        color,
                      }))
                    }
                    title={`Set new connector color to ${getColorLabel(color)}`}
                    aria-label={`Set new connector color to ${getColorLabel(color)}`}
                  />
                ))}
              </div>
              <button
                type="button"
                className="primary-button toolbar-popover-submit"
                onClick={onCreateConnector}
                data-testid="connector-create-submit"
              >
                Add connector
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="toolbar-divider" />
      <div className="tool-group">
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={onUndo}
          disabled={!canEditBoard}
          title="Undo (Cmd+Z)"
          data-tooltip="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={onRedo}
          disabled={!canEditBoard}
          title="Redo (Cmd+Shift+Z)"
          data-tooltip="Redo"
        >
          <Redo2 size={16} />
        </button>
      </div>
      <div className="toolbar-divider" />
      <div className="tool-group">
        <button
          type="button"
          className={`button-icon with-tooltip ${isVotingMode ? 'button-primary' : ''}`}
          onClick={() => onSetVotingMode((previous) => !previous)}
          disabled={!canEditBoard}
          title="Toggle voting mode (V)"
          data-tooltip={isVotingMode ? 'Disable voting mode' : 'Enable voting mode'}
          aria-label="Toggle voting mode"
        >
          <Vote size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip"
          data-testid="export-viewport-png"
          onClick={onExportPng}
          title="Export current viewport as PNG"
          data-tooltip="Export current viewport as PNG"
          aria-label="Export current viewport as PNG"
        >
          <Download size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip"
          data-testid="export-viewport-pdf"
          onClick={onExportPdf}
          title="Export current viewport as PDF"
          data-tooltip="Export current viewport as PDF"
          aria-label="Export current viewport as PDF"
        >
          <FileText size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={onDuplicateSelection}
          disabled={duplicateSelectionDisabled}
          title="Duplicate selected (Cmd/Ctrl + D)"
          data-tooltip="Duplicate selected object"
          aria-label="Duplicate selected object"
          data-testid="duplicate-selected-button"
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          className="button-icon with-tooltip"
          onClick={onDeleteSelection}
          disabled={duplicateSelectionDisabled}
          title="Delete selected (Del/Backspace)"
          data-tooltip="Delete selected objects"
          aria-label="Delete selected object"
          data-testid="delete-selected-button"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
