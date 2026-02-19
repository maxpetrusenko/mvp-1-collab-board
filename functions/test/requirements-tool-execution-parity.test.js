/* eslint-disable no-console */
const { describe, it } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const indexSource = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

describe('Requirements: AI tool execution parity', () => {
  it('FR-18 routes each required tool through executeViaLLM switch', () => {
    const requiredToolCases = [
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

    for (const toolName of requiredToolCases) {
      assert.match(
        indexSource,
        new RegExp(`case ['"]${toolName}['"]:`),
        `Missing executeViaLLM tool case: ${toolName}`,
      )
    }
  })
})
