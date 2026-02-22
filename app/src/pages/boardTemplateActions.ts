import type { AnchorKind, BoardObject, ConnectorStyle, Point, ShapeKind } from '../types/board'
import { getAnchorPointForObject } from '../lib/boardGeometry'
import {
  CONNECTOR_COLOR_OPTIONS,
  FRAME_COLOR_OPTIONS,
  SHAPE_COLOR_OPTIONS,
  STICKY_COLOR_OPTIONS,
} from './boardPageRuntimePrimitives'
import type { TemplateKey } from './boardPageTypes'

type CreateObjectFn = (
  objectType: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text',
  options?: {
    shapeType?: ShapeKind
    connectorStyle?: ConnectorStyle
    connectorStart?: Point
    connectorEnd?: Point
    fromObjectId?: string | null
    toObjectId?: string | null
    fromAnchor?: AnchorKind | null
    toAnchor?: AnchorKind | null
    title?: string
    text?: string
    color?: string
    fontSize?: number
    position?: Point
    skipSelection?: boolean
  },
) => Promise<BoardObject | null>

type ApplyBoardTemplateArgs = {
  canEditBoard: boolean
  createObject: CreateObjectFn
  setSelectedIds: (next: string[]) => void
  setSelectionMode: (next: 'select' | 'area') => void
  setShowTemplateChooser: (next: boolean) => void
  stageSize: { width: number; height: number }
  templateKey: TemplateKey
  viewport: { x: number; y: number; scale: number }
}

