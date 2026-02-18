/* eslint-disable no-console */
const admin = require('firebase-admin')
const { onRequest } = require('firebase-functions/v2/https')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

// GLM-5 LLM client imports
let glmClient = null
let toolRegistry = null
try {
  glmClient = require('./src/glm-client')
  toolRegistry = require('./src/tool-registry')
} catch (importError) {
  console.warn('GLM client modules not available:', importError.message)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COLOR_MAP = {
  yellow: '#fde68a',
  blue: '#93c5fd',
  green: '#86efac',
  pink: '#fbcfe8',
  red: '#fca5a5',
  orange: '#fdba74',
  purple: '#c4b5fd',
  gray: '#e2e8f0',
}
const STICKY_SHAPE_SIZES = {
  rectangle: { width: 180, height: 110 },
  circle: { width: 130, height: 130 },
  diamond: { width: 170, height: 120 },
  triangle: { width: 170, height: 120 },
}

const normalizeShapeType = (rawShapeType, fallback = 'rectangle') => {
  const normalized = String(rawShapeType || '').toLowerCase().trim()
  if (normalized === 'circle') return 'circle'
  if (normalized === 'diamond' || normalized === 'rhombus' || normalized === 'romb') return 'diamond'
  if (normalized === 'triangle') return 'triangle'
  if (normalized === 'rectangle' || normalized === 'box' || normalized === 'shape') return 'rectangle'
  return fallback
}

const toColor = (rawColor, fallback) => {
  if (!rawColor) return fallback
  const normalized = rawColor.toLowerCase().trim()
  return COLOR_MAP[normalized] || rawColor
}

const nowMs = () => Date.now()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeText = (text) => String(text || '').trim().slice(0, 300)
const normalizeCommand = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
const normalizeCommandForPlan = (value) =>
  normalizeCommand(value)
    .replace(/\borganise\b/gi, 'organize')
    .replace(/\bcolour\b/gi, 'color')
const isOrganizeByColorCommand = (lowerCommand) =>
  (lowerCommand.includes('organize') && lowerCommand.includes('color')) ||
  (lowerCommand.includes('group') && lowerCommand.includes('color')) ||
  (lowerCommand.includes('sort') && lowerCommand.includes('color'))
const isKnownColor = (value) => Boolean(value && COLOR_MAP[String(value).toLowerCase().trim()])

const stripWrappingQuotes = (value) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/^['"]|['"]$/g, '').trim()
}

const extractColorAndText = (raw) => {
  const normalized = stripWrappingQuotes(raw)
  if (!normalized) {
    return { color: undefined, text: '' }
  }

  const parts = normalized.split(/\s+/)
  const [first, ...rest] = parts

  if (isKnownColor(first)) {
    return {
      color: first,
      text: rest.join(' ').trim(),
    }
  }

  return {
    color: undefined,
    text: normalized,
  }
}

const parseStickyCommand = (command) => {
  const normalized = normalizeCommand(command)
  if (!/^(?:add|create)\b/i.test(normalized)) {
    return null
  }

  const stickyMarker = normalized.match(/\b(?:sticky(?:\s*note)?|sticker)s?\b/i)
  if (!stickyMarker) {
    return null
  }

  const markerStart = stickyMarker.index || 0
  const markerText = stickyMarker[0]
  const beforeMarker = normalized
    .slice(0, markerStart)
    .replace(/^(?:add|create)\b/i, '')
    .replace(/^\s*(?:a|an)\b/i, '')
    .trim()

  const afterMarker = normalized.slice(markerStart + markerText.length).trim()
  const cueMatch = normalized.match(/\b(?:that\s+says|saying|with\s+text)\b\s*(.+)$/i)
  const cueText = cueMatch ? cueMatch[1].trim() : ''
  const suffixText = afterMarker.replace(/^[.!?]+|[.!?]+$/g, '').trim()

  let textSource = cueText || suffixText || beforeMarker
  let colorCandidate

  if (beforeMarker) {
    const beforeParts = beforeMarker.split(/\s+/).filter(Boolean)
    if (beforeParts.length === 1 && isKnownColor(beforeParts[0])) {
      colorCandidate = beforeParts[0]
      if (!cueText && !suffixText) {
        textSource = ''
      }
    }
  }

  const parsed = extractColorAndText(textSource)
  if (!colorCandidate) {
    colorCandidate = parsed.color
  }

  if (!parsed.text) {
    return { color: undefined, text: 'New sticky note' }
  }

  return { color: colorCandidate, text: sanitizeText(parsed.text) || 'New sticky note' }
}

const getObjectsRef = (boardId) => db.collection('boards').doc(boardId).collection('objects')
const getCommandsRef = (boardId) => db.collection('boards').doc(boardId).collection('aiCommands')
const getSystemRef = (boardId) => db.collection('boards').doc(boardId).collection('system').doc('ai-lock')

const getBoardState = async (boardId) => {
  const snapshot = await getObjectsRef(boardId).limit(500).get()
  const objects = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    if (data && !data.deleted) objects.push(data)
  })
  return objects
}

