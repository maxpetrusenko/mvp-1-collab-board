import { useMemo } from 'react'

import type { BoardActivityEvent, BoardObject } from '../types/board'
import type { InlineEditorDraft, Viewport } from './boardPageTypes'
import {
  computeInlineEditorAppearance,
  computeInlineEditorLayout,
  computeMinimapModel,
  computeSelectionBounds,
} from './boardPageViewModels'
import type { LocalPositionOverride } from '../hooks/useObjectSync'

type UseBoardDerivedViewModelsArgs = {
  activityEvents: BoardActivityEvent[]
  getObjectBounds: (boardObject: BoardObject) => { x: number; y: number; width: number; height: number }
  inlineEditor: InlineEditorDraft | null
  localObjectPositions: Record<string, LocalPositionOverride>
  localObjectRotations: Record<string, number>
  objects: BoardObject[]
  selectionBox: Parameters<typeof computeSelectionBounds>[0]
  stageSize: { width: number; height: number }
  viewport: Viewport
}

export const useBoardDerivedViewModels = ({
  activityEvents,
  getObjectBounds,
  inlineEditor,
  localObjectPositions,
  localObjectRotations,
  objects,
  selectionBox,
  stageSize,
  viewport,
}: UseBoardDerivedViewModelsArgs) => {
  const timelineEvents = useMemo(() => activityEvents.slice(0, 20), [activityEvents])

  const inlineEditorTarget = useMemo(() => {
    if (!inlineEditor) {
      return null
    }

    return objects.find((boardObject) => boardObject.id === inlineEditor.objectId) || null
  }, [inlineEditor, objects])

  const inlineEditorLayout = useMemo(
    () =>
      computeInlineEditorLayout({
        inlineEditor,
        inlineEditorTarget,
        localObjectPositions,
        localObjectRotations,
        viewport,
      }),
    [inlineEditor, inlineEditorTarget, localObjectPositions, localObjectRotations, viewport],
  )

  const inlineEditorAppearance = useMemo(
    () =>
      computeInlineEditorAppearance({
        inlineEditor,
        inlineEditorTarget,
      }),
    [inlineEditor, inlineEditorTarget],
  )

  const minimapModel = useMemo(
    () =>
      computeMinimapModel({
        objects,
        viewport,
        stageSize,
        getObjectBounds,
      }),
    [getObjectBounds, objects, stageSize, viewport],
  )

  const selectionBounds = useMemo(() => computeSelectionBounds(selectionBox), [selectionBox])

  return {
    inlineEditorAppearance,
    inlineEditorLayout,
    inlineEditorTarget,
    minimapModel,
    selectionBounds,
    timelineEvents,
  }
}