export const applyBoardTemplate = async ({
  canEditBoard,
  createObject,
  setSelectedIds,
  setSelectionMode,
  setShowTemplateChooser,
  stageSize,
  templateKey,
  viewport,
}: ApplyBoardTemplateArgs) => {
  if (!canEditBoard) {
    return
  }

  const worldCenter = {
    x: (-viewport.x + stageSize.width / 2) / viewport.scale,
    y: (-viewport.y + stageSize.height / 2) / viewport.scale,
  }

  const addSticky = async (args: { text: string; x: number; y: number; color?: string }) => {
    await createObject('stickyNote', {
      text: args.text,
      color: args.color || STICKY_COLOR_OPTIONS[0],
      position: { x: args.x, y: args.y },
      skipSelection: true,
    })
  }
  const addFrame = async (args: { title: string; x: number; y: number; color?: string }) => {
    await createObject('frame', {
      title: args.title,
      color: args.color || FRAME_COLOR_OPTIONS[0],
      position: { x: args.x, y: args.y },
      skipSelection: true,
    })
  }
  const addShape = async (args: {
    text: string
    x: number
    y: number
    shapeType?: ShapeKind
    color?: string
  }) => {
    return createObject('shape', {
      text: args.text,
      shapeType: args.shapeType || 'rectangle',
      color: args.color || SHAPE_COLOR_OPTIONS[0],
      position: { x: args.x, y: args.y },
      skipSelection: true,
    })
  }
  const addConnector = async (args: {
    x: number
    y: number
    style?: ConnectorStyle
    color?: string
    connectorStart?: Point
    connectorEnd?: Point
    fromObjectId?: string | null
    toObjectId?: string | null
    fromAnchor?: AnchorKind | null
    toAnchor?: AnchorKind | null
  }) => {
    return createObject('connector', {
      connectorStyle: args.style || 'line',
      color: args.color || CONNECTOR_COLOR_OPTIONS[0],
      position: { x: args.x, y: args.y },
      connectorStart: args.connectorStart,
      connectorEnd: args.connectorEnd,
      fromObjectId: args.fromObjectId,
      toObjectId: args.toObjectId,
      fromAnchor: args.fromAnchor,
      toAnchor: args.toAnchor,
      skipSelection: true,
    })
  }

  if (templateKey === 'retro') {
    const columns = [
      { title: 'What Went Well', x: worldCenter.x - 620, color: FRAME_COLOR_OPTIONS[2] },
      { title: "What Didn't Go Well", x: worldCenter.x, color: FRAME_COLOR_OPTIONS[3] },
      { title: 'Action Items', x: worldCenter.x + 620, color: FRAME_COLOR_OPTIONS[1] },
    ]

    for (const column of columns) {
      await addFrame({
        title: column.title,
        x: column.x,
        y: worldCenter.y - 140,
        color: column.color,
      })
      await addSticky({
        text: `Add notes for ${column.title.toLowerCase()}`,
        x: column.x,
        y: worldCenter.y + 36,
        color: STICKY_COLOR_OPTIONS[0],
      })
    }
  } else if (templateKey === 'mindmap') {
    const centralTopic = await addShape({
      text: 'Central Topic',
      shapeType: 'circle',
      color: SHAPE_COLOR_OPTIONS[1],
      x: worldCenter.x,
      y: worldCenter.y,
    })
    if (!centralTopic || centralTopic.type !== 'shape') {
      return
    }

    const branches = [
      { text: 'Branch 1', x: worldCenter.x - 340, y: worldCenter.y - 220, color: SHAPE_COLOR_OPTIONS[2] },
      { text: 'Branch 2', x: worldCenter.x + 340, y: worldCenter.y - 220, color: SHAPE_COLOR_OPTIONS[3] },
      { text: 'Branch 3', x: worldCenter.x - 340, y: worldCenter.y + 220, color: SHAPE_COLOR_OPTIONS[4] },
      { text: 'Branch 4', x: worldCenter.x + 340, y: worldCenter.y + 220, color: SHAPE_COLOR_OPTIONS[0] },
    ]

    for (const branch of branches) {
      const branchShape = await addShape({
        text: branch.text,
        shapeType: 'rectangle',
        color: branch.color,
        x: branch.x,
        y: branch.y,
      })
      if (!branchShape || branchShape.type !== 'shape') {
        continue
      }

      const dx = branchShape.position.x - centralTopic.position.x
      const dy = branchShape.position.y - centralTopic.position.y
      const fromAnchor: AnchorKind =
        Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
      const toAnchor: AnchorKind =
        Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom'
      const connectorStart = getAnchorPointForObject(centralTopic, fromAnchor)
      const connectorEnd = getAnchorPointForObject(branchShape, toAnchor)
      if (!connectorStart || !connectorEnd) {
        continue
      }
      await addConnector({
        x: (worldCenter.x + branch.x) / 2,
        y: (worldCenter.y + branch.y) / 2,
        style: 'line',
        color: CONNECTOR_COLOR_OPTIONS[0],
        connectorStart,
        connectorEnd,
        fromObjectId: centralTopic.id,
        toObjectId: branchShape.id,
        fromAnchor,
        toAnchor,
      })
    }
  } else if (templateKey === 'kanban') {
    const columns = [
      { title: 'To Do', x: worldCenter.x - 620, color: FRAME_COLOR_OPTIONS[0] },
      { title: 'Doing', x: worldCenter.x, color: FRAME_COLOR_OPTIONS[4] },
      { title: 'Done', x: worldCenter.x + 620, color: FRAME_COLOR_OPTIONS[2] },
    ]

    for (const column of columns) {
      await addFrame({
        title: column.title,
        x: column.x,
        y: worldCenter.y - 160,
        color: column.color,
      })
    }

    await addSticky({
      text: 'Task 1',
      x: worldCenter.x - 620,
      y: worldCenter.y + 24,
      color: STICKY_COLOR_OPTIONS[0],
    })
    await addSticky({
      text: 'Task 2',
      x: worldCenter.x,
      y: worldCenter.y + 24,
      color: STICKY_COLOR_OPTIONS[1],
    })
    await addSticky({
      text: 'Task 3',
      x: worldCenter.x + 620,
      y: worldCenter.y + 24,
      color: STICKY_COLOR_OPTIONS[4],
    })
  }

  setSelectionMode('select')
  setShowTemplateChooser(false)
  setSelectedIds([])
}