const getNextZIndex = (objects) => objects.reduce((maxZ, obj) => Math.max(maxZ, obj.zIndex || 0), 0) + 1
const toConnectorBounds = (start, end) => ({
  position: {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  },
  size: {
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  },
})
const getObjectCenter = (object) => ({
  x: parseNumber(object?.position?.x, 0) + parseNumber(object?.size?.width, 0) / 2,
  y: parseNumber(object?.position?.y, 0) + parseNumber(object?.size?.height, 0) / 2,
})

const writeObject = async ({ boardId, objectId, payload, merge = false }) => {
  const ref = getObjectsRef(boardId).doc(objectId)
  if (merge) {
    await ref.set(payload, { merge: true })
  } else {
    await ref.set(payload)
  }
}

const createStickyNote = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const shapeType = normalizeShapeType(args.shapeType || args.type)
  const defaultSize = STICKY_SHAPE_SIZES[shapeType]
  const sticky = {
    id,
    boardId: ctx.boardId,
    type: 'stickyNote',
    shapeType,
    position: { x: parseNumber(args.x, 80), y: parseNumber(args.y, 80) },
    size: {
      width: parseNumber(args.width, defaultSize.width),
      height: parseNumber(args.height, defaultSize.height),
    },
    zIndex,
    text: sanitizeText(args.text || 'New sticky note'),
    color: toColor(args.color, '#fde68a'),
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: sticky })
  ctx.state.push(sticky)
  ctx.executedTools.push({ tool: 'createStickyNote', id })
  return sticky
}

const createShape = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const shape = {
    id,
    boardId: ctx.boardId,
    type: 'shape',
    shapeType: args.type || 'rectangle',
    position: { x: parseNumber(args.x, 200), y: parseNumber(args.y, 200) },
    size: {
      width: parseNumber(args.width, 220),
      height: parseNumber(args.height, 140),
    },
    zIndex,
    color: toColor(args.color, '#93c5fd'),
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: shape })
  ctx.state.push(shape)
  ctx.executedTools.push({ tool: 'createShape', id })
  return shape
}

const createFrame = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const frame = {
    id,
    boardId: ctx.boardId,
    type: 'frame',
    title: sanitizeText(args.title || 'Frame'),
    color: '#e2e8f0',
    position: {
      x: parseNumber(args.x, 120),
      y: parseNumber(args.y, 120),
    },
    size: {
      width: parseNumber(args.width, 480),
      height: parseNumber(args.height, 300),
    },
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: frame })
  ctx.state.push(frame)
  ctx.executedTools.push({ tool: 'createFrame', id: frame.id })
  return frame
}

