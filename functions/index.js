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
const COLOR_NAME_ALTERNATION = 'yellow|blue|green|pink|red|orange|purple|gray'
const COLOR_NAME_PATTERN = `(?:${COLOR_NAME_ALTERNATION})`
const COLOR_PHRASE_REGEX = new RegExp(`\\b(${COLOR_NAME_ALTERNATION})\\s+color\\b`, 'i')
const COLOR_AND_TEXT_CUE_REGEX = new RegExp(
  `\\b(?:that\\s+says|saying|with\\s+text|with\\s+(?:a\\s+)?${COLOR_NAME_PATTERN}\\s+color\\s+and\\s+text|text\\s*[:=-])\\b\\s*(.+)$`,
  'i',
)
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
const normalizeConnectorStyle = (rawStyle) => (String(rawStyle || '').toLowerCase().trim() === 'line' ? 'line' : 'arrow')

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
const sanitizeAiAssistantResponse = (text) => sanitizeText(String(text || '').replace(/\s+/g, ' '))
const OUT_OF_SCOPE_AI_MESSAGE = "I can't help with that."
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
const NUMBER_WORD_MAP = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

const parseStickyCountToken = (token) => {
  const normalized = String(token || '').toLowerCase().trim()
  if (!normalized) {
    return null
  }

  const numericValue = /^\d+$/.test(normalized) ? Number(normalized) : NUMBER_WORD_MAP[normalized]
  if (!Number.isFinite(numericValue)) {
    return null
  }

  return Math.min(10, Math.max(1, numericValue))
}

const extractStickyPrefixMeta = (beforeMarker) => {
  const tokens = String(beforeMarker || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) {
    return { count: null, color: undefined, remainingText: '' }
  }

  let count = null
  const prefixCount = parseStickyCountToken(tokens[0])
  if (prefixCount !== null) {
    count = prefixCount
    tokens.shift()
  }

  const colorIndex = tokens.findIndex((token) => isKnownColor(token))
  let color
  if (colorIndex >= 0) {
    color = tokens[colorIndex]
    tokens.splice(colorIndex, 1)
  }

  return {
    count,
    color,
    remainingText: tokens.join(' ').trim(),
  }
}

// Parse position from string (supports "top left", "bottom right", "center", etc.)
// Returns { x, y }
// Args: positionString (string like "top left"), defaultX (number), defaultY (number)
const parsePosition = (positionString, defaultX = 120, defaultY = 120) => {
  if (!positionString) return { x: defaultX, y: defaultY }

  const normalized = String(positionString).toLowerCase().trim()

  // Board dimensions (typical viewport)
  const BOARD_WIDTH = 1920
  const BOARD_HEIGHT = 1080

  let x = defaultX
  let y = defaultY

  // Check for center/middle first (explicit center position)
  if (/^(center|middle)$/.test(normalized)) {
    x = BOARD_WIDTH / 2 - 90 // Center minus half sticky width
    y = BOARD_HEIGHT / 2 - 55 // Center minus half sticky height
    return { x, y }
  }

  // Check for relative position patterns
  const hasTop = /\btop\b/.test(normalized)
  const hasBottom = /\bbottom\b/.test(normalized)
  const hasLeft = /\bleft\b/.test(normalized)
  const hasRight = /\bright\b/.test(normalized)

  // Horizontal position
  if (hasLeft) {
    x = 120
  } else if (hasRight) {
    x = BOARD_WIDTH - 300
  } else if (!hasLeft && !hasRight && (hasTop || hasBottom)) {
    // Only "top" or "bottom" specified, center horizontally
    x = BOARD_WIDTH / 2 - 90
  }

  // Vertical position
  if (hasTop) {
    y = 120
  } else if (hasBottom) {
    y = BOARD_HEIGHT - 200
  } else if (!hasTop && !hasBottom && (hasLeft || hasRight)) {
    // Only "left" or "right" specified, center vertically
    y = BOARD_HEIGHT / 2 - 55
  }

  return { x, y }
}

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

const extractColorFromPhrase = (raw) => {
  const normalized = normalizeCommand(raw)
  const match = normalized.match(COLOR_PHRASE_REGEX)
  if (!match) {
    return undefined
  }

  return match[1]?.toLowerCase()
}

