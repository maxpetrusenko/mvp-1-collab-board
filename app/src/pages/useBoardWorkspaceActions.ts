import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'

import type { BoardObject } from '../types/board'
import type { BoardLinkAccess, BoardMeta } from './boardPageTypes'
import {
  BOARD_DUPLICATE_BATCH_LIMIT,
  canEditBoardMeta,
  normalizeLinkAccessRole,
} from './boardPageRuntimePrimitives'
import { nowMs } from '../lib/time'

type WorkspaceActionsContext = {
  boardAccessMeta: BoardMeta | null
  boardId: string
  boardNavigationTimeoutRef: MutableRefObject<number | null>
  boards: BoardMeta[]
  currentBoardMeta: BoardMeta | null
  db: Firestore | null
  navigate: (to: string) => void
  newBoardDescription: string
  newBoardName: string
  renameBoardName: string
  renamingBoardId: string | null
  setBoardAccessMeta: Dispatch<SetStateAction<BoardMeta | null>>
  setBoardFormError: Dispatch<SetStateAction<string | null>>
  setBoards: Dispatch<SetStateAction<BoardMeta[]>>
  setCommandPaletteActiveIndex: Dispatch<SetStateAction<number>>
  setCommandPaletteQuery: Dispatch<SetStateAction<string>>
  setNewBoardDescription: Dispatch<SetStateAction<string>>
  setNewBoardName: Dispatch<SetStateAction<string>>
  setRenameBoardError: Dispatch<SetStateAction<string | null>>
  setRenameBoardName: Dispatch<SetStateAction<string>>
  setRenamingBoardId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setSelectionBox: (value: null) => void
  setShareDialogBoardId: Dispatch<SetStateAction<string | null>>
  setShareEmail: Dispatch<SetStateAction<string>>
  setShareError: Dispatch<SetStateAction<string | null>>
  setShareLinkRole: Dispatch<SetStateAction<BoardLinkAccess>>
  setShareRole: Dispatch<SetStateAction<'edit' | 'view'>>
  setShareStatus: Dispatch<SetStateAction<string | null>>
  setShowBoardsPanel: Dispatch<SetStateAction<boolean>>
  setShowCommandPalette: Dispatch<SetStateAction<boolean>>
  setShowTemplateChooser: Dispatch<SetStateAction<boolean>>
  shareDialogBoardUrl: string
  user: User | null
}

