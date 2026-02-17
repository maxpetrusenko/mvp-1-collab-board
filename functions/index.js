/* eslint-disable no-console */
const admin = require('firebase-admin')
const { onRequest } = require('firebase-functions/v2/https')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

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
  const sticky = {
    id,
    boardId: ctx.boardId,
    type: 'stickyNote',
    position: { x: parseNumber(args.x, 80), y: parseNumber(args.y, 80) },
    size: { width: 180, height: 110 },
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
  const frame = await createShape(ctx, {
    type: 'rectangle',
    x: parseNumber(args.x, 120),
    y: parseNumber(args.y, 120),
    width: parseNumber(args.width, 480),
    height: parseNumber(args.height, 300),
    color: '#e2e8f0',
  })

  if (args.title) {
    await createStickyNote(ctx, {
      text: sanitizeText(args.title),
      x: frame.position.x + 16,
      y: frame.position.y + 12,
      color: '#ffffff',
    })
  }

  ctx.executedTools.push({ tool: 'createFrame', id: frame.id })
  return frame
}

const createConnector = async (ctx, args) => {
  ctx.executedTools.push({
    tool: 'createConnector',
    skipped: true,
    reason: 'Connector rendering is not in MVP frontend; command acknowledged.',
    fromId: args.fromId || null,
    toId: args.toId || null,
  })
  return null
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

const runCommandPlan = async (ctx, command) => {
  const normalizedCommand = normalizeCommand(command)
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

  const rectangleMatch = normalizedCommand.match(
    /^(?:add|create)\s+(?:a|an)?\s*(?:(\w+)\s+)?(?:rectangle|box|shape)(?:\s+at(?:\s+position)?\s*(-?\d+)\s*,\s*(-?\d+))?[.!?]?\s*$/i,
  )
  if (rectangleMatch) {
    const [, colorCandidate, xRaw, yRaw] = rectangleMatch
    await createShape(ctx, {
      type: 'rectangle',
      x: parseNumber(xRaw, 200),
      y: parseNumber(yRaw, 200),
      width: 220,
      height: 140,
      color: toColor(colorCandidate, '#93c5fd'),
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

  throw new Error(
    'Unsupported command. Try: "add hello world sticker", "add rectangle", "arrange in grid", "create SWOT template", "retrospective", or "user journey map with 5 stages".',
  )
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