const stripColorInstructionText = (rawText) =>
  String(rawText || '')
    .replace(new RegExp(`\\bwith\\s+(?:a\\s+)?${COLOR_NAME_PATTERN}\\s+color\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${COLOR_NAME_PATTERN}\\s+color\\b`, 'gi'), '')
    .replace(/\b(?:and\s+)?text\b[:\-]?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

const inferStickyShapeType = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  if (/\b(?:circle|round)\b/.test(lower)) return 'circle'
  if (/\b(?:diamond|rhombus|romb)\b/.test(lower)) return 'diamond'
  if (/\btriangle\b/.test(lower)) return 'triangle'
  return 'rectangle'
}

const parseRequestedStickyCount = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  const countMatch = lower.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:sticky(?:\s*note)?|sticker|note)s?\b/,
  )
  if (!countMatch) {
    return 1
  }

  return parseStickyCountToken(countMatch[1]) || 1
}

const parseExplicitStickyTexts = (command) => {
  const normalized = normalizeCommand(command)
  const quoted = [...normalized.matchAll(/["']([^"']{1,120})["']/g)]
    .map((match) => sanitizeText(match[1]))
    .filter(Boolean)
  if (quoted.length >= 2) {
    return quoted.slice(0, 10)
  }

  const pairMatch = normalized.match(
    /\bone\b[^]*?\bsay(?:s)?\b\s+(.+?)\s+\banother\b[^]*?\bsay(?:s)?\b\s+(.+)$/i,
  )
  if (pairMatch) {
    const first = sanitizeText(stripWrappingQuotes(pairMatch[1]))
    const second = sanitizeText(stripWrappingQuotes(pairMatch[2]))
    return [first, second].filter(Boolean)
  }

  return []
}

const parseStickyCommand = (command) => {
  const normalized = normalizeCommand(command)
  if (!/^(?:add|create)\b/i.test(normalized)) {
    return null
  }

  const stickyMarker = normalized.match(/\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i)
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

  // Extract position from "at top left", "at center", "in the center", etc.
  const positionMatch = normalized.match(/(?:at|in(?:\s+the)?)\s+(top\s+left|top\s+right|bottom\s+left|bottom\s+right|center|middle|top|bottom|left|right)/i)
  const position = positionMatch ? positionMatch[1].toLowerCase().trim() : undefined

  const cueMatch = normalized.match(COLOR_AND_TEXT_CUE_REGEX)
  const cueText = cueMatch ? cueMatch[1].replace(/^[:\-\s]+/, '').trim() : ''
  // Remove position from suffix text if present
  let suffixText = afterMarker.replace(/^[.!?]+|[.!?]+$/g, '').trim()
  if (positionMatch) {
    suffixText = suffixText.replace(new RegExp(positionMatch[0], 'i'), '').trim()
  }

  const stickyPrefix = extractStickyPrefixMeta(beforeMarker)
  const prefixConsumed = stickyPrefix.count !== null || Boolean(stickyPrefix.color)
  let textSource = cueText || suffixText || stickyPrefix.remainingText
  if (!textSource && !prefixConsumed) {
    textSource = beforeMarker
  }
  let colorCandidate = stickyPrefix.color

  if (!cueText && !suffixText && !stickyPrefix.remainingText && prefixConsumed) {
    textSource = ''
  }

  const parsed = extractColorAndText(textSource)
  if (!colorCandidate) {
    colorCandidate = parsed.color
  }
  if (!colorCandidate) {
    colorCandidate = extractColorFromPhrase(`${beforeMarker} ${afterMarker}`)
  }

  const sanitizedParsedText = stripColorInstructionText(parsed.text)

  const explicitTexts = parseExplicitStickyTexts(normalized)
  const requestedCount = parseRequestedStickyCount(normalized)
  const count =
    explicitTexts.length > 0
      ? explicitTexts.length
      : stickyPrefix.count !== null
        ? stickyPrefix.count
        : requestedCount
  const shapeType = inferStickyShapeType(normalized)

  if (!sanitizedParsedText && explicitTexts.length === 0) {
    return {
      color: colorCandidate,
      shapeType,
      count,
      position,
      texts: Array.from({ length: count }, (_, index) =>
        count > 1 ? `Note ${index + 1}` : 'New sticky note',
      ),
    }
  }

  if (explicitTexts.length > 0) {
    return {
      color: colorCandidate,
      shapeType,
      count,
      position,
      texts: explicitTexts,
    }
  }

  const fallbackText = sanitizeText(sanitizedParsedText) || 'New sticky note'
  return {
    color: colorCandidate,
    shapeType,
    count,
    position,
    texts:
      count === 1
        ? [fallbackText]
        : Array.from({ length: count }, (_, index) =>
            fallbackText === 'New sticky note' ? `Note ${index + 1}` : `${fallbackText} ${index + 1}`,
          ),
  }
}

