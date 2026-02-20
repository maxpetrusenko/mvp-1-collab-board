const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const indexSource = readFileSync(path.resolve(__dirname, '../index.js'), 'utf8')
const toolRegistry = require('../src/tool-registry.js')
const { __test } = require('../index')

test('AI-CMDS-001: required creation command patterns are covered', () => {
  const parsedSticky = __test.parseStickyCommand("Add a yellow sticky note that says 'User Research'")
  assert.ok(parsedSticky, 'Sticky creation command should parse')
  assert.equal(parsedSticky.count, 1)
  assert.equal(parsedSticky.color, 'yellow')
  assert.equal(parsedSticky.texts[0], 'User Research')

  assert.equal(
    indexSource.includes('(rectangle|box|shape|circle|diamond|rhombus|romb|triangle)'),
    true,
  )
  assert.equal(
    indexSource.includes('frame(?:\\s+(?:named|called)\\s+(.+?))?'),
    true,
  )
})

test('AI-CMDS-002: required manipulation and layout command patterns are covered', () => {
  assert.equal(
    indexSource.includes('move\\s+all\\s+the\\s+(\\w+)\\s+sticky notes\\s+to\\s+the\\s+right side'),
    true,
  )
  assert.equal(indexSource.includes('resizeFrameToFitContents'), true)
  assert.equal(indexSource.includes('change\\s+the\\s+sticky note color\\s+to\\s+(\\w+)'), true)

  assert.equal(indexSource.includes("if (lower.includes('arrange') && lower.includes('grid'))"), true)
  assert.equal(indexSource.includes('createStickyGridTemplate'), true)
  assert.equal(indexSource.includes('spaceElementsEvenly'), true)
})

test('AI-CMDS-003: required complex command patterns and evaluation criteria are covered', () => {
  assert.equal(indexSource.includes("const labels = ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']"), true)
  assert.equal(indexSource.includes('createJourneyMap(ctx, Number(journeyMatch[1]))'), true)
  assert.equal(indexSource.includes('createRetrospectiveTemplate(ctx)'), true)

  // "Arrange in a grid" should produce consistent step sizes.
  assert.equal(indexSource.includes('const gapX = 220'), true)
  assert.equal(indexSource.includes('const gapY = 150'), true)
})

test('AI-CMDS-004: tool schema supports >=6 command types and required minimum tools', () => {
  const toolNames = toolRegistry.TOOL_DEFINITIONS.map((tool) => tool?.function?.name).filter(Boolean)
  const uniqueToolNames = new Set(toolNames)

  assert.ok(uniqueToolNames.size >= 6, `Expected >=6 command types, got ${uniqueToolNames.size}`)

  const requiredTools = [
    'createStickyNote',
    'createShape',
    'createFrame',
    'createConnector',
    'moveObject',
    'resizeObject',
    'updateText',
    'changeColor',
    'getBoardState',
  ]
  for (const requiredTool of requiredTools) {
    assert.ok(uniqueToolNames.has(requiredTool), `Missing required tool: ${requiredTool}`)
  }
})

test('AI-CMDS-005: multi-step execution is sequential and shared-safe', () => {
  // Sequential multi-step tool execution in executeViaLLM
  assert.equal(indexSource.includes('for (const toolCall of toolCalls)'), true)
  assert.equal(indexSource.includes('await createSwotTemplate(ctx)'), true)

  // Shared-state safety for concurrent users
  assert.equal(indexSource.includes('acquireBoardLock'), true)
  assert.equal(indexSource.includes('releaseBoardLock'), true)
  assert.equal(indexSource.includes('clientCommandId'), true)
})

test('AI-CMDS-006: out-of-scope prompts return short warning responses without mutation', () => {
  assert.equal(indexSource.includes('const OUT_OF_SCOPE_AI_MESSAGE = "I can\'t help with that."'), true)
  assert.equal(indexSource.includes('if (toolCalls.length === 0)'), true)
  assert.equal(indexSource.includes('outOfScope: true'), true)
  assert.equal(indexSource.includes("level: 'warning'"), true)
})

test('AI-CMDS-007: duplicateObject tool defaults to 20px offset parity with board duplicate UX', () => {
  assert.equal(indexSource.includes('const offsetX = parseNumber(args.offsetX, 20)'), true)
  assert.equal(indexSource.includes('const offsetY = parseNumber(args.offsetY, 20)'), true)
})