const createConnector = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const fromObject = ctx.state.find((candidate) => candidate.id === args.fromId)
  const toObject = ctx.state.find((candidate) => candidate.id === args.toId)
  const start = fromObject
    ? getObjectCenter(fromObject)
    : {
        x: parseNumber(args.startX, parseNumber(args.x1, 180)),
        y: parseNumber(args.startY, parseNumber(args.y1, 180)),
      }
  const end = toObject
    ? getObjectCenter(toObject)
    : {
        x: parseNumber(args.endX, parseNumber(args.x2, start.x + 180)),
        y: parseNumber(args.endY, parseNumber(args.y2, start.y + 40)),
      }
  const bounds = toConnectorBounds(start, end)

  const connector = {
    id,
    boardId: ctx.boardId,
    type: 'connector',
    color: toColor(args.color, '#0f172a'),
    start,
    end,
    fromObjectId: fromObject?.id || null,
    toObjectId: toObject?.id || null,
    fromAnchor: null,
    toAnchor: null,
    ...bounds,
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: connector })
  ctx.state.push(connector)
  ctx.executedTools.push({ tool: 'createConnector', id, fromId: args.fromId || null, toId: args.toId || null })
  return connector
}

const moveObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    position: { x: parseNumber(args.x, object.position.x), y: parseNumber(args.y, object.position.y) },
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'moveObject', id: object.id })
  return object
}

const resizeObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    size: {
      width: parseNumber(args.width, object.size?.width || 180),
      height: parseNumber(args.height, object.size?.height || 110),
    },
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'resizeObject', id: object.id })
  return object
}

const updateText = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId && candidate.type === 'stickyNote')
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    text: sanitizeText(args.newText || object.text),
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'updateText', id: object.id })
  return object
}

const changeColor = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    color: toColor(args.color, object.color || '#e2e8f0'),
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'changeColor', id: object.id })
  return object
}

const createSwotTemplate = async (ctx) => {
  const startX = 100
  const startY = 100
  const boxW = 260
  const boxH = 180
  const gap = 24

  const labels = ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const index = row * 2 + col
      const x = startX + col * (boxW + gap)
      const y = startY + row * (boxH + gap)
      await createShape(ctx, { type: 'rectangle', x, y, width: boxW, height: boxH, color: '#dbeafe' })
      await createStickyNote(ctx, { text: labels[index], x: x + 12, y: y + 12, color: '#ffffff' })
    }
  }

  ctx.executedTools.push({ tool: 'createSwotTemplate' })
}

const createRetrospectiveTemplate = async (ctx) => {
  const columns = ['What Went Well', "What Didn't", 'Action Items']
  const startX = 80
  const gap = 26
  const colW = 220
  const colH = 320

  for (let i = 0; i < columns.length; i += 1) {
    const x = startX + i * (colW + gap)
    await createShape(ctx, { x, y: 110, width: colW, height: colH, color: '#dbeafe' })
    await createStickyNote(ctx, { text: columns[i], x: x + 10, y: 120, color: '#ffffff' })
  }

  ctx.executedTools.push({ tool: 'createRetrospectiveTemplate' })
}

const arrangeGrid = async (ctx, objects) => {
  if (!objects.length) return

  const columns = Math.ceil(Math.sqrt(objects.length))
  const startX = 120
  const startY = 120
  const gapX = 220
  const gapY = 150

  for (let i = 0; i < objects.length; i += 1) {
    const row = Math.floor(i / columns)
    const col = i % columns
    await moveObject(ctx, {
      objectId: objects[i].id,
      x: startX + col * gapX,
      y: startY + row * gapY,
    })
  }

  ctx.executedTools.push({ tool: 'arrangeGrid', count: objects.length })
}

const createJourneyMap = async (ctx, stages) => {
  const count = Math.min(10, Math.max(3, stages))
  const startX = 80
  const y = 420
  const gap = 190

  for (let i = 0; i < count; i += 1) {
    await createShape(ctx, { x: startX + i * gap, y, width: 160, height: 100, color: '#bfdbfe' })
    await createStickyNote(ctx, {
      text: `Stage ${i + 1}`,
      x: startX + i * gap + 12,
      y: y + 12,
      color: '#ffffff',
    })
  }

  ctx.executedTools.push({ tool: 'createJourneyMap', count })
}