const getObjectsRef = (boardId) => db.collection('boards').doc(boardId).collection('objects')
const getCommandsRef = (boardId) => db.collection('boards').doc(boardId).collection('aiCommands')
const getSystemRef = (boardId) => db.collection('boards').doc(boardId).collection('system').doc('ai-lock')
const getBoardRef = (boardId) => db.collection('boards').doc(boardId)

const normalizeSharedWith = (candidate, ownerId) =>
  Array.isArray(candidate)
    ? candidate
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0 && entry !== ownerId)
    : []

const normalizeSharedRoles = (candidate, sharedWith) => {
  const normalized = {}
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    Object.entries(candidate).forEach(([userId, roleValue]) => {
      if (!sharedWith.includes(userId)) {
        return
      }
      normalized[userId] = roleValue === 'view' ? 'view' : 'edit'
    })
  }
  sharedWith.forEach((userId) => {
    if (normalized[userId] !== 'view' && normalized[userId] !== 'edit') {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}

const normalizeBoardMeta = (boardId, data) => {
  const ownerIdCandidate =
    typeof data?.ownerId === 'string' && data.ownerId.trim()
      ? data.ownerId.trim()
      : ''
  const createdByCandidate =
    typeof data?.createdBy === 'string' && data.createdBy.trim() ? data.createdBy.trim() : ''
  const ownerId = ownerIdCandidate || createdByCandidate
  const createdBy = createdByCandidate || ownerId
  const sharedWith = normalizeSharedWith(data?.sharedWith, ownerId)
  const sharedRoles = normalizeSharedRoles(data?.sharedRoles, sharedWith)

  return {
    id: String(data?.id || boardId),
    name: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : `Board ${boardId.slice(0, 8)}`,
    description: typeof data?.description === 'string' ? data.description : '',
    createdBy,
    ownerId,
    sharedWith,
    sharedRoles,
  }
}

const canUserAccessBoard = (boardMeta, userId) =>
  Boolean(boardMeta?.ownerId === userId || boardMeta?.sharedWith?.includes(userId))

const canUserEditBoard = (boardMeta, userId) => {
  if (boardMeta?.ownerId === userId) {
    return true
  }
  if (!boardMeta?.sharedWith?.includes(userId)) {
    return false
  }
  return boardMeta?.sharedRoles?.[userId] !== 'view'
}

const ensureBoardAccess = async ({ boardId, userId, createIfMissing = false }) => {
  const boardRef = getBoardRef(boardId)
  const boardSnap = await boardRef.get()

  if (!boardSnap.exists) {
    if (!createIfMissing) {
      return { ok: false, reason: 'Board not found', status: 404 }
    }

    await boardRef.set({
      id: boardId,
      name: `Board ${boardId.slice(0, 8)}`,
      description: 'Untitled board',
      ownerId: userId,
      sharedWith: [],
      sharedRoles: {},
      createdBy: userId,
      updatedBy: userId,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    })

    return {
      ok: true,
      boardMeta: {
        id: boardId,
        name: `Board ${boardId.slice(0, 8)}`,
        description: 'Untitled board',
        createdBy: userId,
        ownerId: userId,
        sharedWith: [],
        sharedRoles: {},
      },
    }
  }

  const boardMeta = normalizeBoardMeta(boardId, boardSnap.data())
  if (!boardMeta.ownerId || !canUserAccessBoard(boardMeta, userId)) {
    return { ok: false, reason: 'Access denied for this board', status: 403 }
  }

  return { ok: true, boardMeta, boardRef }
}

const resolveSingleCollaboratorFromSnapshot = (snapshot, lookupType) => {
  if (!snapshot || snapshot.empty) {
    return null
  }
  if (snapshot.docs.length > 1) {
    throw new Error(`Multiple users match that ${lookupType}. Use a full email address`)
  }
  return snapshot.docs[0].id
}

const resolveCollaboratorId = async ({ email, userId }) => {
  const trimmedUserId = typeof userId === 'string' ? userId.trim() : ''
  if (trimmedUserId) {
    return trimmedUserId
  }

  const normalizedInput = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedInput) {
    throw new Error('Provide collaborator email or userId')
  }

  if (normalizedInput.includes('@')) {
    try {
      const collaborator = await admin.auth().getUserByEmail(normalizedInput)
      return collaborator.uid
    } catch (error) {
      const exactSnapshot = await db
        .collection('users')
        .where('emailLower', '==', normalizedInput)
        .limit(2)
        .get()
      const exactId = resolveSingleCollaboratorFromSnapshot(exactSnapshot, 'email')
      if (exactId) {
        return exactId
      }
      throw new Error('Collaborator email not found')
    }
  }

  const exactUserDoc = await db.collection('users').doc(normalizedInput).get()
  if (exactUserDoc.exists) {
    return exactUserDoc.id
  }

  const displaySnapshot = await db
    .collection('users')
    .where('displayNameLower', '==', normalizedInput)
    .limit(2)
    .get()
  const displayId = resolveSingleCollaboratorFromSnapshot(displaySnapshot, 'handle')
  if (displayId) {
    return displayId
  }

  const emailPrefixStart = `${normalizedInput}@`
  const emailPrefixEnd = `${normalizedInput}@\uf8ff`
  const prefixSnapshot = await db
    .collection('users')
    .where('emailLower', '>=', emailPrefixStart)
    .where('emailLower', '<=', emailPrefixEnd)
    .limit(2)
    .get()
  const prefixId = resolveSingleCollaboratorFromSnapshot(prefixSnapshot, 'handle')
  if (prefixId) {
    return prefixId
  }

  throw new Error('Collaborator not found. Use full email or exact handle')
}

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
const getObjectBounds = (object) => {
  if (object?.type === 'connector') {
    const startX = parseNumber(object?.start?.x, 0)
    const startY = parseNumber(object?.start?.y, 0)
    const endX = parseNumber(object?.end?.x, startX)
    const endY = parseNumber(object?.end?.y, startY)
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.max(1, Math.abs(endX - startX)),
      height: Math.max(1, Math.abs(endY - startY)),
    }
  }

  return {
    x: parseNumber(object?.position?.x, 0),
    y: parseNumber(object?.position?.y, 0),
    width: Math.max(1, parseNumber(object?.size?.width, 1)),
    height: Math.max(1, parseNumber(object?.size?.height, 1)),
  }
}

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
  // Use position string if provided, otherwise use numeric x/y with defaults
  const pos = args.position
    ? parsePosition(args.position, 80, 80)
    : { x: parseNumber(args.x, 80), y: parseNumber(args.y, 80) }
  const sticky = {
    id,
    boardId: ctx.boardId,
    type: 'stickyNote',
    shapeType,
    position: { x: pos.x, y: pos.y },
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
  const shapeType = normalizeShapeType(args.type || args.shapeType, 'rectangle')
  const defaultSize = STICKY_SHAPE_SIZES[shapeType] || { width: 220, height: 140 }
  // Use position string if provided, otherwise use numeric x/y with defaults
  const pos = args.position
    ? parsePosition(args.position, 200, 200)
    : { x: parseNumber(args.x, 200), y: parseNumber(args.y, 200) }
  const shape = {
    id,
    boardId: ctx.boardId,
    type: 'shape',
    shapeType,
    position: { x: pos.x, y: pos.y },
    size: {
      width: parseNumber(args.width, defaultSize.width),
      height: parseNumber(args.height, defaultSize.height),
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
  const style = normalizeConnectorStyle(args.style)
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
    style,
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
  ctx.executedTools.push({
    tool: 'createConnector',
    id,
    fromId: args.fromId || null,
    toId: args.toId || null,
    style,
  })
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
  const object = ctx.state.find(
    (candidate) =>
      candidate.id === args.objectId &&
      (candidate.type === 'stickyNote' || candidate.type === 'shape' || candidate.type === 'text'),
  )
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

// Normalize rotation to 0-360 range
const normalizeRotationDegrees = (degrees) => {
  const normalized = degrees % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const rotateObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextRotation = normalizeRotationDegrees(parseNumber(args.angle, 0))
  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    rotation: nextRotation,
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'rotateObject', id: object.id, angle: nextRotation })
  return object
}

const deleteObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const updatedAt = nowMs()
  const patch = {
    deleted: true,
    deletedAt: updatedAt,
    deletedBy: ctx.userId,
    updatedAt,
    updatedBy: ctx.userId,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  // Remove from state array
  const index = ctx.state.findIndex((o) => o.id === args.objectId)
  if (index !== -1) {
    ctx.state.splice(index, 1)
  }
  ctx.executedTools.push({ tool: 'deleteObject', id: object.id })
  return { id: object.id, deleted: true }
}

const duplicateObject = async (ctx, args) => {
  const source = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!source) return null

  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const offsetX = parseNumber(args.offsetX, 20)
  const offsetY = parseNumber(args.offsetY, 20)

  const duplicate = {
    ...source,
    id,
    boardId: ctx.boardId,
    position: {
      x: parseNumber(source.position?.x, 0) + offsetX,
      y: parseNumber(source.position?.y, 0) + offsetY,
    },
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
    // Clear connection-specific fields for connectors
    ...(source.type === 'connector' ? { fromObjectId: null, toObjectId: null } : {}),
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: duplicate })
  ctx.state.push(duplicate)
  ctx.executedTools.push({ tool: 'duplicateObject', id, sourceId: source.id })
  return duplicate
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

