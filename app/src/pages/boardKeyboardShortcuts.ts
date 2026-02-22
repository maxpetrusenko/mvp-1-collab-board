import { useEffect, type MutableRefObject } from 'react'

import type { BoardObject } from '../types/board'
import type { CommandPaletteCommand } from './boardPageTypes'
import { isEditableTarget, ROTATION_STEP_DEGREES } from './boardPageRuntimePrimitives'

type BuildCommandPaletteArgs = {
  boardId: string
  canEditBoard: boolean
  createObject: (type: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text') => Promise<BoardObject | null>
  duplicateBoardMeta: (targetBoardId: string) => Promise<void>
  roleCanEditBoard: boolean
  selectionMode: 'select' | 'area'
  setActiveCreatePopover: (value: 'shape' | 'connector' | 'text' | null) => void
  setBoardFormError: (value: string | null) => void
  setInteractionMode: (updater: 'view' | 'edit' | ((prev: 'view' | 'edit') => 'view' | 'edit')) => void
  setSelectionMode: (updater: 'select' | 'area' | ((prev: 'select' | 'area') => 'select' | 'area')) => void
  setShowBoardsPanel: (value: boolean) => void
  setShowShortcuts: (updater: boolean | ((prev: boolean) => boolean)) => void
  setShowTemplateChooser: (value: boolean) => void
  themeMode: 'light' | 'dark'
  toggleThemeMode: () => void
  zoomToFit: () => void
}

export const buildCommandPaletteCommands = ({
  boardId,
  canEditBoard,
  createObject,
  duplicateBoardMeta,
  roleCanEditBoard,
  selectionMode,
  setActiveCreatePopover,
  setBoardFormError,
  setInteractionMode,
  setSelectionMode,
  setShowBoardsPanel,
  setShowShortcuts,
  setShowTemplateChooser,
  themeMode,
  toggleThemeMode,
  zoomToFit,
}: BuildCommandPaletteArgs): CommandPaletteCommand[] => [
  {
    id: 'create-sticky',
    label: 'Create sticky note',
    description: 'Add a sticky note at the center of the current view',
    keywords: ['sticky', 'note', 'create', 'add'],
    shortcut: 'S',
    run: () => createObject('stickyNote'),
  },
  {
    id: 'open-shape-popover',
    label: 'Open shape creator',
    description: 'Open shape options for type, color, and text',
    keywords: ['shape', 'rectangle', 'circle', 'diamond', 'triangle'],
    run: () => setActiveCreatePopover('shape'),
  },
  {
    id: 'open-connector-popover',
    label: 'Open connector creator',
    description: 'Open connector options for arrow or line style',
    keywords: ['connector', 'arrow', 'line'],
    run: () => setActiveCreatePopover('connector'),
  },
  {
    id: 'open-text-popover',
    label: 'Open text creator',
    description: 'Create standalone text with color and size options',
    keywords: ['text', 'type', 'title', 'label'],
    run: () => setActiveCreatePopover('text'),
  },
  {
    id: 'zoom-to-fit',
    label: 'Zoom to fit board',
    description: 'Fit all board objects into the viewport',
    keywords: ['zoom', 'fit', 'viewport', 'center'],
    shortcut: 'Cmd/Ctrl+Shift+F',
    run: () => zoomToFit(),
  },
  {
    id: 'open-boards',
    label: 'Open boards panel',
    description: 'Open board switcher, share, and create controls',
    keywords: ['board', 'boards', 'switch', 'share'],
    run: () => setShowBoardsPanel(true),
  },
  {
    id: 'open-template-chooser',
    label: 'Open template chooser',
    description: 'Insert retro, mindmap, or kanban starter layouts',
    keywords: ['template', 'retro', 'mindmap', 'kanban', 'layout'],
    run: () => {
      if (!canEditBoard) {
        return
      }
      setShowTemplateChooser(true)
    },
  },
  {
    id: 'toggle-dark-mode',
    label: themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    description: 'Toggle board chrome theme between light and dark',
    keywords: ['theme', 'dark', 'light', 'appearance'],
    run: () => toggleThemeMode(),
  },
  {
    id: 'duplicate-current-board',
    label: 'Duplicate current board',
    description: 'Create a private copy of the current board and open it',
    keywords: ['board', 'duplicate', 'copy'],
    run: () => {
      if (!roleCanEditBoard) {
        setBoardFormError('You need edit access to duplicate this board.')
        return
      }
      void duplicateBoardMeta(boardId)
    },
  },
  {
    id: 'toggle-view-edit-mode',
    label: canEditBoard ? 'Switch to view mode' : 'Switch to edit mode',
    description: canEditBoard
      ? 'Lock object editing to prevent accidental changes'
      : 'Enable object creation and editing actions',
    keywords: ['view', 'edit', 'lock', 'mode', 'permissions'],
    run: () => {
      if (!roleCanEditBoard) {
        setInteractionMode('view')
        return
      }
      setInteractionMode((prev) => (prev === 'edit' ? 'view' : 'edit'))
    },
  },
  {
    id: 'toggle-selection-mode',
    label: selectionMode === 'select' ? 'Switch to box select mode' : 'Switch to pointer mode',
    description: 'Toggle between pointer and drag-to-select interaction modes',
    keywords: ['selection', 'pointer', 'area', 'box', 'mode'],
    run: () => setSelectionMode((prev) => (prev === 'select' ? 'area' : 'select')),
  },
  {
    id: 'toggle-shortcuts',
    label: 'Toggle keyboard shortcuts',
    description: 'Open or close the keyboard shortcuts reference',
    keywords: ['keyboard', 'shortcuts', 'help'],
    shortcut: '?',
    run: () => setShowShortcuts((prev) => !prev),
  },
]

type KeyboardShortcutArgs = {
  activeCreatePopover: 'shape' | 'connector' | 'text' | null
  canEditBoard: boolean
  closeCommandPalette: () => void
  commandPaletteActiveIndex: number
  setCommandPaletteActiveIndex: (value: number | ((prev: number) => number)) => void
  copySelectionToClipboard: () => void
  deleteSelected: () => Promise<void>
  duplicateObject: (boardObject: BoardObject) => Promise<BoardObject | null>
  duplicateSelected: () => Promise<void>
  filteredCommandPaletteCommands: CommandPaletteCommand[]
  objectsRef: MutableRefObject<BoardObject[]>
  openCommandPalette: () => void
  pasteClipboardObjects: () => Promise<void>
  redo: () => Promise<void>
  roleCanEditBoard: boolean
  rotateSelectionBy: (deltaDegrees: number) => Promise<void>
  runCommandPaletteEntry: (entry: CommandPaletteCommand) => void
  selectedIds: string[]
  selectedIdsRef: MutableRefObject<string[]>
  selectedObject: BoardObject | null
  selectionMode: 'select' | 'area'
  setActiveCreatePopover: (value: 'shape' | 'connector' | 'text' | null) => void
  setInteractionMode: (updater: 'view' | 'edit' | ((prev: 'view' | 'edit') => 'view' | 'edit')) => void
  setSelectedIds: (value: string[]) => void
  setSelectionMode: (value: 'select' | 'area') => void
  setShowShortcuts: (updater: boolean | ((prev: boolean) => boolean)) => void
  setShowTemplateChooser: (value: boolean) => void
  showCommandPalette: boolean
  showTemplateChooser: boolean
  undo: () => Promise<void>
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomToFit: () => void
  clipboardObjectsRef: MutableRefObject<BoardObject[]>
}

export const useBoardKeyboardShortcuts = ({
  activeCreatePopover,
  canEditBoard,
  closeCommandPalette,
  commandPaletteActiveIndex,
  setCommandPaletteActiveIndex,
  copySelectionToClipboard,
  deleteSelected,
  duplicateObject,
  duplicateSelected,
  filteredCommandPaletteCommands,
  objectsRef,
  openCommandPalette,
  pasteClipboardObjects,
  redo,
  roleCanEditBoard,
  rotateSelectionBy,
  runCommandPaletteEntry,
  selectedIds,
  selectedIdsRef,
  selectedObject,
  selectionMode,
  setActiveCreatePopover,
  setInteractionMode,
  setSelectedIds,
  setSelectionMode,
  setShowShortcuts,
  setShowTemplateChooser,
  showCommandPalette,
  showTemplateChooser,
  undo,
  zoomIn,
  zoomOut,
  zoomReset,
  zoomToFit,
  clipboardObjectsRef,
}: KeyboardShortcutArgs) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const isMetaCombo = event.metaKey || event.ctrlKey
      const keyLower = event.key.toLowerCase()

      if (!isMetaCombo && !event.altKey && !event.shiftKey && event.key === '/') {
        event.preventDefault()
        openCommandPalette()
        return
      }

      if (!isMetaCombo && event.shiftKey && keyLower === 'e') {
        event.preventDefault()
        if (!roleCanEditBoard) {
          setInteractionMode('view')
          return
        }
        setInteractionMode((prev) => (prev === 'edit' ? 'view' : 'edit'))
        return
      }

      if (event.key === 'Escape' && showCommandPalette) {
        event.preventDefault()
        closeCommandPalette()
        return
      }

      if (event.key === 'Escape' && showTemplateChooser) {
        event.preventDefault()
        setShowTemplateChooser(false)
        return
      }

      if (showCommandPalette) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          if (filteredCommandPaletteCommands.length > 0) {
            setCommandPaletteActiveIndex((previous) =>
              (previous + 1) % filteredCommandPaletteCommands.length,
            )
          }
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          if (filteredCommandPaletteCommands.length > 0) {
            setCommandPaletteActiveIndex((previous) =>
              (previous - 1 + filteredCommandPaletteCommands.length) % filteredCommandPaletteCommands.length,
            )
          }
          return
        }
        if (event.key === 'Enter') {
          const activeEntry = filteredCommandPaletteCommands[commandPaletteActiveIndex]
          if (!activeEntry) {
            return
          }
          event.preventDefault()
          runCommandPaletteEntry(activeEntry)
          return
        }
      }

      if (event.key === 'Escape' && activeCreatePopover) {
        event.preventDefault()
        setActiveCreatePopover(null)
        return
      }

      if (event.key === 'Escape' && selectionMode === 'area') {
        event.preventDefault()
        setSelectionMode('select')
        return
      }

      if (event.key === 'Escape' && selectedIds.length > 0) {
        event.preventDefault()
        setSelectedIds([])
        return
      }

      if (isMetaCombo && keyLower === 'a') {
        event.preventDefault()
        setSelectedIds(objectsRef.current.map((boardObject) => boardObject.id))
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void deleteSelected()
        return
      }

      if (isMetaCombo && keyLower === 'd' && (selectedIdsRef.current.length > 0 || selectedObject)) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        if (selectedIdsRef.current.length > 0) {
          void duplicateSelected()
        } else if (selectedObject) {
          void duplicateObject(selectedObject)
        }
        return
      }

      if (isMetaCombo && keyLower === 'c' && selectedIdsRef.current.length > 0) {
        if (!canEditBoard) {
          return
        }

        event.preventDefault()
        copySelectionToClipboard()
        return
      }

      if (isMetaCombo && keyLower === 'v' && clipboardObjectsRef.current.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void pasteClipboardObjects()
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'z') {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        if (event.shiftKey) {
          void redo()
        } else {
          void undo()
        }
        return
      }

      if (isMetaCombo && event.key.toLowerCase() === 'y') {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void redo()
        return
      }

      if (keyLower === 'r' && selectedIds.length > 0) {
        if (!canEditBoard) {
          return
        }
        event.preventDefault()
        void rotateSelectionBy(event.shiftKey ? -ROTATION_STEP_DEGREES : ROTATION_STEP_DEGREES)
        return
      }

      const plusPressed = event.key === '+' || event.key === '='
      const minusPressed = event.key === '-' || event.key === '_'
      if (isMetaCombo && plusPressed) {
        event.preventDefault()
        zoomIn()
        return
      }

      if (isMetaCombo && minusPressed) {
        event.preventDefault()
        zoomOut()
        return
      }

      if (isMetaCombo && keyLower === '0') {
        event.preventDefault()
        zoomReset()
        return
      }

      if (isMetaCombo && event.shiftKey && keyLower === 'f') {
        event.preventDefault()
        zoomToFit()
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeCreatePopover,
    canEditBoard,
    closeCommandPalette,
    copySelectionToClipboard,
    commandPaletteActiveIndex,
    deleteSelected,
    duplicateObject,
    duplicateSelected,
    filteredCommandPaletteCommands,
    openCommandPalette,
    pasteClipboardObjects,
    redo,
    runCommandPaletteEntry,
    roleCanEditBoard,
    selectedIds,
    selectedObject,
    selectionMode,
    showCommandPalette,
    showTemplateChooser,
    undo,
    rotateSelectionBy,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
    objectsRef,
    setActiveCreatePopover,
    setInteractionMode,
    setSelectedIds,
    setSelectionMode,
    setShowShortcuts,
    setShowTemplateChooser,
    selectedIdsRef,
    setCommandPaletteActiveIndex,
    clipboardObjectsRef,
  ])
}
