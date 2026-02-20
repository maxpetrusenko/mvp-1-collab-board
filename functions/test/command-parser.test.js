const assert = require('node:assert/strict')
const test = require('node:test')

const { __test } = require('../index')

test('normalizeCommandForPlan normalizes UK spellings for planner matching', () => {
  const normalized = __test.normalizeCommandForPlan('  organise   by   colour  ')
  assert.equal(normalized, 'organize by color')
})

test('isOrganizeByColorCommand recognizes color-grouping intents', () => {
  const variants = ['organize by color', 'group notes by color', 'sort everything by color']
  for (const command of variants) {
    assert.equal(__test.isOrganizeByColorCommand(command), true)
  }
})

test('isOrganizeByColorCommand ignores non-color organize commands', () => {
  const unrelated = ['organize this board into groups', 'arrange in grid', 'summarize all stickies']
  for (const command of unrelated) {
    assert.equal(__test.isOrganizeByColorCommand(command), false)
  }
})

test('parseStickyCommand supports multi-sticky circle requests with explicit labels', () => {
  const parsed = __test.parseStickyCommand(
    'create two stickers with circle form one say 1 another says 2',
  )

  assert.ok(parsed)
  assert.equal(parsed.count, 2)
  assert.equal(parsed.shapeType, 'circle')
  assert.deepEqual(parsed.texts, ['1', '2'])
})

test('parseStickyCommand keeps single-sticky text requests as one item', () => {
  const parsed = __test.parseStickyCommand('add hello world sticker')

  assert.ok(parsed)
  assert.equal(parsed.count, 1)
  assert.equal(parsed.shapeType, 'rectangle')
  assert.deepEqual(parsed.texts, ['hello world'])
})

test('parseStickyCommand preserves color when count prefix is numeric', () => {
  const parsed = __test.parseStickyCommand('add 1 red sticky note')

  assert.ok(parsed)
  assert.equal(parsed.count, 1)
  assert.equal(parsed.color, 'red')
  assert.deepEqual(parsed.texts, ['New sticky note'])
})

test('parseStickyCommand preserves count and color for multi-sticky requests', () => {
  const parsed = __test.parseStickyCommand('create two red sticky notes')

  assert.ok(parsed)
  assert.equal(parsed.count, 2)
  assert.equal(parsed.color, 'red')
  assert.deepEqual(parsed.texts, ['Note 1', 'Note 2'])
})

test('parseStickyCommand supports stickies plural phrasing with count and reason-list text', () => {
  const parsed = __test.parseStickyCommand('add 10 stickies that list the reasons why my husband is awesome')

  assert.ok(parsed)
  assert.equal(parsed.count, 10)
  assert.equal(parsed.texts.length, 10)
  assert.equal(parsed.texts[0], 'Reason 1: my husband is awesome')
  assert.equal(parsed.texts[9], 'Reason 10: my husband is awesome')
})

test('parseStickyCommand supports common sticky typo variants', () => {
  const parsed = __test.parseStickyCommand('add 10 sticikies that list the reasons why my husband is awesome')

  assert.ok(parsed)
  assert.equal(parsed.count, 10)
  assert.equal(parsed.texts.length, 10)
  assert.equal(parsed.texts[0], 'Reason 1: my husband is awesome')
})

test('parseStickyCommand keeps position with numbered color requests', () => {
  const parsed = __test.parseStickyCommand('create 2 red sticky notes at top right')

  assert.ok(parsed)
  assert.equal(parsed.count, 2)
  assert.equal(parsed.color, 'red')
  assert.equal(parsed.position, 'top right')
})

test('parseStickyCommand supports color+text instruction phrasing for circle sticky commands', () => {
  const parsed = __test.parseStickyCommand('add round sticky note with green color and text: yo yo yo')

  assert.ok(parsed)
  assert.equal(parsed.count, 1)
  assert.equal(parsed.shapeType, 'circle')
  assert.equal(parsed.color, 'green')
  assert.deepEqual(parsed.texts, ['yo yo yo'])
})

test('parseStickyCommand supports color instruction without forcing helper text into sticky body', () => {
  const parsed = __test.parseStickyCommand('add sticky note with green color')

  assert.ok(parsed)
  assert.equal(parsed.count, 1)
  assert.equal(parsed.color, 'green')
  assert.deepEqual(parsed.texts, ['New sticky note'])
})

test('sanitizeAiAssistantResponse trims and normalizes model text responses', () => {
  const response = __test.sanitizeAiAssistantResponse('  2 +   2    is 4  ')
  assert.equal(response, '2 + 2 is 4')
})

test('getAutoStickyPosition advances grid slots to avoid overlap for default placement', () => {
  const pos1 = __test.getAutoStickyPosition([])
  const pos2 = __test.getAutoStickyPosition([{ type: 'stickyNote', position: pos1 }])
  const pos3 = __test.getAutoStickyPosition([
    { type: 'stickyNote', position: pos1 },
    { type: 'stickyNote', position: pos2 },
  ])

  assert.notDeepEqual(pos1, pos2)
  assert.notDeepEqual(pos2, pos3)
})

test('normalizeAiPlacementHint keeps finite pointer/viewport placement fields', () => {
  const placement = __test.normalizeAiPlacementHint({
    pointer: { x: 420, y: 260 },
    viewportCenter: { x: 400, y: 240 },
    viewport: { x: 200, y: 120, width: 500, height: 300 },
  })

  assert.ok(placement)
  assert.deepEqual(placement?.pointer, { x: 420, y: 260 })
  assert.deepEqual(placement?.anchor, { x: 420, y: 260 })
  assert.deepEqual(placement?.viewportCenter, { x: 400, y: 240 })
  assert.deepEqual(placement?.viewport, { x: 200, y: 120, width: 500, height: 300 })
})

test('getStickyBatchLayoutPositions centers multi-sticky layout around anchor', () => {
  const positions = __test.getStickyBatchLayoutPositions({
    count: 10,
    anchor: { x: 1000, y: 700 },
    shapeType: 'rectangle',
  })

  assert.equal(positions.length, 10)
  const avgX = positions.reduce((sum, pos) => sum + pos.x + 90, 0) / positions.length
  const avgY = positions.reduce((sum, pos) => sum + pos.y + 55, 0) / positions.length
  assert.ok(Math.abs(avgX - 1000) < 5)
  assert.ok(Math.abs(avgY - 700) < 5)
})

test('sanitizeAiAssistantResponse caps assistant responses to sticky-safe length', () => {
  const response = __test.sanitizeAiAssistantResponse('a'.repeat(450))
  assert.equal(response.length, 300)
})
