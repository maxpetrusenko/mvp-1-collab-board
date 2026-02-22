const BULK_OPERATION_CHUNK_SIZE = 400
const GRID_SPACING_X = 200
const GRID_SPACING_Y = 150

const normalizeObjectType = (value) => {
  const normalized = String(value || 'stickyNote').trim()
  if (normalized === 'sticky' || normalized === 'note') {
    return 'stickyNote'
  }

  if (normalized === 'rectangle' || normalized === 'circle' || normalized === 'diamond' || normalized === 'triangle') {
    return 'shape'
  }

  if (normalized === 'shapes') {
    return 'shape'
  }

  if (normalized === 'frames') {
    return 'frame'
  }

  return normalized
}

const sanitizeColorInput = (value) => {
  const normalized = String(value || '').trim()
  return normalized.length > 0 ? normalized : null
}

const normalizeShapeType = (value, fallback = 'rectangle') => {
  const normalized = String(value || fallback).trim().toLowerCase()
  if (normalized === 'rect' || normalized === 'rectangle') {
    return 'rectangle'
  }
  if (normalized === 'sq' || normalized === 'square') {
    return 'rectangle'
  }
  if (normalized === 'circ' || normalized === 'circle') {
    return 'circle'
  }
  if (normalized === 'diam' || normalized === 'diamond') {
    return 'diamond'
  }
  if (normalized === 'tri' || normalized === 'triangle') {
    return 'triangle'
  }

  return ['rectangle', 'circle', 'diamond', 'triangle'].includes(normalized) ? normalized : fallback
}

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const resolveObjectType = (objectSpec) => {
  if (!objectSpec) {
    return 'stickyNote'
  }

  const explicitType = normalizeObjectType(objectSpec.type)
  if (explicitType) {
    return explicitType
  }

  return 'stickyNote'
}

const computeObjectSize = (type, shapeType) => {
  if (type === 'shape') {
    if (shapeType === 'circle') {
      return { width: 140, height: 140 }
    }
    if (shapeType === 'diamond') {
      return { width: 160, height: 120 }
    }
    if (shapeType === 'triangle') {
      return { width: 180, height: 120 }
    }
    return { width: 160, height: 110 }
  }

  if (type === 'frame') {
    return { width: 420, height: 280 }
  }

  return { width: 180, height: 110 }
}

const objectOverlapsBounds = (candidate, bounds, margin = 0) =>
  candidate.x < bounds.x + bounds.width + margin &&
  candidate.x + candidate.width > bounds.x - margin &&
  candidate.y < bounds.y + bounds.height + margin &&
  candidate.y + candidate.height > bounds.y - margin

const computeBulkPositions = (count, anchor, existingBounds = []) => {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0))
  const cols = Math.max(1, Math.ceil(Math.sqrt(safeCount || 1)))
  const positions = []
  const bounds = existingBounds
    .filter((entry) => isObject(entry) && Number.isFinite(Number(entry?.x)) && Number.isFinite(Number(entry?.y)))
    .map((entry) => ({
      x: Number(entry.x),
      y: Number(entry.y),
      width: Number(entry.width) > 0 ? Number(entry.width) : 160,
      height: Number(entry.height) > 0 ? Number(entry.height) : 110,
    }))

  for (let index = 0; index < safeCount; index += 1) {
    const col = index % cols
    const row = Math.floor(index / cols)
    let x = Number.isFinite(Number(anchor?.x)) ? Number(anchor.x) : 0
    let y = Number.isFinite(Number(anchor?.y)) ? Number(anchor.y) : 0
    x += col * GRID_SPACING_X
    y += row * GRID_SPACING_Y

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const intersects = bounds.some((bound) => objectOverlapsBounds({ x, y, width: 180, height: 110 }, bound, 12))
      if (!intersects) {
        break
      }

      x += GRID_SPACING_X
      y += GRID_SPACING_Y
    }

    positions.push({
      x: Math.round(x),
      y: Math.round(y),
    })

    bounds.push({ x, y, width: 180, height: 110 })
  }

  return positions
}

const resolveAnchor = (ctx, args, dependencies = {}) => {
  const fromArgs = args?.anchor
  if (fromArgs && Number.isFinite(Number(fromArgs.x)) && Number.isFinite(Number(fromArgs.y))) {
    return { x: Number(fromArgs.x), y: Number(fromArgs.y) }
  }

  const commandPlacement = ctx?.commandPlacement || null
  if (typeof dependencies.resolvePlacementAnchor === 'function') {
    const anchor = dependencies.resolvePlacementAnchor(commandPlacement)
    if (Number.isFinite(Number(anchor?.x)) && Number.isFinite(Number(anchor?.y))) {
      return { x: Number(anchor.x), y: Number(anchor.y) }
    }
  }

  if (typeof dependencies.resolveViewportCenterFromPlacement === 'function') {
    const viewportCenter = dependencies.resolveViewportCenterFromPlacement(commandPlacement)
    if (Number.isFinite(Number(viewportCenter?.x)) && Number.isFinite(Number(viewportCenter?.y))) {
      return { x: Number(viewportCenter.x), y: Number(viewportCenter.y) }
    }
  }

  return { x: 640, y: 360 }
}