const organizeBoardByType = async (ctx) => {
  const movable = ctx.state.filter((item) => item.type !== 'connector')
  if (movable.length === 0) {
    ctx.executedTools.push({ tool: 'organizeBoardByType', count: 0 })
    return
  }

  const groups = {
    frame: movable.filter((item) => item.type === 'frame'),
    shape: movable.filter((item) => item.type === 'shape'),
    sticky: movable.filter((item) => item.type === 'stickyNote'),
  }
  const orderedGroups = [groups.frame, groups.shape, groups.sticky].filter((group) => group.length > 0)
  const startX = 80
  const startY = 90
  const colGap = 280
  const rowGap = 160

  for (let col = 0; col < orderedGroups.length; col += 1) {
    const group = orderedGroups[col]
    for (let row = 0; row < group.length; row += 1) {
      const object = group[row]
      await moveObject(ctx, {
        objectId: object.id,
        x: startX + col * colGap,
        y: startY + row * rowGap,
      })
    }
  }

  ctx.executedTools.push({ tool: 'organizeBoardByType', count: movable.length })
}

const organizeBoardByColor = async (ctx) => {
  const movable = ctx.state.filter((item) => item.type !== 'connector' && item.color)
  if (movable.length === 0) {
    ctx.executedTools.push({ tool: 'organizeBoardByColor', count: 0, groups: 0 })
    return
  }

  const groups = new Map()
  for (const item of movable) {
    const colorKey = String(toColor(item.color, item.color)).toLowerCase().trim()
    if (!groups.has(colorKey)) {
      groups.set(colorKey, [])
    }
    groups.get(colorKey).push(item)
  }

  const orderedGroups = Array.from(groups.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, items]) =>
      items.slice().sort((left, right) => {
        const yDelta = parseNumber(left.position?.y, 0) - parseNumber(right.position?.y, 0)
        if (yDelta !== 0) return yDelta
        return parseNumber(left.position?.x, 0) - parseNumber(right.position?.x, 0)
      }),
    )

  const startX = 80
  const startY = 90
  const colGap = 260
  const rowGap = 150

  for (let col = 0; col < orderedGroups.length; col += 1) {
    const group = orderedGroups[col]
    for (let row = 0; row < group.length; row += 1) {
      const object = group[row]
      await moveObject(ctx, {
        objectId: object.id,
        x: startX + col * colGap,
        y: startY + row * rowGap,
      })
    }
  }

  ctx.executedTools.push({ tool: 'organizeBoardByColor', count: movable.length, groups: orderedGroups.length })
}

const synthesizeStickyThemes = async (ctx) => {
  const stickyNotes = ctx.state.filter((item) => item.type === 'stickyNote')
  if (stickyNotes.length === 0) {
    ctx.executedTools.push({ tool: 'synthesizeStickyThemes', count: 0 })
    return
  }

  const themeMap = new Map()
  for (const sticky of stickyNotes) {
    const firstWord = sanitizeText(sticky.text)
      .toLowerCase()
      .split(/\W+/)
      .find((token) => token.length > 2)
    const key = firstWord || 'general'
    if (!themeMap.has(key)) {
      themeMap.set(key, [])
    }
    themeMap.get(key).push(sticky)
  }

  const topThemes = Array.from(themeMap.entries())
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)

  const startX = 920
  const startY = 120
  const gapY = 180

  for (let i = 0; i < topThemes.length; i += 1) {
    const [theme, entries] = topThemes[i]
    await createFrame(ctx, {
      x: startX,
      y: startY + i * gapY,
      width: 260,
      height: 150,
      title: `Theme: ${theme}`,
    })
    await createStickyNote(ctx, {
      text: `${entries.length} notes mention "${theme}"`,
      x: startX + 16,
      y: startY + i * gapY + 44,
      color: '#ffffff',
    })
  }

  ctx.executedTools.push({ tool: 'synthesizeStickyThemes', count: topThemes.length })
}

