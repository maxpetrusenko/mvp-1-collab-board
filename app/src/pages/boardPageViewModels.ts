import type { CSSProperties } from 'react'

import type { BoardObject, Point } from '../types/board'
import type { InlineEditorDraft, Viewport } from './boardPageTypes'
import { getContrastingTextColor } from '../lib/contrast'
import { normalizeShapeKind } from '../lib/boardGeometry'

type InlineEditorTarget = BoardObject | null

type InlineEditorLayoutArgs = {
  inlineEditor: InlineEditorDraft | null
  inlineEditorTarget: InlineEditorTarget
  localObjectPositions: Record<string, { point: Point } | undefined>
  localObjectRotations: Record<string, number>
  viewport: Viewport
}

export type InlineEditorLayout = {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  multiline: boolean
  rotation: number
  transformOriginX: number
  transformOriginY: number
}

export const computeInlineEditorLayout = (args: InlineEditorLayoutArgs): InlineEditorLayout | null => {
  const { inlineEditor, inlineEditorTarget, localObjectPositions, localObjectRotations, viewport } = args
  if (!inlineEditor || !inlineEditorTarget || inlineEditorTarget.type === 'connector') {
    return null
  }

  const objectPosition =
    localObjectPositions[inlineEditorTarget.id]?.point || inlineEditorTarget.position
  const objectLeft = viewport.x + objectPosition.x * viewport.scale
  const objectTop = viewport.y + objectPosition.y * viewport.scale
  const objectRotation = localObjectRotations[inlineEditorTarget.id] ?? inlineEditorTarget.rotation ?? 0
  const withTransform = (layout: {
    left: number
    top: number
    width: number
    height: number
    fontSize: number
    multiline: boolean
  }) => ({
    ...layout,
    rotation: objectRotation,
    transformOriginX: objectLeft - layout.left,
    transformOriginY: objectTop - layout.top,
  })

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'stickyNote') {
    const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
    const objectWidth = inlineEditorTarget.size.width * viewport.scale
    const objectHeight = inlineEditorTarget.size.height * viewport.scale

    if (shapeType === 'rectangle') {
      const inset = 8 * viewport.scale
      return withTransform({
        left: objectLeft + inset,
        top: objectTop + inset,
        width: Math.max(120, objectWidth - inset * 2),
        height: Math.max(48, objectHeight - inset * 2),
        fontSize: Math.max(12, 16 * viewport.scale),
        multiline: true,
      })
    }

    const widthRatio =
      shapeType === 'circle' ? 0.68 : shapeType === 'triangle' ? 0.56 : 0.62
    const heightRatio = shapeType === 'triangle' ? 0.46 : 0.56
    const width = Math.max(96, objectWidth * widthRatio)
    const height = Math.max(42, objectHeight * heightRatio)

    return withTransform({
      left: objectLeft + (objectWidth - width) / 2,
      top: objectTop + (objectHeight - height) / 2,
      width,
      height,
      fontSize: Math.max(12, 14 * viewport.scale),
      multiline: true,
    })
  }

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
    const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
    const objectWidth = inlineEditorTarget.size.width * viewport.scale
    const objectHeight = inlineEditorTarget.size.height * viewport.scale

    if (shapeType === 'rectangle') {
      const inset = 10 * viewport.scale
      return withTransform({
        left: objectLeft + inset,
        top: objectTop + inset,
        width: Math.max(120, objectWidth - inset * 2),
        height: Math.max(36, objectHeight - inset * 2),
        fontSize: Math.max(12, 14 * viewport.scale),
        multiline: true,
      })
    }

    const widthRatio =
      shapeType === 'circle' ? 0.68 : shapeType === 'triangle' ? 0.56 : 0.62
    const heightRatio = shapeType === 'triangle' ? 0.46 : 0.56
    const width = Math.max(92, objectWidth * widthRatio)
    const height = Math.max(38, objectHeight * heightRatio)

    return withTransform({
      left: objectLeft + (objectWidth - width) / 2,
      top: objectTop + (objectHeight - height) / 2,
      width,
      height,
      fontSize: Math.max(12, 14 * viewport.scale),
      multiline: true,
    })
  }

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'text') {
    return withTransform({
      left: objectLeft,
      top: objectTop,
      width: Math.max(120, inlineEditorTarget.size.width * viewport.scale),
      height: Math.max(36, inlineEditorTarget.size.height * viewport.scale),
      fontSize: Math.max(12, (inlineEditorTarget.fontSize || 24) * viewport.scale),
      multiline: true,
    })
  }

  if (inlineEditor.field === 'title' && inlineEditorTarget.type === 'frame') {
    return withTransform({
      left: objectLeft + 10 * viewport.scale,
      top: objectTop + 6 * viewport.scale,
      width: Math.max(160, inlineEditorTarget.size.width * viewport.scale - 20 * viewport.scale),
      height: Math.max(24, 24 * viewport.scale),
      fontSize: Math.max(12, 14 * viewport.scale),
      multiline: false,
    })
  }

  return null
}

