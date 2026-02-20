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

test('sanitizeAiAssistantResponse caps assistant responses to sticky-safe length', () => {
  const response = __test.sanitizeAiAssistantResponse('a'.repeat(450))
  assert.equal(response.length, 300)
})
