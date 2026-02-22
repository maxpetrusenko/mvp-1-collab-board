import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { User } from 'firebase/auth'

import type {
  AnchorKind,
  BoardObject,
  ConnectorStyle,
  Point,
  ShapeKind,
} from '../types/board'
import {
  isFinitePoint,
  normalizeAnchorKind,
  normalizeConnectorStyle,
  normalizeShapeKind,
  toConnectorBounds,
  clamp,
} from '../lib/boardGeometry'
import {
  CONNECTOR_COLOR_OPTIONS,
  DEFAULT_FRAME_SIZE,
  DEFAULT_SHAPE_SIZES,
  DEFAULT_TEXT_SIZE,
  FRAME_COLOR_OPTIONS,
  NEW_OBJECT_OFFSET_STEP,
  SHAPE_COLOR_OPTIONS,
  STICKY_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
} from './boardPageRuntimePrimitives'
import type { CreatePopoverKey, ShapeDraft, TemplateKey, TextDraft } from './boardPageTypes'
import { applyBoardTemplate } from './boardTemplateActions'

type CreationContext = {
  boardId: string
  dbAvailable: boolean
  canEditBoard: boolean
  hasLiveBoardAccess: boolean
  user: User | null
  stageSize: { width: number; height: number }
  viewport: { x: number; y: number; scale: number }
  objectsRef: MutableRefObject<BoardObject[]>
  pendingStickyDropIdsRef: MutableRefObject<Set<string>>
  objectsCreatedCountRef: MutableRefObject<number>
  shapeCreateDraft: ShapeDraft
  connectorCreateDraft: { style: ConnectorStyle; color: string }
  textCreateDraft: TextDraft
  activeCreatePopover: CreatePopoverKey | null
  createPopoverContainerRef: MutableRefObject<HTMLDivElement | null>
  setActiveCreatePopover: Dispatch<SetStateAction<CreatePopoverKey | null>>
  setSelectionMode: Dispatch<SetStateAction<'select' | 'area'>>
  setShowTemplateChooser: Dispatch<SetStateAction<boolean>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setTextCreateDraft: Dispatch<SetStateAction<TextDraft>>
  writeBoardObject: (boardObject: BoardObject) => Promise<void>
  pushHistory: (entry: { type: 'create'; object: BoardObject }) => void
  logActivity: (entry: {
    actorId: string
    actorName: string
    action: string
    targetId: string | null
    targetType: BoardObject['type'] | null
  }) => Promise<void>
  touchBoard: () => void
}

type CreateObjectOptions = {
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
}

