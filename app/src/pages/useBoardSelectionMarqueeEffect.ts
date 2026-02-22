import { useEffect, type MutableRefObject } from 'react'
import Konva from 'konva'

type UseBoardSelectionMarqueeEffectArgs = {
  selectionActive: boolean
  selectionScanAnimationRef: MutableRefObject<Konva.Animation | null>
  selectionScanLayerRef: MutableRefObject<Konva.Layer | null>
  selectionScanRectRef: MutableRefObject<Konva.Rect | null>
}

export const useBoardSelectionMarqueeEffect = ({
  selectionActive,
  selectionScanAnimationRef,
  selectionScanLayerRef,
  selectionScanRectRef,
}: UseBoardSelectionMarqueeEffectArgs) => {
  useEffect(() => {
    if (!selectionActive) {
      if (selectionScanAnimationRef.current) {
        selectionScanAnimationRef.current.stop()
        selectionScanAnimationRef.current = null
      }

      const selectionRect = selectionScanRectRef.current
      if (selectionRect) {
        selectionRect.dashOffset(0)
        selectionRect.fill('rgba(29, 78, 216, 0.1)')
        selectionRect.getLayer()?.batchDraw()
      }
      return
    }

    const selectionLayer = selectionScanLayerRef.current
    const selectionRect = selectionScanRectRef.current
    if (!selectionLayer || !selectionRect || selectionScanAnimationRef.current) {
      return
    }

    const animation = new Konva.Animation((frame) => {
      if (!frame) {
        return
      }

      selectionRect.dashOffset(-((frame.time / 18) % 30))
      const pulseOpacity = 0.09 + 0.04 * Math.sin(frame.time / 180)
      selectionRect.fill(`rgba(29, 78, 216, ${pulseOpacity.toFixed(3)})`)
    }, selectionLayer)

    selectionScanAnimationRef.current = animation
    animation.start()

    return () => {
      if (selectionScanAnimationRef.current === animation) {
        animation.stop()
        selectionScanAnimationRef.current = null
      }
    }
  }, [selectionActive, selectionScanAnimationRef, selectionScanLayerRef, selectionScanRectRef])
}
