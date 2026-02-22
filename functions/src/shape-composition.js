const normalizeShapeType = (value, fallback = 'rectangle') => {
  const normalized = String(value || fallback).trim().toLowerCase()
  if (normalized === 'rect' || normalized === 'rectangle') {
    return 'rectangle'
  }
  if (normalized === 'circ' || normalized === 'circle') {
    return 'circle'
  }
  if (normalized === 'diamond') {
    return 'diamond'
  }
  if (normalized === 'tri' || normalized === 'triangle') {
    return 'triangle'
  }

  return ['rectangle', 'circle', 'diamond', 'triangle'].includes(normalized) ? normalized : fallback
}

const SHAPE_TEMPLATES = {
  bus: {
    parts: [
      { type: 'rectangle', width: 220, height: 90, color: '#fbbf24', offsetX: 0, offsetY: 0 },
      { type: 'circle', width: 50, height: 50, color: '#93c5fd', offsetX: 38, offsetY: 44 },
      { type: 'circle', width: 50, height: 50, color: '#93c5fd', offsetX: 132, offsetY: 44 },
    ],
  },
  house: {
    parts: [
      { type: 'rectangle', width: 140, height: 100, color: '#fde68a', offsetX: 0, offsetY: 30 },
      { type: 'triangle', width: 140, height: 70, color: '#fca5a5', offsetX: 0, offsetY: 0 },
      { type: 'rectangle', width: 26, height: 56, color: '#a16207', offsetX: 45, offsetY: 62 },
    ],
  },
  tree: {
    parts: [
      { type: 'rectangle', width: 26, height: 64, color: '#a16207', offsetX: 47, offsetY: 58 },
      { type: 'circle', width: 120, height: 120, color: '#86efac', offsetX: 5, offsetY: -8 },
    ],
  },
  person: {
    parts: [
      { type: 'circle', width: 46, height: 46, color: '#fde68a', offsetX: 70, offsetY: 0 },
      { type: 'rectangle', width: 40, height: 70, color: '#93c5fd', offsetX: 72, offsetY: 44 },
      { type: 'rectangle', width: 26, height: 56, color: '#93c5fd', offsetX: 24, offsetY: 70 },
      { type: 'rectangle', width: 26, height: 56, color: '#93c5fd', offsetX: 120, offsetY: 70 },
    ],
  },
  car: {
    parts: [
      { type: 'rectangle', width: 170, height: 46, color: '#c4b5fd', offsetX: 0, offsetY: 24 },
      { type: 'rectangle', width: 90, height: 54, color: '#93c5fd', offsetX: 10, offsetY: 8 },
      { type: 'circle', width: 28, height: 28, color: '#334155', offsetX: 28, offsetY: 58 },
      { type: 'circle', width: 28, height: 28, color: '#334155', offsetX: 116, offsetY: 58 },
    ],
  },
  building: {
    parts: [
      { type: 'rectangle', width: 170, height: 140, color: '#e5e7eb', offsetX: 0, offsetY: 0 },
      { type: 'rectangle', width: 26, height: 30, color: '#0f766e', offsetX: 22, offsetY: 22 },
      { type: 'rectangle', width: 26, height: 30, color: '#0f766e', offsetX: 60, offsetY: 22 },
      { type: 'rectangle', width: 26, height: 30, color: '#0f766e', offsetX: 98, offsetY: 22 },
      { type: 'rectangle', width: 26, height: 42, color: '#0f766e', offsetX: 22, offsetY: 72 },
    ],
  },
}

const resolveDependencies = (deps = {}) => ({
  toColor: typeof deps.toColor === 'function' ? deps.toColor : (value, fallback) => fallback,
  sanitizeText: typeof deps.sanitizeText === 'function' ? deps.sanitizeText : String,
  nowMs: typeof deps.nowMs === 'function' ? deps.nowMs : Date.now,
  resolvePlacementAnchor: typeof deps.resolvePlacementAnchor === 'function' ? deps.resolvePlacementAnchor : () => ({ x: 640, y: 360 }),
  resolveViewportCenterFromPlacement:
    typeof deps.resolveViewportCenterFromPlacement === 'function' ? deps.resolveViewportCenterFromPlacement : () => null,
  getObjectsRef: typeof deps.getObjectsRef === 'function' ? deps.getObjectsRef : null,
  getNextZIndex: typeof deps.getNextZIndex === 'function' ? deps.getNextZIndex : () => 1,
  db: deps.db || null,
  commitObjectBatchWrites: typeof deps.commitObjectBatchWrites === 'function' ? deps.commitObjectBatchWrites : null,
})

