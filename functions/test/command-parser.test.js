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
