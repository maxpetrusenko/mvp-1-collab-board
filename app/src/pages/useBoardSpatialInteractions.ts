/* eslint-disable react-hooks/refs */
import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import Konva from 'konva'

import type { BoardObject, Point } from '../types/board'
import type { Viewport } from './boardPageTypes'
import type { LocalPositionOverride, LocalSizeOverride } from '../hooks/useObjectSync'
import {
  BOARD_HEADER_HEIGHT,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_SIZE,
  STICKY_DROP_DURATION_SECONDS,
  ZOOM_MOMENTUM_EPSILON_POSITION,
  ZOOM_MOMENTUM_EPSILON_SCALE,
  ZOOM_MOMENTUM_SMOOTHING,
} from './boardPageRuntimePrimitives'
import { clamp } from '../lib/boardGeometry'

type RotationOverlayDragState = {
  objectId: string
  objectType: BoardObject['type']
  centerX: number
  centerY: number
  latestRotation: number
}

type UseBoardSpatialInteractionsArgs = {
  beginSelectionBoxFromHook: (start: Point) => void
  canEditBoard: boolean
  completeSelectionBoxFromHook: (args: {
    additive: boolean
    resolveObjectBounds: (boardObject: BoardObject) => { x: number; y: number; width: number; height: number }
  }) => void
  getObjectBounds: (boardObject: BoardObject) => { x: number; y: number; width: number; height: number }
  liveDragPositionsRef: MutableRefObject<Record<string, Point>>
  localObjectPositions: Record<string, LocalPositionOverride>
  localObjectRotations: Record<string, number>
  localObjectRotationsRef: MutableRefObject<Record<string, number>>
  localObjectSizes: Record<string, LocalSizeOverride>
  objects: BoardObject[]
  objectsRef: MutableRefObject<BoardObject[]>
  pendingStickyDropIdsRef: MutableRefObject<Set<string>>
  rotationOverlayDragRef: MutableRefObject<RotationOverlayDragState | null>
  selectedIdsRef: MutableRefObject<string[]>
  selectedObject: BoardObject | null
  selectedObjects: BoardObject[]
  selectionMode: 'select' | 'area'
  setRotatingObjectId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setViewport: Dispatch<SetStateAction<Viewport>>
  stageRef: MutableRefObject<Konva.Stage | null>
  stageSize: { width: number; height: number }
  stickyDropTweensRef: MutableRefObject<Record<string, Konva.Tween>>
  updateSelectionBoxFromHook: (nextPoint: Point) => void
  viewport: Viewport
  zoomMomentumFrameRef: MutableRefObject<number | null>
  zoomMomentumTargetRef: MutableRefObject<Viewport | null>
}