const runCommandPlan = async (ctx, command) => {
  const normalizedCommand = normalizeCommandForPlan(command)
  const lower = normalizedCommand.toLowerCase()

  const stickyCommand = parseStickyCommand(normalizedCommand)
  if (stickyCommand) {
    await createStickyNote(ctx, {
      text: stickyCommand.text,
      color: toColor(stickyCommand.color, '#fde68a'),
      x: 120,
      y: 120,
    })
    return
  }

  const shapeMatch = normalizedCommand.match(
    /^(?:add|create)\s+(?:a|an)?\s*(?:(\w+)\s+)?(rectangle|box|shape|circle|diamond|rhombus|romb|triangle)(?:\s+at(?:\s+position)?\s*(-?\d+)\s*,\s*(-?\d+))?[.!?]?\s*$/i,
  )
  if (shapeMatch) {
    const [, colorCandidate, rawShapeType, xRaw, yRaw] = shapeMatch
    const shapeType = normalizeShapeType(rawShapeType)
    await createStickyNote(ctx, {
      shapeType,
      x: parseNumber(xRaw, 200),
      y: parseNumber(yRaw, 200),
      text: 'New sticky note',
      color: toColor(colorCandidate, '#93c5fd'),
    })
    return
  }

  const frameMatch = normalizedCommand.match(
    /^(?:add|create)\s+(?:a|an)?\s*frame(?:\s+named\s+(.+?))?(?:\s+at(?:\s+position)?\s*(-?\d+)\s*,\s*(-?\d+))?[.!?]?\s*$/i,
  )
  if (frameMatch) {
    const [, titleRaw, xRaw, yRaw] = frameMatch
    await createFrame(ctx, {
      title: sanitizeText(titleRaw || 'New Frame'),
      x: parseNumber(xRaw, 120),
      y: parseNumber(yRaw, 120),
      width: 480,
      height: 300,
    })
    return
  }

  const connectorMatch = normalizedCommand.match(
    /^(?:add|create)\s+(?:a|an)?\s*(?:(\w+)\s+)?(?:connector|arrow|line)(?:\s+from\s+([a-z0-9-]+)\s+to\s+([a-z0-9-]+))?/i,
  )
  if (connectorMatch) {
    const [, colorCandidate, fromId, toId] = connectorMatch
    await createConnector(ctx, {
      color: colorCandidate,
      fromId: fromId || undefined,
      toId: toId || undefined,
    })
    return
  }

  if (lower.includes('swot')) {
    await createSwotTemplate(ctx)
    return
  }

  if (lower.includes('retrospective') || lower.includes("what went well")) {
    await createRetrospectiveTemplate(ctx)
    return
  }

  const journeyMatch = normalizedCommand.match(/user journey map\s+with\s+(\d+)\s+stages?/i)
  if (journeyMatch) {
    await createJourneyMap(ctx, Number(journeyMatch[1]))
    return
  }

  if (lower.includes('arrange') && lower.includes('grid')) {
    const stickyNotes = ctx.state.filter((item) => item.type === 'stickyNote')
    await arrangeGrid(ctx, stickyNotes)
    return
  }

  if (isOrganizeByColorCommand(lower)) {
    await organizeBoardByColor(ctx)
    return
  }

  if (
    lower.includes('organize this board') ||
    (lower.includes('organize') && lower.includes('column')) ||
    (lower.includes('organize') && lower.includes('group')) ||
    (lower.includes('group') && lower.includes('board')) ||
    (lower.includes('layout') && lower.includes('board'))
  ) {
    await organizeBoardByType(ctx)
    return
  }

  if (
    (lower.includes('summarize') && lower.includes('stick')) ||
    (lower.includes('synthesize') && lower.includes('theme')) ||
    lower.includes('group into themes')
  ) {
    await synthesizeStickyThemes(ctx)
    return
  }

  const moveColorMatch = normalizedCommand.match(/move\s+all\s+the\s+(\w+)\s+sticky notes\s+to\s+the\s+right side/i)
  if (moveColorMatch) {
    const requestedColor = toColor(moveColorMatch[1], moveColorMatch[1])
    const stickyNotes = ctx.state.filter(
      (item) => item.type === 'stickyNote' && String(item.color).toLowerCase() === String(requestedColor).toLowerCase(),
    )

    for (const sticky of stickyNotes) {
      await moveObject(ctx, {
        objectId: sticky.id,
        x: sticky.position.x + 320,
        y: sticky.position.y,
      })
    }

    ctx.executedTools.push({ tool: 'moveByColor', count: stickyNotes.length })
    return
  }

  const changeColorMatch = normalizedCommand.match(/change\s+the\s+sticky note color\s+to\s+(\w+)/i)
  if (changeColorMatch) {
    const sticky = ctx.state.find((item) => item.type === 'stickyNote')
    if (sticky) {
      await changeColor(ctx, { objectId: sticky.id, color: changeColorMatch[1] })
    }
    return
  }

  // LLM FALLBACK: Route unrecognized commands to GLM-5
  if (glmClient) {
    try {
      return await executeViaLLM(ctx, normalizedCommand)
    } catch (llmError) {
      console.error('LLM execution failed:', llmError)
      // Fall through to original error message below
    }
  }

  throw new Error(
    'Unsupported command. Try: "add hello world sticker", "add rectangle", "add circle", "add diamond", "add frame", "add connector", "organize by color", "organize this board into groups", "summarize all stickies into themes", "arrange in grid", "create SWOT template", "retrospective", or "user journey map with 5 stages".',
  )
}

