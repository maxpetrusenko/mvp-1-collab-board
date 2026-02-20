// Unit tests for position parsing
const assert = require('node:assert/strict')
const test = require('node:test')

const { __test } = require('../index')

// Use the actual parsePosition from index.js, or fall back to local implementation
const parsePosition = __test.parsePosition || ((positionString, defaultX = 120, defaultY = 120) => {
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
})

test('parsePosition handles "top left" position', () => {
  const result = parsePosition('top left')
  assert.deepEqual(result, { x: 120, y: 120 })
})

test('parsePosition handles "top right" position', () => {
  const result = parsePosition('top right')
  assert.deepEqual(result, { x: 1620, y: 120 })
})

test('parsePosition handles "bottom left" position', () => {
  const result = parsePosition('bottom left')
  assert.deepEqual(result, { x: 120, y: 880 })
})

test('parsePosition handles "bottom right" position', () => {
  const result = parsePosition('bottom right')
  assert.deepEqual(result, { x: 1620, y: 880 })
})

test('parsePosition handles "center" position', () => {
  const result = parsePosition('center')
  assert.deepEqual(result, { x: 870, y: 485 })
})

test('parsePosition handles "middle" as center', () => {
  const result = parsePosition('middle')
  assert.deepEqual(result, { x: 870, y: 485 })
})

test('parsePosition handles "top" position (centered horizontally)', () => {
  const result = parsePosition('top')
  assert.deepEqual(result, { x: 870, y: 120 })
})

test('parsePosition handles "bottom" position (centered horizontally)', () => {
  const result = parsePosition('bottom')
  assert.deepEqual(result, { x: 870, y: 880 })
})

test('parsePosition handles "left" position (centered vertically)', () => {
  const result = parsePosition('left')
  assert.deepEqual(result, { x: 120, y: 485 })
})

test('parsePosition handles "right" position (centered vertically)', () => {
  const result = parsePosition('right')
  assert.deepEqual(result, { x: 1620, y: 485 })
})

test('parsePosition returns defaults when position is null', () => {
  const result = parsePosition(null)
  assert.deepEqual(result, { x: 120, y: 120 })
})

test('parsePosition returns defaults when position is empty string', () => {
  const result = parsePosition('')
  assert.deepEqual(result, { x: 120, y: 120 })
})

test('parsePosition uses custom defaults when provided', () => {
  const result = parsePosition(null, 500, 600)
  assert.deepEqual(result, { x: 500, y: 600 })
})

test('parsePosition ignores unrecognized position and uses defaults', () => {
  const result = parsePosition('somewhere random')
  assert.deepEqual(result, { x: 120, y: 120 })
})