const resolveDependencies = (deps = {}) => ({
  toColor: typeof deps.toColor === 'function' ? deps.toColor : (value, fallback) => fallback,
  sanitizeText: typeof deps.sanitizeText === 'function' ? deps.sanitizeText : String,
  nowMs: typeof deps.nowMs === 'function' ? deps.nowMs : Date.now,
  getNextZIndex: typeof deps.getNextZIndex === 'function' ? deps.getNextZIndex : () => 1,
  resolvePlacementAnchor: typeof deps.resolvePlacementAnchor === 'function' ? deps.resolvePlacementAnchor : () => ({ x: 640, y: 360 }),
  resolveViewportCenterFromPlacement:
    typeof deps.resolveViewportCenterFromPlacement === 'function' ? deps.resolveViewportCenterFromPlacement : () => null,
  commitObjectBatchWrites: typeof deps.commitObjectBatchWrites === 'function' ? deps.commitObjectBatchWrites : null,
  db: deps.db || null,
  getObjectsRef: typeof deps.getObjectsRef === 'function' ? deps.getObjectsRef : null,
})

const chunkedCommit = async (ctx, objects, deps) => {
  const commitObjectBatchWrites = deps.commitObjectBatchWrites
  if (!commitObjectBatchWrites) {
    throw new Error('Bulk object writer is unavailable.')
  }

  if (!Array.isArray(objects) || objects.length === 0) {
    return
  }

  for (let i = 0; i < objects.length; i += BULK_OPERATION_CHUNK_SIZE) {
    const chunk = objects.slice(i, i + BULK_OPERATION_CHUNK_SIZE)
    await commitObjectBatchWrites({ boardId: ctx.boardId, objects: chunk })
  }
}

const buildBulkObjectPayload = (ctx, spec = {}, index = 0, zIndex) => {
  const deps = spec.__deps || {}
  const safeZ = Number.isFinite(Number(zIndex)) ? Number(zIndex) : deps.getNextZIndex(ctx.state)
  const objectType = resolveObjectType(spec)
  const color = sanitizeColorInput(spec.color)
  const objectText = deps.sanitizeText
    ? deps.sanitizeText(spec.text || spec.label || spec.title || '')
    : String(spec.text || spec.label || spec.title || '')
  const normalizedShapeType = normalizeShapeType(spec.shapeType, 'rectangle')
  const size = computeObjectSize(objectType, normalizedShapeType)
  const position = {
    x: Number(spec.position?.x),
    y: Number(spec.position?.y),
  }

  if (objectType === 'shape') {
    return {
      id: crypto.randomUUID(),
      boardId: ctx.boardId,
      type: objectType,
      shapeType: normalizedShapeType,
      position,
      size,
      zIndex: safeZ + index,
      ...(objectText ? { text: objectText } : {}),
      color: deps.toColor(color, '#93c5fd'),
      createdBy: ctx.userId,
      createdAt: deps.nowMs(),
      updatedBy: ctx.userId,
      updatedAt: deps.nowMs(),
      version: 1,
    }
  }

  if (objectType === 'frame') {
    return {
      id: crypto.randomUUID(),
      boardId: ctx.boardId,
      type: objectType,
      title: objectText || `Frame ${index + 1}`,
      size,
      position,
      zIndex: safeZ + index,
      color: deps.toColor(color, '#e2e8f0'),
      createdBy: ctx.userId,
      createdAt: deps.nowMs(),
      updatedBy: ctx.userId,
      updatedAt: deps.nowMs(),
      version: 1,
    }
  }

  return {
    id: crypto.randomUUID(),
    boardId: ctx.boardId,
    type: 'stickyNote',
    text: objectText || `Note ${index + 1}`,
    shapeType: normalizedShapeType,
    position,
    size,
    zIndex: safeZ + index,
    color: deps.toColor(color, '#fde68a'),
    createdBy: ctx.userId,
    createdAt: deps.nowMs(),
    updatedBy: ctx.userId,
    updatedAt: deps.nowMs(),
    version: 1,
  }
}

const createObjects = async (ctx, args = {}, dependencies = {}) => {
  const argsArray = Array.isArray(args.objects) ? args.objects : []
  if (argsArray.length === 0) {
    return { count: 0 }
  }

  const deps = resolveDependencies(dependencies)
  const anchor = resolveAnchor(ctx, args, dependencies)
  const baseZIndex = Number.isFinite(Number(args.startZIndex))
    ? Number(args.startZIndex)
    : deps.getNextZIndex(ctx.state)
  const stagedObjects = []

  const objectBounds = ctx.state
    .filter((item) => item?.position && item?.size)
    .map((item) => ({
      x: Number(item.position?.x) || 0,
      y: Number(item.position?.y) || 0,
      width: Number(item.size?.width) || 160,
      height: Number(item.size?.height) || 110,
    }))

  const positions = computeBulkPositions(argsArray.length, anchor, objectBounds)

  for (let index = 0; index < argsArray.length; index += 1) {
    const objectSpec = argsArray[index]
    const objectType = resolveObjectType(objectSpec)
    if (!objectType) {
      continue
    }

    const position = positions[index] || anchor
    const payload = buildBulkObjectPayload(
      ctx,
      {
        ...objectSpec,
        type: objectType,
        position,
        __deps: deps,
      },
      stagedObjects.length,
      baseZIndex,
    )

    stagedObjects.push(payload)
  }

  await chunkedCommit(ctx, stagedObjects, deps)
  ctx.state.push(...stagedObjects)

  ctx.executedTools.push({
    tool: 'createObjects',
    count: stagedObjects.length,
  })

  return {
    count: stagedObjects.length,
    objects: stagedObjects,
  }
}