const resolveAnchor = (ctx, args, dependencies = {}) => {
  const fromArgs = args?.anchor
  if (fromArgs && Number.isFinite(Number(fromArgs.x)) && Number.isFinite(Number(fromArgs.y))) {
    return { x: Number(fromArgs.x), y: Number(fromArgs.y) }
  }

  const commandPlacement = ctx?.commandPlacement || null
  const resolvedPlacementAnchor =
    typeof dependencies.resolvePlacementAnchor === 'function'
      ? dependencies.resolvePlacementAnchor(commandPlacement)
      : null
  if (Number.isFinite(Number(resolvedPlacementAnchor?.x)) && Number.isFinite(Number(resolvedPlacementAnchor?.y))) {
    return { x: Number(resolvedPlacementAnchor.x), y: Number(resolvedPlacementAnchor.y) }
  }

  if (typeof dependencies.resolveViewportCenterFromPlacement === 'function') {
    const viewportCenter = dependencies.resolveViewportCenterFromPlacement(commandPlacement)
    if (Number.isFinite(Number(viewportCenter?.x)) && Number.isFinite(Number(viewportCenter?.y))) {
      return { x: Number(viewportCenter.x), y: Number(viewportCenter.y) }
    }
  }

  return { x: 640, y: 360 }
}

const buildShapePayload = (ctx, spec, index, deps, defaultZ) => {
  const shapeType = normalizeShapeType(spec.type)
  const color = deps.toColor(spec.color, spec.fallbackColor)
  const text = deps.sanitizeText(spec.text || '')

  return {
    id: crypto.randomUUID(),
    boardId: ctx.boardId,
    type: 'shape',
    shapeType,
    text: text || '',
    color,
    position: {
      x: Math.round(Number(spec.x) || 0),
      y: Math.round(Number(spec.y) || 0),
    },
    size: {
      width: Number(spec.width) || 80,
      height: Number(spec.height) || 80,
    },
    zIndex: Number.isFinite(Number(defaultZ)) ? Number(defaultZ) + index : deps.getNextZIndex(ctx.state) + index,
    createdBy: ctx.userId,
    createdAt: deps.nowMs(),
    updatedBy: ctx.userId,
    updatedAt: deps.nowMs(),
    version: 1,
  }
}

const computeBounds = (objects) => {
  if (!Array.isArray(objects) || objects.length === 0) {
    return { x: 0, y: 0, width: 160, height: 120 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const object of objects) {
    const x = Number(object?.position?.x) || 0
    const y = Number(object?.position?.y) || 0
    const width = Number(object?.size?.width) || 0
    const height = Number(object?.size?.height) || 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  }
}

const createShapeTemplate = async (ctx, args = {}, dependencies = {}) => {
  const deps = resolveDependencies(dependencies)
  const templateType = String(args.templateType || '').trim().toLowerCase()
  const template = SHAPE_TEMPLATES[templateType]
  if (!template) {
    return { count: 0 }
  }

  const anchor = resolveAnchor(ctx, args, deps)
  const zIndexStart = deps.getNextZIndex(ctx.state)
  const stagedObjects = []

  for (let index = 0; index < template.parts.length; index += 1) {
    const part = template.parts[index]
    const payload = buildShapePayload(
      ctx,
      {
        type: part.type,
        width: part.width,
        height: part.height,
        color: part.color,
        fallbackColor: '#93c5fd',
        x: anchor.x + Number(part.offsetX || 0),
        y: anchor.y + Number(part.offsetY || 0),
        text: part.text || '',
      },
      index,
      deps,
      zIndexStart,
    )
    stagedObjects.push(payload)
  }

  if (!deps.commitObjectBatchWrites) {
    throw new Error('Shape template tool is missing batch write support.')
  }

  await deps.commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)

  ctx.executedTools.push({
    tool: 'createShapeTemplate',
    templateType,
    count: stagedObjects.length,
  })

  return {
    templateType,
    count: stagedObjects.length,
  }
}