export const useBoardCreationActions = ({
  boardId,
  dbAvailable,
  canEditBoard,
  hasLiveBoardAccess,
  user,
  stageSize,
  viewport,
  objectsRef,
  pendingStickyDropIdsRef,
  objectsCreatedCountRef,
  shapeCreateDraft,
  connectorCreateDraft,
  textCreateDraft,
  activeCreatePopover,
  createPopoverContainerRef,
  setActiveCreatePopover,
  setSelectionMode,
  setShowTemplateChooser,
  setSelectedIds,
  setTextCreateDraft,
  writeBoardObject,
  pushHistory,
  logActivity,
  touchBoard,
}: CreationContext) => {
  const createObject = useCallback(
    async (
      objectType: 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text',
      options?: CreateObjectOptions,
    ): Promise<BoardObject | null> => {
      if (!dbAvailable || !user || !hasLiveBoardAccess || !canEditBoard) {
        return null
      }

      const id = crypto.randomUUID()
      const now = Date.now()
      const currentZIndex = objectsRef.current.reduce(
        (maxValue, boardObject) => Math.max(maxValue, boardObject.zIndex),
        0,
      )

      const creationOffset = options?.position ? 0 : objectsCreatedCountRef.current * NEW_OBJECT_OFFSET_STEP
      const centerPosition =
        options?.position || {
          x: (-viewport.x + stageSize.width / 2) / viewport.scale + creationOffset,
          y: (-viewport.y + stageSize.height / 2) / viewport.scale + creationOffset,
        }

      const shapeType = normalizeShapeKind(options?.shapeType)
      const connectorStyle = normalizeConnectorStyle(options?.connectorStyle)
      const connectorStart = isFinitePoint(options?.connectorStart)
        ? options.connectorStart
        : {
            x: centerPosition.x - 80,
            y: centerPosition.y,
          }
      const connectorEnd = isFinitePoint(options?.connectorEnd)
        ? options.connectorEnd
        : {
            x: centerPosition.x + 120,
            y: centerPosition.y + 40,
          }
      const connectorBounds = toConnectorBounds(connectorStart, connectorEnd)
      const connectorFromObjectId =
        typeof options?.fromObjectId === 'string' && options.fromObjectId.trim().length > 0
          ? options.fromObjectId.trim()
          : null
      const connectorToObjectId =
        typeof options?.toObjectId === 'string' && options.toObjectId.trim().length > 0
          ? options.toObjectId.trim()
          : null
      const connectorFromAnchor = normalizeAnchorKind(options?.fromAnchor)
      const connectorToAnchor = normalizeAnchorKind(options?.toAnchor)
      const size =
        objectType === 'shape' || objectType === 'stickyNote'
          ? DEFAULT_SHAPE_SIZES[shapeType]
          : objectType === 'frame'
            ? DEFAULT_FRAME_SIZE
            : objectType === 'text'
              ? DEFAULT_TEXT_SIZE
              : objectType === 'connector'
                ? connectorBounds.size
                : DEFAULT_SHAPE_SIZES.rectangle
      const position = objectType === 'connector' ? connectorBounds.position : centerPosition

      const base = {
        id,
        boardId,
        position,
        size: { ...size },
        rotation: 0,
        zIndex: currentZIndex + 1,
        createdBy: user.uid,
        createdAt: now,
        updatedBy: user.uid,
        updatedAt: now,
        version: 1,
      }

      const nextObject: BoardObject =
        objectType === 'stickyNote'
          ? {
              ...base,
              type: 'stickyNote',
              shapeType,
              color:
                options?.color && STICKY_COLOR_OPTIONS.includes(options.color)
                  ? options.color
                  : STICKY_COLOR_OPTIONS[0],
              text: options?.text?.trim() || 'New sticky note',
            }
          : objectType === 'shape'
            ? {
                ...base,
                type: 'shape',
                shapeType,
                color:
                  options?.color && SHAPE_COLOR_OPTIONS.includes(options.color)
                    ? options.color
                    : SHAPE_COLOR_OPTIONS[0],
                text: options?.text?.trim() || 'New shape',
              }
            : objectType === 'frame'
              ? {
                  ...base,
                  type: 'frame',
                  color: FRAME_COLOR_OPTIONS[0],
                  title: options?.title || 'New Frame',
                }
              : objectType === 'text'
                ? {
                    ...base,
                    type: 'text',
                    color:
                      options?.color && TEXT_COLOR_OPTIONS.includes(options.color)
                        ? options.color
                        : TEXT_COLOR_OPTIONS[0],
                    text: options?.text?.trim() || 'New text',
                    fontSize:
                      typeof options?.fontSize === 'number'
                        ? clamp(options.fontSize, 12, 72)
                        : 24,
                  }
                : {
                    ...base,
                    type: 'connector',
                    color:
                      options?.color && CONNECTOR_COLOR_OPTIONS.includes(options.color)
                        ? options.color
                        : CONNECTOR_COLOR_OPTIONS[0],
                    style: connectorStyle,
                    start: connectorStart,
                    end: connectorEnd,
                    fromObjectId: connectorFromObjectId,
                    toObjectId: connectorToObjectId,
                    fromAnchor: connectorFromAnchor,
                    toAnchor: connectorToAnchor,
                  }

      if (objectType === 'stickyNote') {
        pendingStickyDropIdsRef.current.add(id)
      }

      await writeBoardObject(nextObject)
      pushHistory({ type: 'create', object: nextObject })
      void logActivity({
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Anonymous',
        action: `created ${nextObject.type}`,
        targetId: nextObject.id,
        targetType: nextObject.type,
      })
      if (!options?.skipSelection) {
        setSelectedIds([id])
      }
      if (!options?.position) {
        objectsCreatedCountRef.current += 1
      }
      touchBoard()
      return nextObject
    },
    [
      boardId,
      dbAvailable,
      canEditBoard,
      hasLiveBoardAccess,
      logActivity,
      pushHistory,
      stageSize.height,
      stageSize.width,
      user,
      viewport.scale,
      viewport.x,
      viewport.y,
      touchBoard,
      writeBoardObject,
      setSelectedIds,
      objectsCreatedCountRef,
      objectsRef,
      pendingStickyDropIdsRef,
    ],
  )

  const toggleCreatePopover = useCallback((popoverKey: CreatePopoverKey) => {
    if (!canEditBoard) {
      return
    }
    setActiveCreatePopover((prev) => (prev === popoverKey ? null : popoverKey))
  }, [canEditBoard, setActiveCreatePopover])

  const createShapeFromPopover = useCallback(async () => {
    await createObject('shape', {
      shapeType: shapeCreateDraft.shapeType,
      color: shapeCreateDraft.color,
      text: shapeCreateDraft.text,
    })
    setActiveCreatePopover(null)
  }, [createObject, setActiveCreatePopover, shapeCreateDraft.color, shapeCreateDraft.shapeType, shapeCreateDraft.text])

  const createConnectorFromPopover = useCallback(async () => {
    await createObject('connector', {
      connectorStyle: connectorCreateDraft.style,
      color: connectorCreateDraft.color,
    })
    setActiveCreatePopover(null)
  }, [connectorCreateDraft.color, connectorCreateDraft.style, createObject, setActiveCreatePopover])

  const createTextFromPopover = useCallback(async () => {
    await createObject('text', {
      text: textCreateDraft.text,
      color: textCreateDraft.color,
      fontSize: textCreateDraft.fontSize,
    })
    setTextCreateDraft((prev) => ({ ...prev, text: '' }))
    setActiveCreatePopover(null)
  }, [createObject, setActiveCreatePopover, setTextCreateDraft, textCreateDraft.color, textCreateDraft.fontSize, textCreateDraft.text])

  const applyTemplate = useCallback(
    async (templateKey: TemplateKey) =>
      applyBoardTemplate({
        canEditBoard,
        createObject,
        setSelectedIds: (next) => setSelectedIds(next),
        setSelectionMode: (next) => setSelectionMode(next),
        setShowTemplateChooser: (next) => setShowTemplateChooser(next),
        stageSize,
        templateKey,
        viewport,
      }),
    [canEditBoard, createObject, stageSize, viewport, setSelectionMode, setShowTemplateChooser, setSelectedIds],
  )

  useEffect(() => {
    if (!activeCreatePopover) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return
      }

      if (createPopoverContainerRef.current?.contains(event.target)) {
        return
      }
      setActiveCreatePopover(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [activeCreatePopover, createPopoverContainerRef, setActiveCreatePopover])

  return {
    applyTemplate,
    createConnectorFromPopover,
    createObject,
    createShapeFromPopover,
    createTextFromPopover,
    toggleCreatePopover,
  }
}
