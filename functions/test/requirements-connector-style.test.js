/* eslint-disable no-console */
const { describe, it } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const path = require('node:path')

describe('Requirements: connector style support', () => {
  it('AI tool schema exposes createConnector style enum', () => {
    const { TOOL_DEFINITIONS } = require('../src/tool-registry.js')
    const connectorTool = TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'createConnector')
    assert.ok(connectorTool, 'createConnector tool definition missing')
    const styleSchema = connectorTool.function?.parameters?.properties?.style
    assert.ok(styleSchema, 'createConnector.style schema missing')
    assert.deepStrictEqual(styleSchema.enum, ['arrow', 'line'])
  })

  it('backend createConnector persists connector style', () => {
    const indexSource = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    assert.match(
      indexSource,
      /const style = normalizeConnectorStyle\(args\.style\)/,
      'createConnector should normalize incoming style',
    )
    assert.match(indexSource, /style,\s*\n\s*start,/, 'createConnector payload should include style')
  })
})