const applyBatchColorMutation = async (ctx, objectIds, targetColor, dependencies = {}) => {
  const deps = resolveDependencies(dependencies)
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    return { count: 0 }
  }

  const validIds = [...new Set(objectIds.map((entry) => String(entry || '').trim()).filter(Boolean))]
  if (validIds.length === 0) {
    return { count: 0 }
  }

  const toColor = deps.toColor
  const now = deps.nowMs()
  const totalIds = validIds.length
  let totalChanged = 0

  if (!deps.db || typeof deps.getObjectsRef !== 'function') {
    for (const objectId of validIds) {
      const object = ctx.state.find((item) => item?.id === objectId)
      if (!object) {
        continue
      }
      const color = toColor(targetColor, object.color || toColor)
      object.color = color
      object.updatedAt = now
      object.updatedBy = ctx.userId
      object.version = Number.isFinite(Number(object.version)) ? Number(object.version) + 1 : 1
      totalChanged += 1
    }
    return { count: totalChanged }
  }

  for (let i = 0; i < totalIds; i += BULK_OPERATION_CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + BULK_OPERATION_CHUNK_SIZE)
    if (!chunk.length) {
      continue
    }

    if (!deps.db || typeof deps.getObjectsRef !== 'function') {
      throw new Error('Bulk color mutation module is missing required firestore dependencies.')
    }

    const batch = deps.db.batch()
    const updatedIds = []
    for (const objectId of chunk) {
      const object = ctx.state.find((item) => item?.id === objectId)
      if (!object) {
        continue
      }
      const ref = deps.getObjectsRef(ctx.boardId).doc(objectId)
      const color = toColor(targetColor, object.color || toColor)
      batch.set(
        ref,
        {
          color,
          updatedAt: now,
          updatedBy: ctx.userId,
          version: Number.isFinite(Number(object.version)) ? Number(object.version) + 1 : 1,
        },
        { merge: true },
      )
      updatedIds.push({ id: objectId, color })
    }

    if (updatedIds.length > 0) {
      await batch.commit()
      for (const updated of updatedIds) {
        const object = ctx.state.find((item) => item?.id === updated.id)
        if (object) {
          object.color = updated.color
        }
      }
      totalChanged += updatedIds.length
    }
  }

  return { count: totalChanged }
}

const applyBatchDelete = async (ctx, objectIds, dependencies = {}) => {
  const deps = resolveDependencies(dependencies)
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    return { count: 0 }
  }

  const validIds = [...new Set(objectIds.map((entry) => String(entry || '').trim()).filter(Boolean))]
  if (validIds.length === 0) {
    return { count: 0 }
  }

  const now = deps.nowMs()
  let totalDeleted = 0

  if (!deps.db || typeof deps.getObjectsRef !== 'function') {
    const idsToDelete = [...new Set(validIds)]
    for (const objectId of idsToDelete) {
      const index = ctx.state.findIndex((item) => item?.id === objectId)
      if (index === -1) {
        continue
      }
      ctx.state.splice(index, 1)
      totalDeleted += 1
    }
    return { count: totalDeleted }
  }

  for (let i = 0; i < validIds.length; i += BULK_OPERATION_CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + BULK_OPERATION_CHUNK_SIZE)
    if (chunk.length === 0) {
      continue
    }

    if (!deps.db || typeof deps.getObjectsRef !== 'function') {
      throw new Error('Bulk delete module is missing required firestore dependencies.')
    }

    const batch = deps.db.batch()
    const idsToDelete = []

    for (const objectId of chunk) {
      const object = ctx.state.find((item) => item?.id === objectId)
      if (!object) {
        continue
      }

      const ref = deps.getObjectsRef(ctx.boardId).doc(objectId)
      batch.set(
        ref,
        {
          deleted: true,
          deletedAt: now,
          deletedBy: ctx.userId,
          updatedAt: now,
          updatedBy: ctx.userId,
        },
        { merge: true },
      )
      idsToDelete.push(objectId)
    }

    if (idsToDelete.length > 0) {
      await batch.commit()
      for (const objectId of idsToDelete) {
        const index = ctx.state.findIndex((item) => item?.id === objectId)
        if (index !== -1) {
          ctx.state.splice(index, 1)
        }
      }
      totalDeleted += idsToDelete.length
    }
  }

  return { count: totalDeleted }
}

module.exports = {
  BULK_OPERATION_CHUNK_SIZE,
  computeBulkPositions,
  createObjects,
  applyBatchColorMutation,
  applyBatchDelete,
}