const groupObjects = async (ctx, args = {}, dependencies = {}) => {
  const deps = resolveDependencies(dependencies)
  const memberIds = Array.isArray(args.objectIds)
    ? [...new Set(args.objectIds.map((entry) => String(entry || '').trim()).filter(Boolean))]
    : []

  if (memberIds.length < 2) {
    return { count: 0 }
  }

  const members = memberIds
    .map((id) => ctx.state.find((item) => item?.id === id))
    .filter(Boolean)

  if (members.length < 2) {
    return { count: 0 }
  }

  const bounds = computeBounds(members)
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || !deps.db || !deps.getObjectsRef) {
    return { count: 0 }
  }

  const now = deps.nowMs()
  const groupId = crypto.randomUUID()
  const groupPayload = {
    id: groupId,
    boardId: ctx.boardId,
    type: 'group',
    memberIds: members.map((member) => member.id),
    position: {
      x: bounds.x,
      y: bounds.y,
    },
    size: {
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    },
    zIndex: deps.getNextZIndex(ctx.state),
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  const batch = deps.db.batch()
  batch.set(deps.getObjectsRef(ctx.boardId).doc(groupId), groupPayload)

  for (const member of members) {
    batch.set(
      deps.getObjectsRef(ctx.boardId).doc(member.id),
      {
        groupId,
        updatedAt: now,
        updatedBy: ctx.userId,
      },
      { merge: true },
    )
  }

  await batch.commit()

  for (const member of members) {
    member.groupId = groupId
  }
  ctx.state.push(groupPayload)

  ctx.executedTools.push({
    tool: 'groupObjects',
    groupId,
    count: members.length,
  })

  return {
    groupId,
    count: members.length,
  }
}

const ungroupObjects = async (ctx, args = {}, dependencies = {}) => {
  const deps = resolveDependencies(dependencies)
  const groupId = String(args.groupId || '').trim()
  if (!groupId) {
    return { count: 0 }
  }

  const group = ctx.state.find((item) => item?.id === groupId && item?.type === 'group')
  if (!group || !group.memberIds) {
    return { count: 0 }
  }

  const memberIds = Array.isArray(group.memberIds)
    ? [...new Set(group.memberIds.map((entry) => String(entry || '').trim()).filter(Boolean))]
    : []

  if (memberIds.length === 0) {
    const index = ctx.state.findIndex((item) => item?.id === groupId)
    if (index !== -1) {
      ctx.state.splice(index, 1)
    }
    return { count: 0 }
  }

  const now = deps.nowMs()
  const members = memberIds
    .map((id) => ctx.state.find((item) => item?.id === id))
    .filter(Boolean)

  if (members.length > 0 && deps.db && deps.getObjectsRef) {
    const batch = deps.db.batch()
    for (const member of members) {
      batch.set(
        deps.getObjectsRef(ctx.boardId).doc(member.id),
        {
          groupId: null,
          updatedAt: now,
          updatedBy: ctx.userId,
        },
        { merge: true },
      )
    }

    batch.set(
      deps.getObjectsRef(ctx.boardId).doc(groupId),
      {
        deleted: true,
        deletedAt: now,
        deletedBy: ctx.userId,
        updatedBy: ctx.userId,
        updatedAt: now,
      },
      { merge: true },
    )

    await batch.commit()
  }

  const index = ctx.state.findIndex((item) => item?.id === groupId)
  if (index !== -1) {
    ctx.state.splice(index, 1)
  }

  for (const member of members) {
    delete member.groupId
  }

  ctx.executedTools.push({
    tool: 'ungroupObjects',
    groupId,
    count: members.length,
  })

  return {
    groupId,
    count: members.length,
  }
}

module.exports = {
  SHAPE_TEMPLATES,
  createShapeTemplate,
  groupObjects,
  ungroupObjects,
}