export const useBoardSpatialInteractions = ({
  beginSelectionBoxFromHook,
  canEditBoard,
  completeSelectionBoxFromHook,
  getObjectBounds,
  liveDragPositionsRef,
  localObjectPositions,
  localObjectRotations,
  localObjectRotationsRef,
  localObjectSizes,
  objects,
  objectsRef,
  pendingStickyDropIdsRef,
  rotationOverlayDragRef,
  selectedIdsRef,
  selectedObject,
  selectedObjects,
  selectionMode,
  setRotatingObjectId,
  setSelectedIds,
  setViewport,
  stageRef,
  stageSize,
  stickyDropTweensRef,
  updateSelectionBoxFromHook,
  viewport,
  zoomMomentumFrameRef,
  zoomMomentumTargetRef,
}: UseBoardSpatialInteractionsArgs) => {
  const selectObjectId = useCallback((objectId: string, additive = false) => {
    const previous = selectedIdsRef.current
    let nextIds: string[] = []
    if (!additive) {
      nextIds = [objectId]
    } else if (previous.includes(objectId)) {
      nextIds = previous.filter((id) => id !== objectId)
    } else {
      nextIds = [...previous, objectId]
    }
    selectedIdsRef.current = nextIds
    setSelectedIds(nextIds)
  }, [selectedIdsRef, setSelectedIds])

  const resolveObjectPosition = useCallback(
    (boardObject: BoardObject) =>
      liveDragPositionsRef.current[boardObject.id] ||
      localObjectPositions[boardObject.id]?.point ||
      boardObject.position,
    [liveDragPositionsRef, localObjectPositions],
  )

  const resolveObjectSize = useCallback(
    (boardObject: BoardObject) => localObjectSizes[boardObject.id]?.size || boardObject.size,
    [localObjectSizes],
  )

  const selectedObjectScreenBounds = useMemo(() => {
    if (!selectedObject) {
      return null
    }

    const selectedPosition =
      selectedObject.type === 'connector' ? null : resolveObjectPosition(selectedObject)

    const worldBounds =
      selectedObject.type === 'connector'
        ? getObjectBounds(selectedObject)
        : {
            x: selectedPosition?.x ?? selectedObject.position.x,
            y: selectedPosition?.y ?? selectedObject.position.y,
            width: resolveObjectSize(selectedObject).width,
            height: resolveObjectSize(selectedObject).height,
          }

    return {
      left: viewport.x + worldBounds.x * viewport.scale,
      top: viewport.y + worldBounds.y * viewport.scale,
      right: viewport.x + (worldBounds.x + worldBounds.width) * viewport.scale,
      bottom: viewport.y + (worldBounds.y + worldBounds.height) * viewport.scale,
    }
  }, [getObjectBounds, resolveObjectPosition, resolveObjectSize, selectedObject, viewport.scale, viewport.x, viewport.y])

  const selectedObjectMenuPosition = useMemo(() => {
    if (!selectedObjectScreenBounds) {
      return null
    }

    const left = clamp(selectedObjectScreenBounds.right + 10, 10, Math.max(10, stageSize.width - 260))
    const top = clamp(
      selectedObjectScreenBounds.top - 12,
      BOARD_HEADER_HEIGHT + 10,
      Math.max(BOARD_HEADER_HEIGHT + 10, BOARD_HEADER_HEIGHT + stageSize.height - 120),
    )
    return { left, top }
  }, [selectedObjectScreenBounds, stageSize.height, stageSize.width])

  const projectObjectLocalPoint = useCallback(
    (boardObject: BoardObject, localPoint: Point, rotationOverride?: number) => {
      const position = resolveObjectPosition(boardObject)
      const rotationDegrees =
        rotationOverride ?? localObjectRotationsRef.current[boardObject.id] ?? boardObject.rotation ?? 0
      const rotationRadians = (rotationDegrees * Math.PI) / 180
      const cos = Math.cos(rotationRadians)
      const sin = Math.sin(rotationRadians)
      return {
        x: position.x + localPoint.x * cos - localPoint.y * sin,
        y: position.y + localPoint.x * sin + localPoint.y * cos,
      }
    },
    [localObjectRotationsRef, resolveObjectPosition],
  )

  const toCanvasLocalPoint = useCallback(
    (worldPoint: Point) => ({
      x: viewport.x + worldPoint.x * viewport.scale,
      y: viewport.y + worldPoint.y * viewport.scale,
    }),
    [viewport.scale, viewport.x, viewport.y],
  )

  const resolveRotationCenterClientPoint = useCallback(
    (boardObject: BoardObject) => {
      const stageContainer = stageRef.current?.container()
      if (!stageContainer) {
        return null
      }

      const size = resolveObjectSize(boardObject)
      const centerWorld = projectObjectLocalPoint(boardObject, {
        x: size.width / 2,
        y: size.height / 2,
      })
      const centerLocal = toCanvasLocalPoint(centerWorld)
      const stageRect = stageContainer.getBoundingClientRect()
      return {
        x: stageRect.left + centerLocal.x,
        y: stageRect.top + centerLocal.y,
      }
    },
    [projectObjectLocalPoint, resolveObjectSize, stageRef, toCanvasLocalPoint],
  )

  const rotationOverlayHandles = useMemo(() => {
    if (!canEditBoard || selectionMode !== 'select') {
      return [] as Array<{
        objectId: string
        objectType: BoardObject['type']
        left: number
        top: number
        size: number
      }>
    }

    const handleSize = Math.max(12, ROTATION_HANDLE_SIZE * viewport.scale)
    return selectedObjects
      .filter((boardObject) => boardObject.type !== 'connector')
      .map((boardObject) => {
        const size = resolveObjectSize(boardObject)
        const rotation = localObjectRotations[boardObject.id] ?? boardObject.rotation ?? 0
        const handleWorld = projectObjectLocalPoint(
          boardObject,
          {
            x: size.width / 2,
            y: -ROTATION_HANDLE_OFFSET,
          },
          rotation,
        )
        const handleLocal = toCanvasLocalPoint(handleWorld)
        return {
          objectId: boardObject.id,
          objectType: boardObject.type,
          left: handleLocal.x - handleSize / 2,
          top: handleLocal.y - handleSize / 2,
          size: handleSize,
        }
      })
  }, [
    canEditBoard,
    localObjectRotations,
    projectObjectLocalPoint,
    resolveObjectSize,
    selectedObjects,
    selectionMode,
    toCanvasLocalPoint,
    viewport.scale,
  ])

  const startRotationOverlayDrag = useCallback(
    (
      boardObject: BoardObject,
      handle: { objectId: string; objectType: BoardObject['type'] },
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      if (!canEditBoard || selectionMode !== 'select') {
        return
      }

      const center = resolveRotationCenterClientPoint(boardObject)
      if (!center) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const initialRotation = localObjectRotationsRef.current[boardObject.id] ?? boardObject.rotation ?? 0
      rotationOverlayDragRef.current = {
        objectId: handle.objectId,
        objectType: handle.objectType,
        centerX: center.x,
        centerY: center.y,
        latestRotation: initialRotation,
      }
      setRotatingObjectId(handle.objectId)
    },
    [canEditBoard, localObjectRotationsRef, resolveRotationCenterClientPoint, rotationOverlayDragRef, selectionMode, setRotatingObjectId],
  )

  const resolveContainingFrameId = useCallback(
    (args: {
      objectId: string
      position: Point
      size: { width: number; height: number }
    }): string | null => {
      const matchingFrames = objectsRef.current
        .filter((candidate): candidate is BoardObject => candidate.type === 'frame' && candidate.id !== args.objectId)
        .filter((frameObject) => {
          const framePosition = resolveObjectPosition(frameObject)
          const frameSize = resolveObjectSize(frameObject)
          const objectRight = args.position.x + args.size.width
          const objectBottom = args.position.y + args.size.height
          const frameRight = framePosition.x + frameSize.width
          const frameBottom = framePosition.y + frameSize.height

          return (
            args.position.x >= framePosition.x &&
            args.position.y >= framePosition.y &&
            objectRight <= frameRight &&
            objectBottom <= frameBottom
          )
        })
        .sort((left, right) => right.zIndex - left.zIndex)

      return matchingFrames[0]?.id || null
    },
    [objectsRef, resolveObjectPosition, resolveObjectSize],
  )

  const resolveWorldPointer = useCallback(
    (stage: Konva.Stage): Point | null => {
      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return null
      }
      return {
        x: (pointer.x - viewport.x) / viewport.scale,
        y: (pointer.y - viewport.y) / viewport.scale,
      }
    },
    [viewport.scale, viewport.x, viewport.y],
  )

  const clearStickyDropTween = useCallback((objectId: string) => {
    const tween = stickyDropTweensRef.current[objectId]
    if (!tween) {
      return
    }

    tween.destroy()
    delete stickyDropTweensRef.current[objectId]
  }, [stickyDropTweensRef])

  const playStickyDropAnimation = useCallback(
    (objectId: string) => {
      const stage = stageRef.current
      if (!stage) {
        return false
      }

      const node = stage.findOne(`#sticky-${objectId}`) as Konva.Group | null
      if (!node) {
        return false
      }

      clearStickyDropTween(objectId)
      node.scale({ x: 0.82, y: 0.52 })
      node.opacity(0.78)
      const tween = new Konva.Tween({
        node,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        duration: STICKY_DROP_DURATION_SECONDS,
        easing: Konva.Easings.ElasticEaseOut,
        onFinish: () => {
          delete stickyDropTweensRef.current[objectId]
        },
      })
      stickyDropTweensRef.current[objectId] = tween
      tween.play()
      return true
    },
    [clearStickyDropTween, stageRef, stickyDropTweensRef],
  )

  const stopZoomMomentum = useCallback(() => {
    if (zoomMomentumFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomMomentumFrameRef.current)
      zoomMomentumFrameRef.current = null
    }
    zoomMomentumTargetRef.current = null
  }, [zoomMomentumFrameRef, zoomMomentumTargetRef])

  const startZoomMomentum = useCallback(() => {
    if (zoomMomentumFrameRef.current !== null) {
      return
    }

    const tick = () => {
      let shouldContinue = false
      setViewport((prev) => {
        const target = zoomMomentumTargetRef.current
        if (!target) {
          return prev
        }

        const next = {
          x: prev.x + (target.x - prev.x) * ZOOM_MOMENTUM_SMOOTHING,
          y: prev.y + (target.y - prev.y) * ZOOM_MOMENTUM_SMOOTHING,
          scale: prev.scale + (target.scale - prev.scale) * ZOOM_MOMENTUM_SMOOTHING,
        }

        const isSettled =
          Math.abs(target.scale - next.scale) < ZOOM_MOMENTUM_EPSILON_SCALE &&
          Math.abs(target.x - next.x) < ZOOM_MOMENTUM_EPSILON_POSITION &&
          Math.abs(target.y - next.y) < ZOOM_MOMENTUM_EPSILON_POSITION

        if (isSettled) {
          return target
        }

        shouldContinue = true
        return next
      })

      if (shouldContinue) {
        zoomMomentumFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      zoomMomentumFrameRef.current = null
      zoomMomentumTargetRef.current = null
    }

    zoomMomentumFrameRef.current = window.requestAnimationFrame(tick)
  }, [setViewport, zoomMomentumFrameRef, zoomMomentumTargetRef])

  const queueZoomMomentum = useCallback(
    (targetViewport: Viewport) => {
      zoomMomentumTargetRef.current = targetViewport
      startZoomMomentum()
    },
    [startZoomMomentum, zoomMomentumTargetRef],
  )

  useEffect(() => {
    if (pendingStickyDropIdsRef.current.size === 0) {
      return
    }

    for (const boardObject of objects) {
      if (boardObject.type !== 'stickyNote' || !pendingStickyDropIdsRef.current.has(boardObject.id)) {
        continue
      }

      const started = playStickyDropAnimation(boardObject.id)
      if (started) {
        pendingStickyDropIdsRef.current.delete(boardObject.id)
      }
    }
  }, [objects, pendingStickyDropIdsRef, playStickyDropAnimation])

  const beginSelectionBox = useCallback(
    (start: Point) => {
      beginSelectionBoxFromHook(start)
    },
    [beginSelectionBoxFromHook],
  )

  const updateSelectionBox = useCallback((nextPoint: Point) => {
    updateSelectionBoxFromHook(nextPoint)
  }, [updateSelectionBoxFromHook])

  const completeSelectionBox = useCallback(
    (additive: boolean) => {
      completeSelectionBoxFromHook({
        additive,
        resolveObjectBounds: (boardObject) => {
          const position = resolveObjectPosition(boardObject)
          const size = resolveObjectSize(boardObject)
          return boardObject.type === 'connector'
            ? getObjectBounds(boardObject)
            : {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
              }
        },
      })
    },
    [completeSelectionBoxFromHook, getObjectBounds, resolveObjectPosition, resolveObjectSize],
  )

  return {
    beginSelectionBox,
    completeSelectionBox,
    queueZoomMomentum,
    resolveContainingFrameId,
    resolveObjectPosition,
    resolveObjectSize,
    resolveWorldPointer,
    rotationOverlayHandles,
    selectObjectId,
    selectedObjectMenuPosition,
    startRotationOverlayDrag,
    stopZoomMomentum,
    updateSelectionBox,
  }
}