/**
 * Execute a command via GLM-5 LLM with tool calling
 * @param {object} ctx - Execution context { state, boardId, userId, executedTools }
 * @param {string} command - Normalized user command
 * @returns {Promise<void>}
 */
const executeViaLLM = async (ctx, command) => {
  console.log('Executing command via LLM:', command)

  const glmResponse = await glmClient.callGLM(command, {
    state: ctx.state,
    boardId: ctx.boardId
  })

  const toolCalls = glmClient.parseToolCalls(glmResponse)

  if (toolCalls.length === 0) {
    // Check if there's a text response instead
    const textResponse = glmClient.getTextResponse(glmResponse)
    if (textResponse) {
      throw new Error(`LLM did not return any tool calls. Response: "${textResponse}"`)
    }
    throw new Error('LLM did not return any tool calls')
  }

  // Execute each tool call sequentially
  for (const toolCall of toolCalls) {
    if (toolCall.parseError) {
      throw new Error(`Failed to parse tool call arguments for ${toolCall.name}`)
    }

    console.log('LLM tool call:', toolCall.name, toolCall.arguments)

    // Route to existing handler functions
    switch (toolCall.name) {
      case 'createStickyNote':
        await createStickyNote(ctx, {
          text: toolCall.arguments.text || 'New sticky note',
          shapeType: toolCall.arguments.shapeType || 'rectangle',
          color: toColor(toolCall.arguments.color, '#fde68a'),
          x: parseNumber(toolCall.arguments.x, 120),
          y: parseNumber(toolCall.arguments.y, 120),
          width: toolCall.arguments.width,
          height: toolCall.arguments.height
        })
        break

      case 'createShape':
        await createStickyNote(ctx, {
          text: toolCall.arguments.text || 'New sticky note',
          shapeType: toolCall.arguments.type || 'rectangle',
          width: toolCall.arguments.width,
          height: toolCall.arguments.height,
          color: toColor(toolCall.arguments.color, '#93c5fd'),
          x: parseNumber(toolCall.arguments.x, 200),
          y: parseNumber(toolCall.arguments.y, 200)
        })
        break

      case 'createFrame':
        await createFrame(ctx, {
          title: sanitizeText(toolCall.arguments.title || 'New Frame'),
          width: parseNumber(toolCall.arguments.width, 480),
          height: parseNumber(toolCall.arguments.height, 300),
          x: parseNumber(toolCall.arguments.x, 120),
          y: parseNumber(toolCall.arguments.y, 120)
        })
        break

      case 'createConnector':
        await createConnector(ctx, {
          fromId: toolCall.arguments.fromId,
          toId: toolCall.arguments.toId,
          color: toColor(toolCall.arguments.color, '#0f172a')
        })
        break

      case 'moveObject':
        await moveObject(ctx, {
          objectId: toolCall.arguments.objectId,
          x: parseNumber(toolCall.arguments.x, 0),
          y: parseNumber(toolCall.arguments.y, 0)
        })
        break

      case 'changeColor':
        await changeColor(ctx, {
          objectId: toolCall.arguments.objectId,
          color: toolCall.arguments.color
        })
        break

      case 'organizeBoardByColor':
        await organizeBoardByColor(ctx)
        break

      case 'organizeBoardByType':
        await organizeBoardByType(ctx)
        break

      case 'arrangeGrid':
        const stickyNotes = ctx.state.filter(item => item.type === 'stickyNote')
        await arrangeGrid(ctx, stickyNotes)
        break

      case 'createSwotTemplate':
        await createSwotTemplate(ctx)
        break

      case 'createRetrospectiveTemplate':
        await createRetrospectiveTemplate(ctx)
        break

      default:
        throw new Error(`Unknown tool requested by LLM: ${toolCall.name}`)
    }

    ctx.executedTools.push({
      tool: toolCall.name,
      llmGenerated: true,
      args: toolCall.arguments
    })
  }

  console.log('LLM execution completed, tools executed:', toolCalls.length)
}

