import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'

import type { BoardActivityEvent, BoardObject } from '../types/board'
import type { HistoryEntry, InlineEditorDraft } from './boardPageTypes'
import { calculateRotationAngle } from './boardPageRuntimePrimitives'

type UserIdentity = {
  uid: string
  displayName?: string | null
  email?: string | null
} | null

type RotationOverlayDragState = {
  objectId: string
  objectType: BoardObject['type']
  centerX: number
  centerY: number
  latestRotation: number
}

type UseBoardObjectActionsArgs = {
  boardId: string
  canEditBoard: boolean
  dbInstance: import('firebase/firestore').Firestore | null
  hasLiveBoardAccess: boolean
  inlineEditor: InlineEditorDraft | null
  inlineEditorTarget: BoardObject | null
  inlineInputRef: MutableRefObject<HTMLInputElement | null>
  inlineTextAreaRef: MutableRefObject<HTMLTextAreaElement | null>
  isApplyingHistoryRef: MutableRefObject<boolean>
  localObjectRotationsRef: MutableRefObject<Record<string, number>>
  objectsRef: MutableRefObject<BoardObject[]>
  pushHistory: (entry: HistoryEntry) => void
  rotationOverlayDragRef: MutableRefObject<RotationOverlayDragState | null>
  setInlineEditor: Dispatch<SetStateAction<InlineEditorDraft | null>>
  setLocalObjectRotations: Dispatch<SetStateAction<Record<string, number>>>
  setRotatingObjectId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  touchBoard: () => void
  user: UserIdentity
  logActivity: (entry: Omit<BoardActivityEvent, 'id' | 'boardId' | 'createdAt'>) => Promise<void>
}