export const useBoardWorkspaceActions = ({
  boardAccessMeta,
  boardId,
  boardNavigationTimeoutRef,
  boards,
  currentBoardMeta,
  db,
  navigate,
  newBoardDescription,
  newBoardName,
  renameBoardName,
  renamingBoardId,
  setBoardAccessMeta,
  setBoardFormError,
  setBoards,
  setCommandPaletteActiveIndex,
  setCommandPaletteQuery,
  setNewBoardDescription,
  setNewBoardName,
  setRenameBoardError,
  setRenameBoardName,
  setRenamingBoardId,
  setSelectedIds,
  setSelectionBox,
  setShareDialogBoardId,
  setShareEmail,
  setShareError,
  setShareLinkRole,
  setShareRole,
  setShareStatus,
  setShowBoardsPanel,
  setShowCommandPalette,
  setShowTemplateChooser,
  shareDialogBoardUrl,
  user,
}: WorkspaceActionsContext) => {
  const navigateToBoard = useCallback(
    (nextBoardId: string) => {
      if (boardNavigationTimeoutRef.current !== null) {
        window.clearTimeout(boardNavigationTimeoutRef.current)
        boardNavigationTimeoutRef.current = null
      }
      setShareDialogBoardId(null)
      setShareEmail('')
      setShareRole('edit')
      setShareError(null)
      setShareStatus(null)
      setRenamingBoardId(null)
      setRenameBoardName('')
      setRenameBoardError(null)
      setShowCommandPalette(false)
      setCommandPaletteQuery('')
      setCommandPaletteActiveIndex(0)
      setShowTemplateChooser(false)
      setShowBoardsPanel(false)
      setSelectionBox(null)
      setSelectedIds([])
      navigate(`/b/${nextBoardId}`)
    },
    [
      boardNavigationTimeoutRef,
      navigate,
      setCommandPaletteActiveIndex,
      setCommandPaletteQuery,
      setRenameBoardError,
      setRenameBoardName,
      setRenamingBoardId,
      setSelectedIds,
      setSelectionBox,
      setShareDialogBoardId,
      setShareEmail,
      setShareError,
      setShareRole,
      setShareStatus,
      setShowBoardsPanel,
      setShowCommandPalette,
      setShowTemplateChooser,
    ],
  )

  const clearBoardNavigateTimeout = useCallback(() => {
    if (boardNavigationTimeoutRef.current === null) {
      return
    }
    window.clearTimeout(boardNavigationTimeoutRef.current)
    boardNavigationTimeoutRef.current = null
  }, [boardNavigationTimeoutRef])

  const scheduleBoardNavigate = useCallback(
    (targetBoardId: string) => {
      clearBoardNavigateTimeout()
      boardNavigationTimeoutRef.current = window.setTimeout(() => {
        boardNavigationTimeoutRef.current = null
        navigateToBoard(targetBoardId)
      }, 180)
    },
    [boardNavigationTimeoutRef, clearBoardNavigateTimeout, navigateToBoard],
  )

  useEffect(
    () => () => {
      clearBoardNavigateTimeout()
    },
    [clearBoardNavigateTimeout],
  )

  const createBoard = useCallback(async () => {
    if (!db || !user) {
      return
    }

    const trimmedName = newBoardName.trim()
    if (!trimmedName) {
      setBoardFormError('Board name is required')
      return
    }

    const id = crypto.randomUUID()
    await setDoc(doc(db, 'boards', id), {
      id,
      name: trimmedName,
      description: newBoardDescription.trim(),
      ownerId: user.uid,
      linkAccessRole: 'restricted',
      sharedWith: [],
      sharedRoles: {},
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    setNewBoardName('')
    setNewBoardDescription('')
    setBoardFormError(null)
    navigateToBoard(id)
  }, [db, navigateToBoard, newBoardDescription, newBoardName, setBoardFormError, setNewBoardDescription, setNewBoardName, user])

  const duplicateBoardMeta = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      const dbInstance = db

      const targetBoardMeta =
        boards.find((candidate) => candidate.id === targetBoardId) ||
        (currentBoardMeta?.id === targetBoardId ? currentBoardMeta : null) ||
        (boardAccessMeta?.id === targetBoardId ? boardAccessMeta : null)
      if (!targetBoardMeta) {
        setBoardFormError('Board metadata is still loading. Try again in a moment.')
        return
      }
      if (!canEditBoardMeta(targetBoardMeta, user.uid)) {
        setBoardFormError('You need edit access to duplicate this board.')
        return
      }

      const duplicateBoardId = crypto.randomUUID()
      const duplicateNameBase = `${targetBoardMeta.name} (Copy)`.trim()
      const duplicateName =
        duplicateNameBase.length > 80 ? duplicateNameBase.slice(0, 80).trimEnd() : duplicateNameBase

      setBoardFormError(null)

      try {
        const sourceObjectsSnapshot = await getDocs(collection(dbInstance, 'boards', targetBoardId, 'objects'))
        await setDoc(doc(dbInstance, 'boards', duplicateBoardId), {
          id: duplicateBoardId,
          name: duplicateName,
          description: targetBoardMeta.description || '',
          ownerId: user.uid,
          linkAccessRole: 'restricted',
          sharedWith: [],
          sharedRoles: {},
          createdBy: user.uid,
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        const sourceObjects = sourceObjectsSnapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as Partial<BoardObject>
            if (!data.type || !data.position || !data.size || data.deleted) {
              return null
            }
            const sourceId =
              typeof data.id === 'string' && data.id.trim().length > 0 ? data.id.trim() : docSnapshot.id
            return {
              ...(data as BoardObject),
              id: sourceId,
            }
          })
          .filter((candidate): candidate is BoardObject => candidate !== null)

        if (sourceObjects.length > 0) {
          const copiedAt = Date.now()
          for (
            let startIndex = 0;
            startIndex < sourceObjects.length;
            startIndex += BOARD_DUPLICATE_BATCH_LIMIT
          ) {
            const batch = writeBatch(dbInstance)
            const slice = sourceObjects.slice(startIndex, startIndex + BOARD_DUPLICATE_BATCH_LIMIT)

            slice.forEach((sourceObject, offset) => {
              const copiedObject: BoardObject = {
                ...sourceObject,
                boardId: duplicateBoardId,
                zIndex: Number.isFinite(sourceObject.zIndex) ? sourceObject.zIndex : startIndex + offset + 1,
                version: Number.isFinite(sourceObject.version) ? sourceObject.version : 1,
                createdBy: user.uid,
                updatedBy: user.uid,
                createdAt: copiedAt + startIndex + offset,
                updatedAt: copiedAt + startIndex + offset,
                deleted: false,
              }

              batch.set(doc(dbInstance, 'boards', duplicateBoardId, 'objects', copiedObject.id), copiedObject)
            })

            await batch.commit()
          }
        }

        navigateToBoard(duplicateBoardId)
      } catch (error) {
        console.error('Unable to duplicate board', error)
        setBoardFormError('Unable to duplicate board right now.')
      }
    },
    [boardAccessMeta, boards, currentBoardMeta, db, navigateToBoard, setBoardFormError, user],
  )

  const deleteBoardMeta = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      const targetBoardMeta = boards.find((candidate) => candidate.id === targetBoardId)
      if (targetBoardMeta && targetBoardMeta.ownerId !== user.uid) {
        return
      }

      await deleteDoc(doc(db, 'boards', targetBoardId))
      if (targetBoardId === boardId) {
        navigate('/')
      }
    },
    [boardId, boards, db, navigate, user],
  )

  const beginBoardRename = useCallback(
    (targetBoardMeta: BoardMeta) => {
      if (!user) {
        return
      }
      const canRename =
        targetBoardMeta.ownerId === user.uid ||
        (boardAccessMeta?.id === targetBoardMeta.id && boardAccessMeta.ownerId === user.uid)
      if (!canRename) {
        return
      }
      clearBoardNavigateTimeout()
      setRenameBoardError(null)
      setRenamingBoardId(targetBoardMeta.id)
      setRenameBoardName(targetBoardMeta.name)
    },
    [boardAccessMeta, clearBoardNavigateTimeout, setRenameBoardError, setRenameBoardName, setRenamingBoardId, user],
  )

  const cancelBoardRename = useCallback(() => {
    setRenamingBoardId(null)
    setRenameBoardName('')
    setRenameBoardError(null)
  }, [setRenameBoardError, setRenameBoardName, setRenamingBoardId])

  const submitBoardRename = useCallback(
    async (targetBoardId: string) => {
      if (!db || !user) {
        return
      }
      if (renamingBoardId !== targetBoardId) {
        return
      }
      const targetBoardMeta =
        boards.find((candidate) => candidate.id === targetBoardId) ||
        (currentBoardMeta?.id === targetBoardId ? currentBoardMeta : null) ||
        (boardAccessMeta?.id === targetBoardId ? boardAccessMeta : null)
      if (!targetBoardMeta) {
        cancelBoardRename()
        return
      }
      const canRenameTarget =
        targetBoardMeta.ownerId === user.uid ||
        (boardAccessMeta?.id === targetBoardId && boardAccessMeta.ownerId === user.uid)
      if (!canRenameTarget) {
        cancelBoardRename()
        return
      }

      const trimmedName = renameBoardName.trim()
      if (!trimmedName) {
        setRenameBoardError('Board name is required')
        return
      }
      if (trimmedName === targetBoardMeta.name) {
        cancelBoardRename()
        return
      }

      try {
        await setDoc(
          doc(db, 'boards', targetBoardId),
          {
            name: trimmedName,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )

        const updatedAt = nowMs()
        setBoards((prev) =>
          prev.map((boardMeta) =>
            boardMeta.id === targetBoardId ? { ...boardMeta, name: trimmedName, updatedAt } : boardMeta,
          ),
        )
        setBoardAccessMeta((prev) =>
          prev && prev.id === targetBoardId ? { ...prev, name: trimmedName, updatedAt } : prev,
        )
        cancelBoardRename()
      } catch (error) {
        console.error('Unable to rename board', error)
        setRenameBoardError('Unable to rename board right now.')
      }
    },
    [
      boardAccessMeta,
      boards,
      cancelBoardRename,
      currentBoardMeta,
      db,
      renameBoardName,
      renamingBoardId,
      setBoardAccessMeta,
      setBoards,
      setRenameBoardError,
      user,
    ],
  )

  const openShareDialog = useCallback((targetBoardId: string) => {
    setShareDialogBoardId(targetBoardId)
    setShareEmail('')
    setShareRole('edit')
    setShareError(null)
    setShareStatus(null)
  }, [setShareDialogBoardId, setShareEmail, setShareError, setShareRole, setShareStatus])

  const handleBoardNameInputChange = useCallback(
    (value: string) => {
      setNewBoardName(value)
      setBoardFormError((previous) => (previous ? null : previous))
    },
    [setBoardFormError, setNewBoardName],
  )

  const handleBoardDescriptionInputChange = useCallback(
    (value: string) => {
      setNewBoardDescription(value)
      setBoardFormError((previous) => (previous ? null : previous))
    },
    [setBoardFormError, setNewBoardDescription],
  )

  const handleShareEmailChange = useCallback(
    (value: string) => {
      setShareEmail(value)
      setShareError((previous) => (previous ? null : previous))
    },
    [setShareEmail, setShareError],
  )

  const handleShareRoleChange = useCallback((role: 'edit' | 'view') => {
    setShareRole(role)
  }, [setShareRole])

  const handleShareLinkRoleChange = useCallback((role: BoardLinkAccess) => {
    setShareLinkRole(normalizeLinkAccessRole(role))
  }, [setShareLinkRole])

  const handleShareLinkCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(shareDialogBoardUrl)
      .then(() => {
        setShareStatus('Board URL copied.')
      })
      .catch(() => {
        setShareError('Unable to copy board URL.')
      })
  }, [setShareError, setShareStatus, shareDialogBoardUrl])

  const closeShareDialog = useCallback(() => {
    setShareDialogBoardId(null)
    setShareEmail('')
    setShareRole('edit')
    setShareLinkRole('restricted')
    setShareError(null)
    setShareStatus(null)
  }, [setShareDialogBoardId, setShareEmail, setShareError, setShareLinkRole, setShareRole, setShareStatus])

  return {
    beginBoardRename,
    cancelBoardRename,
    clearBoardNavigateTimeout,
    closeShareDialog,
    createBoard,
    deleteBoardMeta,
    duplicateBoardMeta,
    handleBoardDescriptionInputChange,
    handleBoardNameInputChange,
    handleShareEmailChange,
    handleShareLinkCopy,
    handleShareLinkRoleChange,
    handleShareRoleChange,
    navigateToBoard,
    openShareDialog,
    scheduleBoardNavigate,
    submitBoardRename,
  }
}
