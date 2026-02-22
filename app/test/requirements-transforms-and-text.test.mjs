import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageSource = readBoardPageSource()

test('FR-8: standalone text objects are supported in board object creation and UI', () => {
  assert.match(
    boardPageSource,
    /objectType:\s*'stickyNote'\s*\|\s*'shape'\s*\|\s*'frame'\s*\|\s*'connector'\s*\|\s*'text'/,
    'Expected createObject union to include text',
  )
  assert.match(boardPageSource, /data-testid="add-text-button"/, 'Expected Add text toolbar action')
  assert.match(boardPageSource, /data-testid="text-create-popover"/, 'Expected text creation popover')
  assert.match(boardPageSource, /data-testid="text-create-input"/, 'Expected arbitrary text input for text creation')
  assert.match(boardPageSource, /if\s*\(boardObject\.type\s*===\s*'text'\)/, 'Expected dedicated text render branch')
  assert.match(
    boardPageSource,
    /const textColor =[\s\S]*boardObject\.color[\s\S]*defaultTextColor/s,
    'Expected text renderer to use persisted text object color with theme fallback',
  )
})

test('Transforms: rotate controls are available and wired to persisted rotation patches', () => {
  // Keyboard rotation
  assert.match(
    boardPageSource,
    /const rotateSelectionBy = useCallback\(/,
    'Expected rotateSelectionBy callback',
  )
  assert.match(
    boardPageSource,
    /keyLower === 'r' && selectedIds\.length > 0/,
    'Expected keyboard rotate shortcut handler',
  )
  assert.match(
    boardPageSource,
    /{ rotation: nextRotation }/,
    'Expected persisted rotation patch writes',
  )

  // Drag-to-rotate handle (Miro-style)
  assert.match(
    boardPageSource,
    /data-testid={`rotation-handle-\${boardObject\.id}`}/,
    'Expected rotation handle data-testid attribute',
  )
  assert.match(
    boardPageSource,
    /cursor="grab"/,
    'Expected rotation handle to have grab cursor',
  )
  assert.match(
    boardPageSource,
    /const \[rotatingObjectId, setRotatingObjectId\]/,
    'Expected rotatingObjectId state for tracking drag rotation',
  )
  assert.match(
    boardPageSource,
    /const \[localObjectRotations, setLocalObjectRotations\]/,
    'Expected localObjectRotations state for live rotation preview',
  )
  assert.match(
    boardPageSource,
    /(export\s+)?const calculateRotationAngle = \(\s*centerX: number,\s*centerY: number,\s*mouseX: number,\s*mouseY: number,\s*\) =>/,
    'Expected shared rotation angle helper',
  )
  assert.match(
    boardPageSource,
    /Math\.atan2\(mouseY - centerY, mouseX - centerX\)/,
    'Expected rotation to use atan2 for angle calculation',
  )
  assert.match(
    boardPageSource,
    /normalizeRotationDegrees\(degrees \+ 90\)/,
    'Expected rotation to be normalized with handle offset adjustment',
  )
  assert.match(
    boardPageSource,
    /calculateRotationFromHandleTarget\(event\.target,/,
    'Expected drag rotation to derive angle from handle drag position',
  )
  assert.match(
    boardPageSource,
    /localObjectRotationsRef\.current\[boardObject\.id\]/,
    'Expected drag rotation to use ref-backed fallback when persisting',
  )
})

test('Connectors: style options support arrow and line rendering', () => {
  assert.match(boardPageSource, /data-testid="new-connector-style-picker"/, 'Expected connector create style picker')
  assert.match(
    boardPageSource,
    /data-testid="connector-style-picker"/,
    'Expected connector style picker for selected connectors',
  )
  assert.match(
    boardPageSource,
    /options\?\.color && CONNECTOR_COLOR_OPTIONS\.includes\(options\.color\)/,
    'Expected connector creation to persist selected connector color',
  )
  assert.match(
    boardPageSource,
    /connectorStyle === 'arrow'/,
    'Expected conditional connector render path by style',
  )
  assert.match(
    boardPageSource,
    /<Line[\s\S]*connectorGeometry\.start\.x[\s\S]*connectorGeometry\.end\.y/s,
    'Expected line connector rendering branch',
  )
  assert.match(
    boardPageSource,
    /const connectorOutlineColor =\s*themeMode === 'dark' \? 'rgba\(248, 250, 252, 0\.72\)' : 'rgba\(15, 23, 42, 0\.24\)'/,
    'Expected connector renderer to define a dark-mode-friendly outline/halo color',
  )
  assert.match(
    boardPageSource,
    /themeMode === 'dark' && rawConnectorColor === '#0f172a'\s*\?\s*connectorDefaultColor/,
    'Expected dark-mode connector rendering to avoid near-invisible charcoal strokes',
  )
})

test('Connectors: linked endpoints resolve from attached object anchors and mindmap template writes bindings', () => {
  assert.match(
    boardPageSource,
    /connectorStart\?: Point[\s\S]*connectorEnd\?: Point[\s\S]*fromObjectId\?: string \| null[\s\S]*toObjectId\?: string \| null/s,
    'Expected connector creation options to support explicit endpoint bindings',
  )
  assert.match(
    boardPageSource,
    /const fromObject =[\s\S]*boardObject\.fromObjectId[\s\S]*const start =[\s\S]*getAnchorPointForObject\(fromObject, fromAnchor\)/s,
    'Expected connector bounds to resolve start anchor from linked object',
  )
  assert.match(
    boardPageSource,
    /inferConnectorAnchorsBetweenObjects\(fromObject, toObject\)/,
    'Expected connector rendering to infer side anchors for linked objects when anchors are missing/center',
  )
  assert.match(
    boardPageSource,
    /explicitFromAnchor && explicitFromAnchor !== 'center'/,
    'Expected connector rendering to override center anchors with inferred side anchors',
  )
  assert.match(
    boardPageSource,
    /const toObject =[\s\S]*boardObject\.toObjectId[\s\S]*const end =[\s\S]*getAnchorPointForObject\(toObject, toAnchor\)/s,
    'Expected connector bounds to resolve end anchor from linked object',
  )
  assert.match(
    boardPageSource,
    /fromObjectId: centralTopic\.id[\s\S]*toObjectId: branchShape\.id[\s\S]*fromAnchor[\s\S]*toAnchor/s,
    'Expected mindmap template connector creation to persist object bindings',
  )
})

test('Shapes: create popover exposes shape type and color options', () => {
  assert.match(boardPageSource, /data-testid="add-shape-button"/, 'Expected shape toolbar launcher button')
  assert.match(boardPageSource, /data-testid="shape-create-popover"/, 'Expected shape creation popover')
  assert.match(boardPageSource, /data-testid="shape-create-shape-picker"/, 'Expected shape type picker in popover')
  assert.match(boardPageSource, /data-testid="shape-create-color-picker"/, 'Expected shape color picker in popover')
})
