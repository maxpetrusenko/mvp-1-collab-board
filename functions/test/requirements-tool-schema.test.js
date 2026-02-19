/* eslint-disable no-console */
const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('Requirements: AI tool schema completeness', () => {
  it('FR-17 exposes all required tool names in TOOL_DEFINITIONS', () => {
    const toolRegistry = require('../src/tool-registry.js')
    const names = new Set(toolRegistry.TOOL_DEFINITIONS.map((tool) => tool?.function?.name))
    const requiredToolNames = [
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

    for (const requiredName of requiredToolNames) {
      assert.ok(names.has(requiredName), `Missing required tool definition: ${requiredName}`)
    }
  })
})
