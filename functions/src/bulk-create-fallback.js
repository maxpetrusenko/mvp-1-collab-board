/**
 * Bulk Create Fallback Module
 *
 * Server-side intent parsing for bulk create operations.
 * Handles commands like "create 100 stickies" or "add 50 yellow circles".
 *
 * Pattern: Parse intent -> Generate objects -> Commit in chunks
 * Avoids LLM tool-call parse failures by working server-side.
 */

const crypto = require('crypto')

// Constants
const GRID_SPACING_X = 200
const GRID_SPACING_Y = 150
const BULK_CREATE_CHUNK_SIZE = 400

/**
 * Parse bulk create intent from command
 * @param {object} parsers - Helper functions from parent scope
 * @param {string} command - User command
 * @returns {object|null} - { count, objectType, color } or null
 */
function parseBulkCreateIntent(parsers, command) {
  const { normalizeCommandForPlan, tokenizeCommandWords, parseStickyCountToken, isKnownColor } = parsers

  const normalized = normalizeCommandForPlan(command).toLowerCase()
  const tokens = tokenizeCommandWords(normalized)

  // Find count token (e.g., "100", "fifty")
  const countToken = tokens.find(t => parseStickyCountToken(t) !== null)
  const count = countToken ? parseStickyCountToken(countToken) : null

  // Only handle bulk operations (2+ items)
  if (!count || count < 2) return null

  // Find color if specified
  const color = tokens.find(t => isKnownColor(t)) || null

  // Determine object type from keywords
  const hasStickyKeyword = tokens.some(t =>
    ['sticky', 'stickies', 'note', 'notes'].includes(t)
  )
  const hasShapeKeyword = tokens.some(t =>
    ['shape', 'shapes', 'circle', 'circles', 'rectangle', 'rectangles', 'diamond', 'diamonds', 'triangle', 'triangles'].includes(t)
  )
  const hasFrameKeyword = tokens.some(t =>
    ['frame', 'frames'].includes(t)
  )

  let objectType = 'stickyNote'
  if (hasFrameKeyword && !hasStickyKeyword && !hasShapeKeyword) {
    objectType = 'frame'
  } else if (hasShapeKeyword && !hasStickyKeyword) {
    objectType = 'shape'
  }

  return { count, objectType, color }
}

/**
 * Get bounding boxes of existing objects for collision detection
 * @param {Array} state - Board state
 * @returns {Array} - Array of { x, y, width, height }
 */
function getExistingBounds(state) {
  return state.filter(Boolean).map(obj => ({
    x: obj.position?.x || 0,
    y: obj.position?.y || 0,
    width: obj.size?.width || 180,
    height: obj.size?.height || 110,
  }))
}

/**
 * Compute non-overlapping position for bulk created objects
 * @param {number} index - Current object index
 * @param {number} count - Total object count
 * @param {object} anchor - Anchor position { x, y }
 * @param {Array} existingBounds - Existing object bounds
 * @returns {object} - { x, y } position
 */
function computeNonOverlappingPosition(index, count, anchor, existingBounds) {
  const cols = Math.ceil(Math.sqrt(count))
  const row = Math.floor(index / cols)
  const col = index % cols

  const x = anchor.x + col * GRID_SPACING_X
  const y = anchor.y + row * GRID_SPACING_Y

  // Check for overlap with existing objects (simple bounding box check)
  const spacing = 180 // sticky width + margin
  for (const bound of existingBounds) {
    if (x >= bound.x - spacing && x <= bound.x + bound.width + spacing &&
        y >= bound.y - spacing && y <= bound.y + bound.height + spacing) {
      // Shift if overlapping - simple approach: move down and right
      return { x: x + spacing, y: y + spacing }
    }
  }

  return { x, y }
}

/**
 * Try to apply bulk create fallback
 * @param {object} ctx - Execution context
 * @param {object} helpers - Helper functions
 * @param {string} command - User command
 * @returns {Promise<object|null>} - Result or null if not applicable
 */
