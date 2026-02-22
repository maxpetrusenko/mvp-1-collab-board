import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { overlaps } from '../lib/boardGeometry'
import type { BoardObject, Point } from '../types/board'

type SelectionBox = {
  active: boolean
  start: Point
  end: Point
}

type ObjectBounds = {
  x: number
  y: number
  width: number
  height: number
}

type CompleteSelectionBoxArgs = {
  additive: boolean
  resolveObjectBounds: (boardObject: BoardObject) => ObjectBounds
}

type UseBoardSelectionArgs = {
  objects: BoardObject[]
  selectedIds: string[]
  setSelectedIds: Dispatch<SetStateAction<string[]>>
}

export const useBoardSelection = (args: UseBoardSelectionArgs) => {
  const { objects, selectedIds, setSelectedIds } = args
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)

  const selectedId = selectedIds[0] || null
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedObjects = useMemo(
    () => selectedIds.map((id) => objects.find((boardObject) => boardObject.id === id)).filter(Boolean) as BoardObject[],
    [objects, selectedIds],
  )

  const beginSelectionBox = useCallback((start: Point) => {
    setSelectionBox({
      active: true,
      start,
      end: start,
    })
  }, [])

  const updateSelectionBox = useCallback((nextPoint: Point) => {
    setSelectionBox((prev) => (prev ? { ...prev, end: nextPoint } : prev))
  }, [])

  const completeSelectionBox = useCallback(
    ({ additive, resolveObjectBounds }: CompleteSelectionBoxArgs) => {
      setSelectionBox((prev) => {
        if (!prev) {
          return prev
        }

        const bounds = {
          x: Math.min(prev.start.x, prev.end.x),
          y: Math.min(prev.start.y, prev.end.y),
          width: Math.abs(prev.end.x - prev.start.x),
          height: Math.abs(prev.end.y - prev.start.y),
        }

        if (bounds.width < 3 && bounds.height < 3) {
          return null
        }

        const hitIds = objects
          .filter((boardObject) => overlaps(bounds, resolveObjectBounds(boardObject)))
          .map((boardObject) => boardObject.id)

        if (hitIds.length > 0) {
          setSelectedIds((current) => {
            if (!additive) {
              return hitIds
            }
            const merged = new Set([...current, ...hitIds])
            return [...merged]
          })
        } else if (!additive) {
          setSelectedIds([])
        }

        return null
      })
    },
    [objects, setSelectedIds],
  )

  return {
    selectedId,
    selectedIdSet,
    selectedObjects,
    selectionBox,
    setSelectionBox,
    beginSelectionBox,
    updateSelectionBox,
    completeSelectionBox,
  }
}
