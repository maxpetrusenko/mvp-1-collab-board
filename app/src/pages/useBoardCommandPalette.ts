import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { BoardObject } from '../types/board'
import type { CommandPaletteCommand, CreatePopoverKey } from './boardPageTypes'
import { buildCommandPaletteCommands } from './boardKeyboardShortcuts'

type UseBoardCommandPaletteArgs = {
  boardId: string
  canEditBoard: boolean
  commandPaletteActiveIndex: number
  commandPaletteInputRef: MutableRefObject<HTMLInputElement | null>
  commandPaletteQuery: string
  createObject: (type: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text') => Promise<BoardObject | null>
  duplicateBoardMeta: (targetBoardId: string) => Promise<void>
  openPalette: boolean
  roleCanEditBoard: boolean
  selectionMode: 'select' | 'area'
  setActiveCreatePopover: Dispatch<SetStateAction<CreatePopoverKey | null>>
  setBoardFormError: Dispatch<SetStateAction<string | null>>
  setCommandPaletteActiveIndex: Dispatch<SetStateAction<number>>
  setCommandPaletteQuery: Dispatch<SetStateAction<string>>
  setInteractionMode: Dispatch<SetStateAction<'edit' | 'view'>>
  setOpenPalette: Dispatch<SetStateAction<boolean>>
  setSelectionMode: Dispatch<SetStateAction<'select' | 'area'>>
  setShowBoardsPanel: Dispatch<SetStateAction<boolean>>
  setShowShortcuts: Dispatch<SetStateAction<boolean>>
  setShowTemplateChooser: Dispatch<SetStateAction<boolean>>
  themeMode: 'light' | 'dark'
  toggleThemeMode: () => void
  zoomToFit: () => void
}

export const useBoardCommandPalette = ({
  boardId,
  canEditBoard,
  commandPaletteActiveIndex,
  commandPaletteInputRef,
  commandPaletteQuery,
  createObject,
  duplicateBoardMeta,
  openPalette,
  roleCanEditBoard,
  selectionMode,
  setActiveCreatePopover,
  setBoardFormError,
  setCommandPaletteActiveIndex,
  setCommandPaletteQuery,
  setInteractionMode,
  setOpenPalette,
  setSelectionMode,
  setShowBoardsPanel,
  setShowShortcuts,
  setShowTemplateChooser,
  themeMode,
  toggleThemeMode,
  zoomToFit,
}: UseBoardCommandPaletteArgs) => {
  const closeCommandPalette = useCallback(() => {
    setOpenPalette(false)
    setCommandPaletteQuery('')
    setCommandPaletteActiveIndex(0)
  }, [setCommandPaletteActiveIndex, setCommandPaletteQuery, setOpenPalette])

  const openCommandPalette = useCallback(() => {
    setActiveCreatePopover(null)
    setOpenPalette(true)
    setCommandPaletteQuery('')
    setCommandPaletteActiveIndex(0)
  }, [setActiveCreatePopover, setCommandPaletteActiveIndex, setCommandPaletteQuery, setOpenPalette])

  const commandPaletteCommands = useMemo<CommandPaletteCommand[]>(
    () =>
      buildCommandPaletteCommands({
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
      }),
    [
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
    ],
  )

  const filteredCommandPaletteCommands = useMemo(() => {
    const normalizedQuery = commandPaletteQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return commandPaletteCommands
    }

    const terms = normalizedQuery.split(/\s+/).filter(Boolean)
    return commandPaletteCommands.filter((command) => {
      const haystack = `${command.label} ${command.description} ${command.keywords.join(' ')}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [commandPaletteCommands, commandPaletteQuery])

  const clampedCommandPaletteActiveIndex = useMemo(() => {
    if (filteredCommandPaletteCommands.length === 0) {
      return 0
    }

    return Math.min(commandPaletteActiveIndex, filteredCommandPaletteCommands.length - 1)
  }, [commandPaletteActiveIndex, filteredCommandPaletteCommands.length])

  const runCommandPaletteEntry = useCallback(
    (entry: CommandPaletteCommand) => {
      closeCommandPalette()
      void Promise.resolve(entry.run()).catch((error) => {
        console.error('Command palette action failed', error)
      })
    },
    [closeCommandPalette],
  )

  useEffect(() => {
    if (!openPalette) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      commandPaletteInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [commandPaletteInputRef, openPalette])

  return {
    clampedCommandPaletteActiveIndex,
    closeCommandPalette,
    filteredCommandPaletteCommands,
    openCommandPalette,
    runCommandPaletteEntry,
  }
}
