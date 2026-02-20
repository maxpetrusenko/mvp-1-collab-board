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

  it('FR-17 shape enums exclude line shape while connector style still supports line', () => {
    const toolRegistry = require('../src/tool-registry.js')
    const createStickyTool = toolRegistry.TOOL_DEFINITIONS.find(
      (tool) => tool?.function?.name === 'createStickyNote',
    )
    const createShapeTool = toolRegistry.TOOL_DEFINITIONS.find(
      (tool) => tool?.function?.name === 'createShape',
    )
    const createConnectorTool = toolRegistry.TOOL_DEFINITIONS.find(
      (tool) => tool?.function?.name === 'createConnector',
    )

    const stickyShapeEnum = createStickyTool?.function?.parameters?.properties?.shapeType?.enum || []
    const shapeTypeEnum = createShapeTool?.function?.parameters?.properties?.type?.enum || []
    const connectorStyleEnum =
      createConnectorTool?.function?.parameters?.properties?.style?.enum || []

    assert.ok(!stickyShapeEnum.includes('line'), 'createStickyNote.shapeType enum should not include line')
    assert.ok(!shapeTypeEnum.includes('line'), 'createShape.type enum should not include line')
    assert.ok(connectorStyleEnum.includes('line'), 'createConnector.style enum should still include line')
  })
})
