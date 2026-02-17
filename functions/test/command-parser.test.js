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
