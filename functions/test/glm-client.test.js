/* eslint-disable no-console */
const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('GLM Tool Registry', () => {
  it('exports TOOL_DEFINITIONS array', () => {
    const toolRegistry = require('../src/tool-registry.js')
    assert(Array.isArray(toolRegistry.TOOL_DEFINITIONS))
    assert.ok(toolRegistry.TOOL_DEFINITIONS.length > 0)
  })

  it('each tool has required fields', () => {
    const toolRegistry = require('../src/tool-registry.js')
    for (const tool of toolRegistry.TOOL_DEFINITIONS) {
      assert.ok(tool.type, 'Tool must have type')
      assert.ok(tool.function, 'Tool must have function property')
      assert.ok(tool.function.name, 'Tool function must have name')
      assert.ok(tool.function.description, 'Tool function must have description')
      assert.ok(tool.function.parameters, 'Tool function must have parameters')
    }
  })

  it('createStickyNote tool has correct schema', () => {
    const toolRegistry = require('../src/tool-registry.js')
    const stickyTool = toolRegistry.TOOL_DEFINITIONS.find(
      t => t.function.name === 'createStickyNote'
    )
    assert.ok(stickyTool, 'createStickyNote tool must exist')
    assert.equal(stickyTool.function.parameters.required.length, 1)
    assert.ok(stickyTool.function.parameters.properties.text)
  })

  it('exports buildSystemPrompt function', () => {
    const toolRegistry = require('../src/tool-registry.js')
    assert.equal(typeof toolRegistry.buildSystemPrompt, 'function')
  })

  it('buildSystemPrompt includes board context', () => {
    const toolRegistry = require('../src/tool-registry.js')
    const prompt = toolRegistry.buildSystemPrompt({
      state: [
        { type: 'stickyNote' },
        { type: 'shape' },
        { type: 'stickyNote' }
      ]
    })
    assert.ok(prompt.includes('Sticky notes: 2'))
    assert.ok(prompt.includes('Shapes: 1'))
  })

  it('exports COLOR_OPTIONS array', () => {
    const toolRegistry = require('../src/tool-registry.js')
    assert(Array.isArray(toolRegistry.COLOR_OPTIONS))
    assert.ok(toolRegistry.COLOR_OPTIONS.includes('yellow'))
    assert.ok(toolRegistry.COLOR_OPTIONS.includes('blue'))
  })

  it('exports SHAPE_TYPES array', () => {
    const toolRegistry = require('../src/tool-registry.js')
    assert(Array.isArray(toolRegistry.SHAPE_TYPES))
    assert.ok(toolRegistry.SHAPE_TYPES.includes('rectangle'))
    assert.ok(toolRegistry.SHAPE_TYPES.includes('circle'))
  })
})