export const useBoardObjectActions = ({
  boardId,
  canEditBoard,
  dbInstance,
  hasLiveBoardAccess,
  inlineEditor,
  inlineEditorTarget,
  inlineInputRef,
  inlineTextAreaRef,
  isApplyingHistoryRef,
  localObjectRotationsRef,
  objectsRef,
  pushHistory,
  rotationOverlayDragRef,
  setInlineEditor,
  setLocalObjectRotations,
  setRotatingObjectId,
  setSelectedIds,
  touchBoard,
  user,
  logActivity,
}: UseBoardObjectActionsArgs) => {
  const normalizeBoardObjectForWrite = useCallback(
    (boardObject: BoardObject): BoardObject => {
      const now = Date.now()
      return {
        ...boardObject,
        boardId,
        createdBy: boardObject.createdBy || user?.uid || 'system',
        createdAt: typeof boardObject.createdAt === 'number' ? boardObject.createdAt : now,
        updatedBy: boardObject.updatedBy || user?.uid || 'system',
        updatedAt: typeof boardObject.updatedAt === 'number' ? boardObject.updatedAt : now,
        version: typeof boardObject.version === 'number' ? boardObject.version : 1,
      }
    },
    [boardId, user],
  )

  const writeBoardObject = useCallback(
    async (boardObject: BoardObject) => {
      if (!dbInstance || !user || !hasLiveBoardAccess) {
        return
      }

      const normalized = normalizeBoardObjectForWrite(boardObject)
      await setDoc(doc(dbInstance, 'boards', boardId, 'objects', normalized.id), normalized)
    },
    [boardId, dbInstance, hasLiveBoardAccess, normalizeBoardObjectForWrite, user],
  )

  const writeBoardObjectPatch = useCallback(
    async (objectId: string, patch: Partial<BoardObject>, currentVersion: number) => {
      if (!dbInstance || !user || !hasLiveBoardAccess) {
        return
      }

      await setDoc(
        doc(dbInstance, 'boards', boardId, 'objects', objectId),
        {
          ...patch,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          version: currentVersion + 1,
        },
        { merge: true },
      )
    },
    [boardId, dbInstance, hasLiveBoardAccess, user],
  )

  const deleteBoardObjectById = useCallback(
    async (objectId: string) => {
      if (!dbInstance || !hasLiveBoardAccess) {
        return
      }

      await deleteDoc(doc(dbInstance, 'boards', boardId, 'objects', objectId))
    },
    [boardId, dbInstance, hasLiveBoardAccess],
  )

  const startInlineEdit = useCallback((boardObject: BoardObject, field: InlineEditorDraft['field']) => {
    if (
      field === 'text' &&
      boardObject.type !== 'stickyNote' &&
      boardObject.type !== 'shape' &&
      boardObject.type !== 'text'
    ) {
      return
    }
    if (field === 'title' && boardObject.type !== 'frame') {
      return
    }

    setSelectedIds([boardObject.id])
    setInlineEditor({
      objectId: boardObject.id,
      field,
      value:
        field === 'text' &&
        (boardObject.type === 'stickyNote' || boardObject.type === 'shape' || boardObject.type === 'text')
          ? boardObject.text || ''
          : boardObject.type === 'frame'
            ? boardObject.title || 'Frame'
            : '',
    })
  }, [setInlineEditor, setSelectedIds])

  const cancelInlineEdit = useCallback(() => {
    setInlineEditor(null)
  }, [setInlineEditor])

  const setLocalRotation = useCallback((objectId: string, rotation: number) => {
    setLocalObjectRotations((prev) => {
      const next = {
        ...prev,
        [objectId]: rotation,
      }
      localObjectRotationsRef.current = next
      return next
    })
  }, [localObjectRotationsRef, setLocalObjectRotations])

  const clearLocalRotation = useCallback((objectId: string) => {
    setLocalObjectRotations((prev) => {
      if (!(objectId in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[objectId]
      localObjectRotationsRef.current = next
      return next
    })
  }, [localObjectRotationsRef, setLocalObjectRotations])

  const patchObject = useCallback(
    async (
      objectId: string,
      patch: Partial<BoardObject>,
      options?: { recordHistory?: boolean; logEvent?: boolean; actionLabel?: string },
    ) => {
      if (!dbInstance || !user || !hasLiveBoardAccess || !canEditBoard) {
        return
      }

      const currentObject = objectsRef.current.find((boardObject) => boardObject.id === objectId)
      if (!currentObject) {
        return
      }

      const before: Partial<BoardObject> = {}
      ;(Object.keys(patch) as Array<keyof BoardObject>).forEach((key) => {
        ;(before as Partial<BoardObject>)[key] = currentObject[key] as never
      })

      const shouldRecordHistory = options?.recordHistory !== false && !isApplyingHistoryRef.current
      if (shouldRecordHistory) {
        pushHistory({
          type: 'patch',
          objectId,
          before,
          after: patch,
        })
      }

      await writeBoardObjectPatch(objectId, patch, currentObject.version)

      const shouldLogEvent = options?.logEvent !== false
      if (shouldLogEvent) {
        void logActivity({
          actorId: user.uid,
          actorName: user.displayName || user.email || 'Anonymous',
          action: options?.actionLabel || `updated ${currentObject.type}`,
          targetId: currentObject.id,
          targetType: currentObject.type,
        })
      }
      touchBoard()
    },
    [
      canEditBoard,
      dbInstance,
      hasLiveBoardAccess,
      isApplyingHistoryRef,
      logActivity,
      objectsRef,
      pushHistory,
      touchBoard,
      user,
      writeBoardObjectPatch,
    ],
  )

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = rotationOverlayDragRef.current
      if (!dragState) {
        return
      }

      event.preventDefault()
      const nextRotation = calculateRotationAngle(
        dragState.centerX,
        dragState.centerY,
        event.clientX,
        event.clientY,
      )
      dragState.latestRotation = nextRotation
      setLocalRotation(dragState.objectId, nextRotation)
    }

    const handleMouseUp = () => {
      const dragState = rotationOverlayDragRef.current
      if (!dragState) {
        return
      }

      rotationOverlayDragRef.current = null
      setRotatingObjectId(null)
      void patchObject(
        dragState.objectId,
        { rotation: dragState.latestRotation },
        { actionLabel: `rotated ${dragState.objectType}` },
      )
      clearLocalRotation(dragState.objectId)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [clearLocalRotation, patchObject, rotationOverlayDragRef, setLocalRotation, setRotatingObjectId])

  useEffect(() => {
    if (canEditBoard) {
      return
    }

    const dragState = rotationOverlayDragRef.current
    if (!dragState) {
      return
    }

    rotationOverlayDragRef.current = null
    clearLocalRotation(dragState.objectId)
    setRotatingObjectId(null)
  }, [canEditBoard, clearLocalRotation, rotationOverlayDragRef, setRotatingObjectId])

  const commitInlineEdit = useCallback(async () => {
    if (!canEditBoard) {
      setInlineEditor(null)
      return
    }
    if (!inlineEditor) {
      return
    }

    const boardObject = objectsRef.current.find((candidate) => candidate.id === inlineEditor.objectId)
    if (!boardObject) {
      setInlineEditor(null)
      return
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'stickyNote') {
      const nextText = inlineEditor.value
      if (nextText !== boardObject.text) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'shape') {
      const nextText = inlineEditor.value
      if (nextText !== (boardObject.text || '')) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'text' && boardObject.type === 'text') {
      const nextText = inlineEditor.value
      if (nextText !== boardObject.text) {
        await patchObject(boardObject.id, { text: nextText || ' ' })
      }
    }

    if (inlineEditor.field === 'title' && boardObject.type === 'frame') {
      const nextTitle = inlineEditor.value.trim() || 'Frame'
      if (nextTitle !== boardObject.title) {
        await patchObject(boardObject.id, { title: nextTitle })
      }
    }

    setInlineEditor(null)
  }, [canEditBoard, inlineEditor, objectsRef, patchObject, setInlineEditor])

  useEffect(() => {
    if (!inlineEditor) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const editor = inlineEditor.field === 'text' ? inlineTextAreaRef.current : inlineInputRef.current
      if (!editor) {
        return
      }

      editor.focus()
      editor.setSelectionRange(editor.value.length, editor.value.length)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [inlineEditor, inlineInputRef, inlineTextAreaRef])

  useEffect(() => {
    if (!inlineEditor || !inlineEditorTarget) {
      return
    }

    if (
      (inlineEditor.field === 'text' &&
        inlineEditorTarget.type !== 'stickyNote' &&
        inlineEditorTarget.type !== 'shape' &&
        inlineEditorTarget.type !== 'text') ||
      (inlineEditor.field === 'title' && inlineEditorTarget.type !== 'frame')
    ) {
      setInlineEditor(null)
      return
    }
  }, [inlineEditor, inlineEditorTarget, setInlineEditor])

  return {
    cancelInlineEdit,
    clearLocalRotation,
    commitInlineEdit,
    deleteBoardObjectById,
    patchObject,
    setLocalRotation,
    startInlineEdit,
    writeBoardObject,
  }
}