type InlineEditorAppearanceArgs = {
  inlineEditor: InlineEditorDraft | null
  inlineEditorTarget: InlineEditorTarget
}

export type InlineEditorAppearance = {
  className: string
  style: CSSProperties
}

export const computeInlineEditorAppearance = (
  args: InlineEditorAppearanceArgs,
): InlineEditorAppearance | null => {
  const { inlineEditor, inlineEditorTarget } = args
  if (!inlineEditor || !inlineEditorTarget) {
    return null
  }

  const classNames = ['inline-editor']
  const style: CSSProperties = {}

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'stickyNote') {
    const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
    classNames.push('inline-editor-sticky')

    if (shapeType === 'rectangle') {
      classNames.push('inline-editor-align-left')
      style.backgroundColor = inlineEditorTarget.color
      style.borderColor = 'rgba(15, 23, 42, 0.22)'
    } else {
      classNames.push('inline-editor-align-center')
      style.backgroundColor = 'transparent'
      style.borderColor = 'rgba(15, 23, 42, 0.3)'
    }

    if (shapeType === 'circle') {
      classNames.push('inline-editor-pill')
    }

    style.color = getContrastingTextColor(inlineEditorTarget.color)
    return { className: classNames.join(' '), style }
  }

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
    const shapeType = normalizeShapeKind(inlineEditorTarget.shapeType)
    classNames.push('inline-editor-shape')

    if (shapeType === 'rectangle') {
      classNames.push('inline-editor-align-left')
      style.backgroundColor = inlineEditorTarget.color
      style.borderColor = 'rgba(15, 23, 42, 0.22)'
    } else {
      classNames.push('inline-editor-align-center')
      style.backgroundColor = 'transparent'
      style.borderColor = 'rgba(15, 23, 42, 0.3)'
    }

    style.color = getContrastingTextColor(inlineEditorTarget.color)
    return { className: classNames.join(' '), style }
  }

  if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'text') {
    classNames.push('inline-editor-text-object')
    style.backgroundColor = 'transparent'
    style.borderColor = 'transparent'
    style.color = inlineEditorTarget.color
    return { className: classNames.join(' '), style }
  }

  if (inlineEditor.field === 'title' && inlineEditorTarget.type === 'frame') {
    classNames.push('inline-editor-frame', 'inline-editor-align-left')
    style.backgroundColor = inlineEditorTarget.color
    style.borderColor = 'rgba(15, 23, 42, 0.24)'
    style.color = getContrastingTextColor(inlineEditorTarget.color)
    return { className: classNames.join(' '), style }
  }

  return { className: classNames.join(' '), style }
}

type Bounds = { x: number; y: number; width: number; height: number }
type MinimapObject = { id: string; x: number; y: number; width: number; height: number }
export type MinimapModel = {
  miniWidth: number
  miniHeight: number
  world: Bounds
  viewportWorld: Bounds
  objects: MinimapObject[]
}

type MinimapModelArgs = {
  objects: BoardObject[]
  viewport: Viewport
  stageSize: { width: number; height: number }
  getObjectBounds: (boardObject: BoardObject) => Bounds
}

export const computeMinimapModel = (args: MinimapModelArgs): MinimapModel => {
  const { objects, viewport, stageSize, getObjectBounds } = args
  const miniWidth = 220
  const miniHeight = 140
  const bounds = objects.map((boardObject) => getObjectBounds(boardObject))
  const viewportWorld = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: stageSize.width / viewport.scale,
    height: stageSize.height / viewport.scale,
  }

  if (bounds.length === 0) {
    return {
      miniWidth,
      miniHeight,
      world: viewportWorld,
      viewportWorld,
      objects: [],
    }
  }

  const minX = Math.min(viewportWorld.x, ...bounds.map((item) => item.x))
  const minY = Math.min(viewportWorld.y, ...bounds.map((item) => item.y))
  const maxX = Math.max(
    viewportWorld.x + viewportWorld.width,
    ...bounds.map((item) => item.x + item.width),
  )
  const maxY = Math.max(
    viewportWorld.y + viewportWorld.height,
    ...bounds.map((item) => item.y + item.height),
  )
  const worldWidth = Math.max(1, maxX - minX)
  const worldHeight = Math.max(1, maxY - minY)

  return {
    miniWidth,
    miniHeight,
    world: {
      x: minX,
      y: minY,
      width: worldWidth,
      height: worldHeight,
    },
    viewportWorld,
    objects: bounds.map((item, index) => ({
      id: objects[index]?.id || `obj-${index}`,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })),
  }
}

export const computeSelectionBounds = (selectionBox: {
  active: boolean
  start: Point
  end: Point
} | null): Bounds | null => {
  if (!selectionBox?.active) {
    return null
  }
  const minX = Math.min(selectionBox.start.x, selectionBox.end.x)
  const minY = Math.min(selectionBox.start.y, selectionBox.end.y)
  const maxX = Math.max(selectionBox.start.x, selectionBox.end.x)
  const maxY = Math.max(selectionBox.start.y, selectionBox.end.y)
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
