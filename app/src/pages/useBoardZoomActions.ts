import { useCallback, type MutableRefObject } from 'react'

import type { BoardObject } from '../types/board'
import { clamp } from '../lib/boardGeometry'
import { getObjectBounds, MAX_ZOOM_SCALE, MIN_ZOOM_SCALE } from './boardPageRuntimePrimitives'

type ZoomActionsContext = {
  objects: BoardObject[]
  objectsById: Map<string, BoardObject>
  queueZoomMomentum: (targetViewport: { x: number; y: number; scale: number }) => void
  stageSize: { width: number; height: number }
  viewport: { x: number; y: number; scale: number }
  zoomMomentumTargetRef: MutableRefObject<{ x: number; y: number; scale: number } | null>
}

export const useBoardZoomActions = ({
  objects,
  objectsById,
  queueZoomMomentum,
  stageSize,
  viewport,
  zoomMomentumTargetRef,
}: ZoomActionsContext) => {
  const applyViewportScaleFromCenter = useCallback(
    (nextScale: number) => {
      const baseViewport = zoomMomentumTargetRef.current || viewport
      const clampedScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE)
      const center = {
        x: stageSize.width / 2,
        y: stageSize.height / 2,
      }
      const worldX = (center.x - baseViewport.x) / baseViewport.scale
      const worldY = (center.y - baseViewport.y) / baseViewport.scale

      queueZoomMomentum({
        scale: clampedScale,
        x: center.x - worldX * clampedScale,
        y: center.y - worldY * clampedScale,
      })
    },
    [queueZoomMomentum, stageSize.height, stageSize.width, viewport, zoomMomentumTargetRef],
  )

  const zoomIn = useCallback(() => {
    const baseScale = (zoomMomentumTargetRef.current || viewport).scale
    applyViewportScaleFromCenter(baseScale * 1.25)
  }, [applyViewportScaleFromCenter, viewport, zoomMomentumTargetRef])

  const zoomOut = useCallback(() => {
    const baseScale = (zoomMomentumTargetRef.current || viewport).scale
    applyViewportScaleFromCenter(baseScale / 1.25)
  }, [applyViewportScaleFromCenter, viewport, zoomMomentumTargetRef])

  const zoomReset = useCallback(() => {
    applyViewportScaleFromCenter(1)
  }, [applyViewportScaleFromCenter])

  const zoomToFit = useCallback(() => {
    if (objects.length === 0) {
      zoomReset()
      return
    }

    const padding = 48
    const bounds = objects.map((boardObject) => getObjectBounds(boardObject, objectsById))
    const minX = Math.min(...bounds.map((item) => item.x)) - padding
    const minY = Math.min(...bounds.map((item) => item.y)) - padding
    const maxX = Math.max(...bounds.map((item) => item.x + item.width)) + padding
    const maxY = Math.max(...bounds.map((item) => item.y + item.height)) + padding
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)

    const fitScale = clamp(
      Math.min(stageSize.width / width, stageSize.height / height),
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
    )

    queueZoomMomentum({
      scale: fitScale,
      x: stageSize.width / 2 - (minX + width / 2) * fitScale,
      y: stageSize.height / 2 - (minY + height / 2) * fitScale,
    })
  }, [objects, objectsById, queueZoomMomentum, stageSize.height, stageSize.width, zoomReset])

  return {
    applyViewportScaleFromCenter,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomToFit,
  }
}