const createStickyGridTemplate = async (ctx, args = {}) => {
  const rows = Math.min(6, Math.max(1, parseNumber(args.rows, 2)))
  const columns = Math.min(6, Math.max(1, parseNumber(args.columns, 3)))
  const total = rows * columns
  const startX = 120
  const startY = 120
  const gapX = 220
  const gapY = 150
  const labels = String(args.labelText || '')
    .split(/\s*(?:,|\/|\|)\s*|\s+and\s+/i)
    .map((entry) => sanitizeText(entry))
    .filter(Boolean)

  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    const label =
      labels.length > 0
        ? labels[index % labels.length]
        : `R${row + 1}C${column + 1}`

    await createStickyNote(ctx, {
      text: label,
      x: startX + column * gapX,
      y: startY + row * gapY,
      color: '#fde68a',
    })
  }

  ctx.executedTools.push({ tool: 'createStickyGridTemplate', rows, columns, count: total })
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

const spaceElementsEvenly = async (ctx, objects) => {
  const movable = (objects || ctx.state).filter((item) => item.type !== 'connector')
  if (movable.length < 3) {
    ctx.executedTools.push({ tool: 'spaceElementsEvenly', count: movable.length })
    return
  }

  const ordered = [...movable].sort((left, right) => left.position.x - right.position.x)
  const firstX = ordered[0].position.x
  const lastX = ordered[ordered.length - 1].position.x
  const step = (lastX - firstX) / (ordered.length - 1 || 1)

  for (let index = 0; index < ordered.length; index += 1) {
    const object = ordered[index]
    await moveObject(ctx, {
      objectId: object.id,
      x: Math.round(firstX + step * index),
      y: object.position.y,
    })
  }

  ctx.executedTools.push({ tool: 'spaceElementsEvenly', count: ordered.length })
}

