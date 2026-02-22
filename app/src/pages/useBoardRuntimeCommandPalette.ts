import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { BoardObject } from '../types/board'
import type { CreatePopoverKey } from './boardPageTypes'
import { useBoardCommandPalette } from './useBoardCommandPalette'
import { useBoardKeyboardShortcuts } from './boardKeyboardShortcuts'

type UseBoardRuntimeCommandPaletteArgs = {
  activeCreatePopover: CreatePopoverKey | null
  boardId: string
  canEditBoard: boolean
  clipboardObjectsRef: MutableRefObject<BoardObject[]>
  commandPaletteActiveIndex: number
  commandPaletteInputRef: MutableRefObject<HTMLInputElement | null>
  commandPaletteQuery: string
  copySelectionToClipboard: () => void
  createObject: (type: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text') => Promise<BoardObject | null>
  deleteSelected: () => Promise<void>
  duplicateBoardMeta: (targetBoardId: string) => Promise<void>
  duplicateObject: (boardObject: BoardObject) => Promise<BoardObject | null>
  duplicateSelected: () => Promise<void>
  objectsRef: MutableRefObject<BoardObject[]>
  pasteClipboardObjects: () => Promise<void>
  redo: () => Promise<void>
  roleCanEditBoard: boolean
  rotateSelectionBy: (degrees: number) => Promise<void>
  selectedIds: string[]
  selectedIdsRef: MutableRefObject<string[]>
  selectedObject: BoardObject | null
  selectionMode: 'select' | 'area'
  setActiveCreatePopover: Dispatch<SetStateAction<CreatePopoverKey | null>>
  setBoardFormError: Dispatch<SetStateAction<string | null>>
  setCommandPaletteActiveIndex: Dispatch<SetStateAction<number>>
  setCommandPaletteQuery: Dispatch<SetStateAction<string>>
  setInteractionMode: Dispatch<SetStateAction<'edit' | 'view'>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setSelectionMode: Dispatch<SetStateAction<'select' | 'area'>>
  setShowBoardsPanel: Dispatch<SetStateAction<boolean>>
  setShowCommandPalette: Dispatch<SetStateAction<boolean>>
  setShowShortcuts: Dispatch<SetStateAction<boolean>>
  setShowTemplateChooser: Dispatch<SetStateAction<boolean>>
  setThemeMode: Dispatch<SetStateAction<'light' | 'dark'>>
  showCommandPalette: boolean
  showTemplateChooser: boolean
  themeMode: 'light' | 'dark'
  undo: () => Promise<void>
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomToFit: () => void
}

export const useBoardRuntimeCommandPalette = ({
  activeCreatePopover,
  boardId,
  canEditBoard,
  clipboardObjectsRef,
  commandPaletteActiveIndex,
  commandPaletteInputRef,
  commandPaletteQuery,
  copySelectionToClipboard,
  createObject,
  deleteSelected,
  duplicateBoardMeta,
  duplicateObject,
  duplicateSelected,
  objectsRef,
  pasteClipboardObjects,
  redo,
  roleCanEditBoard,
  rotateSelectionBy,
  selectedIds,
  selectedIdsRef,
  selectedObject,
  selectionMode,
  setActiveCreatePopover,
  setBoardFormError,
  setCommandPaletteActiveIndex,
  setCommandPaletteQuery,
  setInteractionMode,
  setSelectedIds,
  setSelectionMode,
  setShowBoardsPanel,
  setShowCommandPalette,
  setShowShortcuts,
  setShowTemplateChooser,
  setThemeMode,
  showCommandPalette,
  showTemplateChooser,
  themeMode,
  undo,
  zoomIn,
  zoomOut,
  zoomReset,
  zoomToFit,
}: UseBoardRuntimeCommandPaletteArgs) => {
  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [setThemeMode])

  const {
    clampedCommandPaletteActiveIndex,
    closeCommandPalette,
    filteredCommandPaletteCommands,
    openCommandPalette,
    runCommandPaletteEntry,
  } = useBoardCommandPalette({
    boardId,
    canEditBoard,
    commandPaletteActiveIndex,
    commandPaletteInputRef,
    commandPaletteQuery,
    createObject,
    duplicateBoardMeta,
    openPalette: showCommandPalette,
    roleCanEditBoard,
    selectionMode,
    setActiveCreatePopover,
    setBoardFormError,
    setCommandPaletteActiveIndex,
    setCommandPaletteQuery,
    setInteractionMode,
    setOpenPalette: setShowCommandPalette,
    setSelectionMode,
    setShowBoardsPanel,
    setShowShortcuts,
    setShowTemplateChooser,
    themeMode,
    toggleThemeMode,
    zoomToFit,
  })

  useBoardKeyboardShortcuts({
    activeCreatePopover,
    canEditBoard,
    closeCommandPalette,
    commandPaletteActiveIndex: clampedCommandPaletteActiveIndex,
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
  })

  return {
    clampedCommandPaletteActiveIndex,
    closeCommandPalette,
    filteredCommandPaletteCommands,
    runCommandPaletteEntry,
    toggleThemeMode,
  }
}
