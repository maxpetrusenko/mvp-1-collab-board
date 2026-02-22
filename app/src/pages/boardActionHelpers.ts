import type Konva from 'konva'

import { getObjectAnchors } from '../lib/boardGeometry'
import type { AnchorKind, BoardObject, Point } from '../types/board'
import type { VoteConfettiParticle, Viewport } from './boardPageTypes'

export const resolveSnappedConnectorEndpoint = (args: {
  point: Point
  objects: BoardObject[]
  thresholdPx: number
}) => {
  const { point, objects, thresholdPx } = args
  const thresholdSquared = thresholdPx * thresholdPx
  let nearest:
      | {
          point: Point
          objectId: string
          anchor: AnchorKind
          distanceSquared: number
        }
    | null = null

  for (const candidate of objects) {
    const anchors = getObjectAnchors(candidate)
    for (const anchorCandidate of anchors) {
      const dx = point.x - anchorCandidate.point.x
      const dy = point.y - anchorCandidate.point.y
      const distanceSquared = dx * dx + dy * dy

      if (distanceSquared > thresholdSquared) {
        continue
      }

      if (!nearest || distanceSquared < nearest.distanceSquared) {
        nearest = {
          point: anchorCandidate.point,
          objectId: anchorCandidate.objectId,
          anchor: anchorCandidate.anchor,
          distanceSquared,
        }
      }
    }
  }

  if (!nearest) {
    return {
      point,
      objectId: null,
      anchor: null,
    }
  }

  return {
    point: nearest.point,
    objectId: nearest.objectId,
    anchor: nearest.anchor,
  }
}

export const createVoteConfettiParticles = (args: {
  stickyObjectId: string
  origin: Point
  colors: string[]
  count: number
}): VoteConfettiParticle[] => {
  const { stickyObjectId, origin, colors, count } = args
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.random() * Math.PI - Math.PI
    const speed = 2.4 + Math.random() * 3.4
    const sizeValue = 5 + Math.random() * 4
    return {
      id: `${stickyObjectId}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: sizeValue,
      color: colors[index % colors.length],
      rotation: Math.random() * 360,
      spin: (Math.random() - 0.5) * 18,
      life: 1,
    }
  })
}

export const createImportedStickies = (args: {
  lines: string[]
  boardId: string
  userUid: string
  baseZIndex: number
  basePoint: Point
  stickyColors: string[]
}): BoardObject[] => {
  const { lines, boardId, userUid, baseZIndex, basePoint, stickyColors } = args
  const now = Date.now()
  return lines.slice(0, 40).map((line, index) => {
    const id = crypto.randomUUID()
    const sticky: BoardObject = {
      id,
      boardId,
      type: 'stickyNote',
      shapeType: 'rectangle',
      position: {
        x: basePoint.x + (index % 4) * 210,
        y: basePoint.y + Math.floor(index / 4) * 130,
      },
      size: { width: 180, height: 110 },
      zIndex: baseZIndex + index + 1,
      text: line,
      color: stickyColors[index % stickyColors.length],
      createdBy: userUid,
      createdAt: now + index,
      updatedBy: userUid,
      updatedAt: now + index,
      version: 1,
    }
    return sticky
  })
}

type Bounds = { x: number; y: number; width: number; height: number }

export const exportStageSnapshot = async (args: {
  stage: Konva.Stage
  format: 'png' | 'pdf'
  scope: 'full' | 'selection'
  viewport: Viewport
  stageSize: { width: number; height: number }
  objects: BoardObject[]
  getObjectBounds: (boardObject: BoardObject) => Bounds
  maxExportPixelCount: number
  maxPdfEdgePx: number
  notifyExportComplete: (detail: { format: 'png' | 'pdf'; scope: 'full' | 'selection'; fileBase: string }) => void
}) => {
  const {
    stage,
    format,
    scope,
    viewport,
    stageSize,
    objects,
    getObjectBounds,
    maxExportPixelCount,
    maxPdfEdgePx,
    notifyExportComplete,
  } = args

  const viewportBounds = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: stageSize.width / viewport.scale,
    height: stageSize.height / viewport.scale,
  }

  let bounds: Bounds | null = null
  if (scope === 'selection') {
    bounds = viewportBounds
  } else if (objects.length > 0) {
    const resolvedBounds = objects.map((boardObject) => getObjectBounds(boardObject))
    const minX = Math.min(...resolvedBounds.map((item) => item.x))
    const minY = Math.min(...resolvedBounds.map((item) => item.y))
    const maxX = Math.max(...resolvedBounds.map((item) => item.x + item.width))
    const maxY = Math.max(...resolvedBounds.map((item) => item.y + item.height))
    bounds = {
      x: minX - 24,
      y: minY - 24,
      width: Math.max(64, maxX - minX + 48),
      height: Math.max(64, maxY - minY + 48),
    }
  } else {
    bounds = viewportBounds
  }

  const crop = bounds
    ? {
        x: bounds.x * viewport.scale + viewport.x,
        y: bounds.y * viewport.scale + viewport.y,
        width: Math.max(2, bounds.width * viewport.scale),
        height: Math.max(2, bounds.height * viewport.scale),
      }
    : {
        x: 0,
        y: 0,
        width: stageSize.width,
        height: stageSize.height,
      }
  const cropArea = Math.max(1, crop.width * crop.height)
  const cappedPixelRatio = Math.min(2, Math.sqrt(maxExportPixelCount / cropArea))

  const dataUrl = stage.toDataURL({
    pixelRatio: cappedPixelRatio,
    ...crop,
  })
  const fileBase = scope === 'selection' ? 'board-selection' : 'board-full'

  if (format === 'png') {
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `${fileBase}.png`
    anchor.click()
    notifyExportComplete({ format: 'png', scope, fileBase })
    return
  }

  const pdfScale = Math.min(1, maxPdfEdgePx / Math.max(crop.width, crop.height))
  const pdfWidth = Math.max(2, Math.round(crop.width * pdfScale))
  const pdfHeight = Math.max(2, Math.round(crop.height * pdfScale))

  try {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({
      orientation: pdfWidth >= pdfHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    })
    pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`${fileBase}.pdf`)
    notifyExportComplete({ format: 'pdf', scope, fileBase })
  } catch (error) {
    console.error('PDF export failed', error)
  }
}