const resizeFrameToFitContents = async (ctx, args = {}) => {
  const frame = ctx.state.find((item) => item.type === 'frame' && (!args.frameId || item.id === args.frameId))
  if (!frame) {
    ctx.executedTools.push({ tool: 'resizeFrameToFitContents', count: 0 })
    return null
  }

  const members = ctx.state.filter(
    (item) => item.id !== frame.id && item.type !== 'connector' && item.type !== 'frame' && item.frameId === frame.id,
  )
  if (members.length === 0) {
    ctx.executedTools.push({ tool: 'resizeFrameToFitContents', count: 0 })
    return frame
  }

  const padding = 24
  const bounds = members.map((member) => getObjectBounds(member))
  const minX = Math.min(...bounds.map((item) => item.x))
  const minY = Math.min(...bounds.map((item) => item.y))
  const maxX = Math.max(...bounds.map((item) => item.x + item.width))
  const maxY = Math.max(...bounds.map((item) => item.y + item.height))
  const patch = {
    position: { x: minX - padding, y: minY - padding },
    size: {
      width: Math.max(160, maxX - minX + padding * 2),
      height: Math.max(120, maxY - minY + padding * 2),
    },
    updatedAt: nowMs(),
    updatedBy: ctx.userId,
    version: (frame.version || 0) + 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: frame.id, payload: patch, merge: true })
  Object.assign(frame, patch)
  ctx.executedTools.push({ tool: 'resizeFrameToFitContents', id: frame.id, count: members.length })
  return frame
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

  const gridTemplateMatch = normalizedCommand.match(
    /(?:create|add|build)\s+(?:a\s+)?(\d+)\s*x\s*(\d+)\s+grid\s+of\s+sticky(?:\s*notes?)?(?:\s+for\s+(.+))?/i,
  )
  if (gridTemplateMatch) {
    const [, rowsRaw, columnsRaw, labelTextRaw] = gridTemplateMatch
    await createStickyGridTemplate(ctx, {
      rows: Number(rowsRaw),
      columns: Number(columnsRaw),
      labelText: stripWrappingQuotes(labelTextRaw || ''),
    })
    return
  }

  const stickyCommand = parseStickyCommand(normalizedCommand)
  if (stickyCommand) {
    const stickyCount = Math.min(10, Math.max(1, stickyCommand.count || stickyCommand.texts.length || 1))
    const basePosition = stickyCommand.position ? parsePosition(stickyCommand.position, 120, 120) : null
    for (let index = 0; index < stickyCount; index += 1) {
      const stickyArgs = {
        text: stickyCommand.texts[index] || `Note ${index + 1}`,
        color: toColor(stickyCommand.color, '#fde68a'),
        shapeType: stickyCommand.shapeType || 'rectangle',
        position: stickyCommand.position,
      }

      if (stickyCount > 1) {
        await createStickyNote(ctx, {
          ...stickyArgs,
          position: undefined,
          x: (basePosition?.x ?? 120) + (index % 4) * 220,
          y: (basePosition?.y ?? 120) + Math.floor(index / 4) * 150,
        })
      } else {
        await createStickyNote(ctx, stickyArgs)
      }
    }
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
    /^(?:add|create)\s+(?:a|an)?\s*frame(?:\s+(?:named|called)\s+(.+?))?(?:\s+at(?:\s+position)?\s*(-?\d+)\s*,\s*(-?\d+))?[.!?]?\s*$/i,
  )
  if (frameMatch) {
    const [, titleRaw, xRaw, yRaw] = frameMatch
    await createFrame(ctx, {
      title: sanitizeText(stripWrappingQuotes(titleRaw || 'New Frame')),
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
    const styleCandidate = /\bline\b/i.test(normalizedCommand) ? 'line' : 'arrow'
    await createConnector(ctx, {
      color: colorCandidate,
      fromId: fromId || undefined,
      toId: toId || undefined,
      style: styleCandidate,
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

  if ((lower.includes('space') && lower.includes('even')) || lower.includes('evenly')) {
    const movable = ctx.state.filter((item) => item.type !== 'connector')
    await spaceElementsEvenly(ctx, movable)
    return
  }

  if (
    (lower.includes('resize') || lower.includes('fit')) &&
    lower.includes('frame') &&
    (lower.includes('content') || lower.includes('contents'))
  ) {
    await resizeFrameToFitContents(ctx)
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
      const modelUnavailableMessage =
        'AI assistant is temporarily unavailable right now. Please try again in a moment.'
      return {
        message: modelUnavailableMessage,
        aiResponse: modelUnavailableMessage,
        level: 'warning',
      }
    }
  }

  return {
    message: OUT_OF_SCOPE_AI_MESSAGE,
    aiResponse: OUT_OF_SCOPE_AI_MESSAGE,
    level: 'warning',
  }
}

/**
 * Execute a command via GLM-5 LLM with tool calling
 * @param {object} ctx - Execution context { state, boardId, userId, executedTools }
 * @param {string} command - Normalized user command
 * @returns {Promise<{message?: string, aiResponse?: string} | null>}
 */
const executeViaLLM = async (ctx, command) => {
  console.log('Executing command via LLM:', command)

  const glmResponse = await glmClient.callGLM(command, {
    state: ctx.state,
    boardId: ctx.boardId
  })

  const toolCalls = glmClient.parseToolCalls(glmResponse)
  const textResponse = sanitizeAiAssistantResponse(glmClient.getTextResponse(glmResponse))

  if (toolCalls.length === 0) {
    ctx.executedTools.push({
      tool: 'assistantResponse',
      llmGenerated: true,
      outOfScope: true,
      ...(textResponse ? { modelText: textResponse } : {}),
    })
    return {
      message: OUT_OF_SCOPE_AI_MESSAGE,
      aiResponse: OUT_OF_SCOPE_AI_MESSAGE,
      level: 'warning',
    }
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
          position: toolCall.arguments.position,
          x: toolCall.arguments.x,
          y: toolCall.arguments.y,
          width: toolCall.arguments.width,
          height: toolCall.arguments.height
        })
        break

      case 'createShape':
        await createShape(ctx, {
          type: toolCall.arguments.type || 'rectangle',
          color: toColor(toolCall.arguments.color, '#93c5fd'),
          position: toolCall.arguments.position,
          x: toolCall.arguments.x,
          y: toolCall.arguments.y,
          width: toolCall.arguments.width,
          height: toolCall.arguments.height
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
          color: toColor(toolCall.arguments.color, '#0f172a'),
          style: toolCall.arguments.style,
        })
        break

      case 'moveObject':
        await moveObject(ctx, {
          objectId: toolCall.arguments.objectId,
          x: parseNumber(toolCall.arguments.x, 0),
          y: parseNumber(toolCall.arguments.y, 0)
        })
        break

      case 'resizeObject':
        await resizeObject(ctx, {
          objectId: toolCall.arguments.objectId,
          width: toolCall.arguments.width,
          height: toolCall.arguments.height
        })
        break

      case 'updateText':
        await updateText(ctx, {
          objectId: toolCall.arguments.objectId,
          newText: toolCall.arguments.newText || toolCall.arguments.text || ''
        })
        break

      case 'changeColor':
        await changeColor(ctx, {
          objectId: toolCall.arguments.objectId,
          color: toolCall.arguments.color
        })
        break

      case 'getBoardState':
        ctx.state = await getBoardState(ctx.boardId)
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

      case 'rotateObject':
        await rotateObject(ctx, toolCall.arguments)
        break

      case 'deleteObject':
        await deleteObject(ctx, toolCall.arguments)
        break

      case 'duplicateObject':
        await duplicateObject(ctx, toolCall.arguments)
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
  return textResponse
    ? {
        message: textResponse,
        aiResponse: textResponse,
      }
    : null
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

  const isAiCommandRoute = req.path.endsWith('/ai/command')
  const isBoardShareRoute = req.path.endsWith('/boards/share')
  if (!isAiCommandRoute && !isBoardShareRoute) {
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

    if (!boardId) {
      res.status(400).json({ error: 'boardId is required' })
      return
    }

    if (isBoardShareRoute) {
      const action = String(req.body?.action || 'share').trim().toLowerCase()
      const roleInput = String(req.body?.role || 'edit').trim().toLowerCase()
      const requestedRole = roleInput === 'view' ? 'view' : roleInput === 'edit' ? 'edit' : null
      const accessResult = await ensureBoardAccess({ boardId, userId, createIfMissing: false })
      if (!accessResult.ok) {
        res.status(accessResult.status || 403).json({ error: accessResult.reason || 'Access denied' })
        return
      }

      const boardMeta = accessResult.boardMeta
      if (!boardMeta || boardMeta.ownerId !== userId) {
        res.status(403).json({ error: 'Only board owner can manage sharing' })
        return
      }

      let collaboratorId = ''
      try {
        collaboratorId = await resolveCollaboratorId({
          email: req.body?.email,
          userId: req.body?.userId,
        })
      } catch (resolveError) {
        const message = resolveError instanceof Error ? resolveError.message : 'Invalid collaborator'
        res.status(400).json({ error: message })
        return
      }
      if (!collaboratorId || collaboratorId === boardMeta.ownerId) {
        res.status(400).json({ error: 'Invalid collaborator' })
        return
      }
      if ((action === 'share' || action === 'add') && !requestedRole) {
        res.status(400).json({ error: 'Invalid role. Use "edit" or "view".' })
        return
      }

      const sharedWithSet = new Set(boardMeta.sharedWith)
      const nextSharedRoles = { ...(boardMeta.sharedRoles || {}) }
      if (action === 'revoke' || action === 'remove') {
        sharedWithSet.delete(collaboratorId)
        delete nextSharedRoles[collaboratorId]
      } else {
        sharedWithSet.add(collaboratorId)
        nextSharedRoles[collaboratorId] = requestedRole || 'edit'
      }

      const nextSharedWith = [...sharedWithSet]
      const normalizedSharedRoles = normalizeSharedRoles(nextSharedRoles, nextSharedWith)
      await (accessResult.boardRef || getBoardRef(boardId)).set(
        {
          ownerId: boardMeta.ownerId,
          sharedWith: nextSharedWith,
          sharedRoles: normalizedSharedRoles,
          updatedBy: userId,
          updatedAt: nowMs(),
        },
        { merge: true },
      )

      res.status(200).json({
        status: 'success',
        boardId,
        sharedWith: nextSharedWith,
        sharedRoles: normalizedSharedRoles,
        message:
          action === 'revoke' || action === 'remove'
            ? 'Collaborator removed from board'
            : `Board shared successfully (${requestedRole || 'edit'} access). No invitation email is sent yet.`,
      })
      return
    }

    const userDisplayName = String(req.body?.userDisplayName || decodedToken.name || '').trim()
    const command = sanitizeText(req.body?.command)
    commandForError = command
    const clientCommandId = String(req.body?.clientCommandId || crypto.randomUUID()).trim()
    boardIdForError = boardId
    clientCommandIdForError = clientCommandId

    if (!command) {
      res.status(400).json({ error: 'boardId and command are required' })
      return
    }

    const accessResult = await ensureBoardAccess({ boardId, userId, createIfMissing: true })
    if (!accessResult.ok) {
      res.status(accessResult.status || 403).json({ error: accessResult.reason || 'Access denied' })
      return
    }
    if (!canUserEditBoard(accessResult.boardMeta, userId)) {
      res.status(403).json({ error: 'You have view-only access to this board.' })
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

    // Failed attempts may leave a stale queueSequence. Retry should reserve a fresh slot.
    let queueSequence = existingData.status === 'error' ? 0 : parseNumber(existingData.queueSequence, 0)
    if (queueSequence > 0) {
      const lockSnapshot = await getSystemRef(boardId).get()
      const lockData = lockSnapshot.exists ? lockSnapshot.data() : null
      const processingSequence = parseNumber(lockData?.processingSequence, 1)
      if (queueSequence < processingSequence) {
        queueSequence = 0
      }
    }
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

    const planResult = await runCommandPlan(context, command)
    const resultMessage = sanitizeAiAssistantResponse(planResult?.message) || 'Command executed and synced to the board.'
    const aiResponse = sanitizeAiAssistantResponse(planResult?.aiResponse)

    const resultLevel = planResult?.level === 'warning' ? 'warning' : undefined
    const result = {
      executedTools: context.executedTools,
      objectCount: context.state.length,
      message: resultMessage,
      ...(aiResponse ? { aiResponse } : {}),
      ...(resultLevel ? { level: resultLevel } : {}),
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
  parseStickyCommand,
  parsePosition,
  sanitizeAiAssistantResponse,
  normalizeBoardMeta,
  canUserAccessBoard,
  canUserEditBoard,
  normalizeSharedRoles,
}
// Tue Feb 17 18:22:00 EST 2026