const reserveQueueSequence = async (boardId) => {
  const lockRef = getSystemRef(boardId)

  const sequence = await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef)
    const lockData = lockSnap.exists ? lockSnap.data() : null
    const nextSequence = parseNumber(lockData?.nextSequence, 1)
    const processingSequence = parseNumber(lockData?.processingSequence, 1)

    tx.set(
      lockRef,
      {
        nextSequence: nextSequence + 1,
        processingSequence,
        updatedAt: nowMs(),
      },
      { merge: true },
    )

    return nextSequence
  })

  return sequence
}

const acquireBoardLock = async (boardId, commandId, queueSequence) => {
  const lockRef = getSystemRef(boardId)

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const acquired = await db.runTransaction(async (tx) => {
      const now = nowMs()
      const lockSnap = await tx.get(lockRef)
      const lockData = lockSnap.exists ? lockSnap.data() : null
      const activeCommandId = lockData?.activeCommandId || null
      const expiresAt = lockData?.expiresAt || 0
      const processingSequence = parseNumber(lockData?.processingSequence, 1)

      if (processingSequence !== queueSequence) {
        return false
      }

      if (activeCommandId && expiresAt > now && activeCommandId !== commandId) {
        return false
      }

      tx.set(
        lockRef,
        {
          activeCommandId: commandId,
          expiresAt: now + 20_000,
          updatedAt: now,
        },
        { merge: true },
      )

      return true
    })

    if (acquired) {
      return
    }

    await sleep(150)
  }

  throw new Error('AI command queue timeout. Retry in a moment.')
}

const releaseBoardLock = async (boardId, commandId, queueSequence = null) => {
  const lockRef = getSystemRef(boardId)

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef)
    if (!lockSnap.exists) return

    const lockData = lockSnap.data()
    if (lockData?.activeCommandId !== commandId) return

    const processingSequence = parseNumber(lockData?.processingSequence, 1)
    const nextProcessingSequence =
      queueSequence === null ? processingSequence : Math.max(processingSequence, queueSequence + 1)

    tx.set(
      lockRef,
      {
        activeCommandId: null,
        expiresAt: 0,
        processingSequence: nextProcessingSequence,
        updatedAt: nowMs(),
      },
      { merge: true },
    )
  })
}