async function tryApplyBulkCreateFallback(ctx, helpers, command) {
  const {
    resolvePlacementAnchor,
    resolveViewportCenterFromPlacement,
    getNextZIndex,
    commitObjectBatchWrites,
    toColor,
    nowMs,
    getObjectsRef,
    db,
  } = helpers

  const parsers = {
    normalizeCommandForPlan: helpers.normalizeCommandForPlan,
    tokenizeCommandWords: helpers.tokenizeCommandWords,
    parseStickyCountToken: helpers.parseStickyCountToken,
    isKnownColor: helpers.isKnownColor,
  }

  const intent = parseBulkCreateIntent(parsers, command)
  if (!intent) return null

  const anchor = resolvePlacementAnchor(ctx.commandPlacement) ||
                 resolveViewportCenterFromPlacement(ctx.commandPlacement) ||
                 { x: 640, y: 360 }

  let existingBounds = getExistingBounds(ctx.state)
  const createdObjects = []
  const baseZIndex = getNextZIndex(ctx.state)

  // Generate payloads
  for (let i = 0; i < intent.count; i++) {
    const position = computeNonOverlappingPosition(i, intent.count, anchor, existingBounds)
    existingBounds.push({ x: position.x, y: position.y, width: 180, height: 110 })

    const now = nowMs()

    if (intent.objectType === 'stickyNote') {
      const sticky = {
        id: crypto.randomUUID(),
        boardId: ctx.boardId,
        type: 'stickyNote',
        text: `Note ${i + 1}`,
        color: toColor(intent.color, '#fde68a'),
        position,
        size: { width: 180, height: 110 },
        zIndex: baseZIndex + i,
        createdBy: ctx.userId,
        createdAt: now,
        updatedBy: ctx.userId,
        updatedAt: now,
        version: 1,
      }
      createdObjects.push(sticky)
    } else if (intent.objectType === 'shape') {
      // Default shape type
      const shape = {
        id: crypto.randomUUID(),
        boardId: ctx.boardId,
        type: 'shape',
        shapeType: 'rectangle',
        color: toColor(intent.color, '#93c5fd'),
        text: '',
        position,
        size: { width: 100, height: 100 },
        zIndex: baseZIndex + i,
        createdBy: ctx.userId,
        createdAt: now,
        updatedBy: ctx.userId,
        updatedAt: now,
        version: 1,
      }
      createdObjects.push(shape)
    } else if (intent.objectType === 'frame') {
      const frame = {
        id: crypto.randomUUID(),
        boardId: ctx.boardId,
        type: 'frame',
        title: `Frame ${i + 1}`,
        color: toColor(intent.color, '#e2e8f0'),
        position,
        size: { width: 400, height: 300 },
        zIndex: baseZIndex + i,
        createdBy: ctx.userId,
        createdAt: now,
        updatedBy: ctx.userId,
        updatedAt: now,
        version: 1,
      }
      createdObjects.push(frame)
    }
  }

  // Chunked commit for Firestore batch limit
  for (let i = 0; i < createdObjects.length; i += BULK_CREATE_CHUNK_SIZE) {
    const chunk = createdObjects.slice(i, i + BULK_CREATE_CHUNK_SIZE)
    await commitObjectBatchWrites({ boardId: ctx.boardId, objects: chunk })
  }

  // Update state
  ctx.state.push(...createdObjects)

  const typeLabel = intent.objectType === 'stickyNote' ?
                    (intent.count === 1 ? 'sticky note' : 'sticky notes') :
                    intent.objectType === 'shape' ?
                    (intent.count === 1 ? 'shape' : 'shapes') :
                    (intent.count === 1 ? 'frame' : 'frames')

  return {
    count: createdObjects.length,
    message: `Created ${createdObjects.length} ${typeLabel}.`,
  }
}

module.exports = {
  tryApplyBulkCreateFallback,
  parseBulkCreateIntent,
  getExistingBounds,
  computeNonOverlappingPosition,
}