exports.api = onRequest({ timeoutSeconds: 120, cors: true }, async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value))

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!req.path.endsWith('/ai/command')) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  let boardIdForError = ''
  let clientCommandIdForError = ''
  let queueSequenceForError = null
  let commandForError = ''

  try {
    const authHeader = String(req.headers.authorization || '')
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization bearer token' })
      return
    }

    const idToken = authHeader.slice('Bearer '.length).trim()
    let decodedToken
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken)
    } catch (verifyError) {
      console.warn('Bearer token verification failed', verifyError)
      res.status(401).json({ error: 'Invalid or expired bearer token' })
      return
    }

    const boardId = String(req.body?.boardId || '').trim()
    const userId = decodedToken.uid
    const userDisplayName = String(req.body?.userDisplayName || decodedToken.name || '').trim()
    const command = sanitizeText(req.body?.command)
    commandForError = command
    const clientCommandId = String(req.body?.clientCommandId || crypto.randomUUID()).trim()
    boardIdForError = boardId
    clientCommandIdForError = clientCommandId

    if (!boardId || !command) {
      res.status(400).json({ error: 'boardId and command are required' })
      return
    }

    const commandRef = getCommandsRef(boardId).doc(clientCommandId)
    const existing = await commandRef.get()
    const existingData = existing.exists ? existing.data() || {} : {}

    if (existing.exists) {
      if (existingData.status === 'success') {
        res.status(200).json({
          status: 'success',
          idempotent: true,
          commandId: clientCommandId,
          result: existingData.result,
        })
        return
      }

      if (existingData.status === 'running' || existingData.status === 'queued') {
        res.status(202).json({
          status: existingData.status,
          commandId: clientCommandId,
          queueSequence: existingData.queueSequence || null,
        })
        return
      }
    }

    let queueSequence = parseNumber(existingData.queueSequence, 0)
    if (!queueSequence) {
      queueSequence = await reserveQueueSequence(boardId)
    }
    queueSequenceForError = queueSequence

    await commandRef.set(
      {
        boardId,
        command,
        userId,
        userDisplayName,
        status: 'queued',
        queueSequence,
        queuedAt: nowMs(),
      },
      { merge: true },
    )

    await acquireBoardLock(boardId, clientCommandId, queueSequence)

    await commandRef.set(
      {
        status: 'running',
        startedAt: nowMs(),
      },
      { merge: true },
    )

    const state = await getBoardState(boardId)
    const context = {
      boardId,
      userId,
      state,
      executedTools: [],
    }

    await runCommandPlan(context, command)

    const result = {
      executedTools: context.executedTools,
      objectCount: context.state.length,
      message: 'Command executed successfully',
    }

    await commandRef.set(
      {
        status: 'success',
        completedAt: nowMs(),
        result,
      },
      { merge: true },
    )

    await releaseBoardLock(boardId, clientCommandId, queueSequence)

    res.status(200).json({ status: 'success', commandId: clientCommandId, result })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    try {
      if (boardIdForError && clientCommandIdForError) {
        await getCommandsRef(boardIdForError).doc(clientCommandIdForError).set(
          {
            status: 'error',
            completedAt: nowMs(),
            error: errorMessage,
          },
          { merge: true },
        )
        await releaseBoardLock(boardIdForError, clientCommandIdForError, queueSequenceForError)
      }
    } catch (innerError) {
      console.error('Failed to store AI command error', innerError)
    }

    console.error('AI command execution failed', {
      error: error instanceof Error ? error.message : String(error),
      boardId: boardIdForError,
      command: commandForError,
      normalizedCommand: normalizeCommand(commandForError),
    })
    res.status(500).json({ error: errorMessage })
  }
})

exports.__test = {
  normalizeCommandForPlan,
  isOrganizeByColorCommand,
}
// Tue Feb 17 18:22:00 EST 2026
