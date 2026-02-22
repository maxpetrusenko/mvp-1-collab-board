# AI Command Reliability Fixes Implementation Plan

## Overview

Fix critical gaps in AI command handling based on observed failures:
1. Compound create commands ("add 1 red round sticky and 1 green triangle with words boo") fail
2. Business Model Canvas command returns nothing
3. Text content propagation issues in multi-object commands

## Current State Analysis

### Issues Identified

**Issue #1: Compound Create Parser Failure**
- Command: `add 1 red round sticky and 1 green triangle with words boo`
- Expected: 1 red circle sticky, 1 green triangle sticky with text "boo"
- Actual (per screenshot): 2 red round stickies created, wrong text "and 1 green triangle with words boo", no green triangle
- Status shown: SUCCESS (incorrectly)

**Issue #2: Business Model Canvas Returns Nothing**
- Command: `Generate a Business Model Canvas for ai chat bot, including example channels and revenue streams.`
- Expected: 9 stickies arranged in BMC layout
- Actual: No response, no objects created
- Note: Tests show BMC deterministic path exists, but something is blocking execution

### Key Discoveries

**Hybrid Architecture**:
- `runCommandPlan` has 3 paths:
  1. Business Model Canvas deterministic path (`parseBusinessModelCanvasCommand`)
  2. Compound sticky fallback (`parseCompoundStickyCreateOperations`)
  3. LLM-first execution (`executeViaLLM`)

**Parser Test Passes**:
- `command-parser.test.js:47-58` test for exact same command PASSES
- `requirements-ai-command-capabilities.test.js:394-434` (AI-CMDS-014) test PASSES
- This suggests: unit tests work but production runtime differs

**Possible Root Causes**:
1. Command normalization differences between test and production
2. Case sensitivity issue in shape/color detection
3. Segment validation rejects valid segments
4. BMC command not reaching deterministic path (routed elsewhere first)

## Desired End State

1. Compound create commands work reliably: correct object types, colors, counts, and text
2. Business Model Canvas command creates 9-section layout
3. New E2E tests verify these specific failure scenarios
4. Success/failure status reflects actual board changes

## What We're NOT Doing

- Adding new AI capabilities beyond fixing broken ones
- Changing LLM provider fallback behavior
- Modifying existing test infrastructure
- Re-architecting the command routing system

## Implementation Approach

**Debug Phase**: Identify actual root cause via targeted logging
**Fix Phase**: Apply minimal fixes to identified issues
**Test Phase**: Add regression E2E tests for observed failures

## Phase 1: Add Diagnostic Logging

### Overview
Inject logging to trace actual command execution path in production

### Changes Required:

#### 1. `functions/index.js` - runCommandPlan logging
**File**: `functions/index.js`
**Changes**: Add logging to each decision branch

```javascript
const runCommandPlan = async (ctx, command) => {
  const normalizedCommand = normalizeCommandForPlan(command)
  console.log('[PLAN] Input command:', command)
  console.log('[PLAN] Normalized:', normalizedCommand)

  // BMC path
  const bmcCommand = parseBusinessModelCanvasCommand(normalizedCommand)
  console.log('[PLAN] BMC parsed:', bmcCommand ? 'YES' : 'NO')
  if (bmcCommand) {
    // ...
  }

  // Compound fallback
  const operations = parseCompoundStickyCreateOperations(normalizedCommand)
  console.log('[PLAN] Compound operations count:', operations.length)
  if (operations.length > 0) {
    console.log('[PLAN] Compound operations:', JSON.stringify(operations))
    // ...
  }

  // LLM path
  console.log('[PLAN] Routing to LLM-first path')
  // ...
}
```

#### 2. `functions/index.js` - parseCompoundStickyCreateOperations logging
**File**: `functions/index.js`
**Changes**: Log segment parsing details

```javascript
const parseCompoundStickyCreateOperations = (command) => {
  const normalized = normalizeStickyVocabulary(normalizeCommand(command))
  console.log('[COMPOUND] Input:', normalized)
  console.log('[COMPOUND] Has verb:', new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized))
  console.log('[COMPOUND] Has "and":', /\band\b/i.test(normalized))

  const verbStripped = stripLeadingCreateInstruction(normalized)
  console.log('[COMPOUND] Verb stripped:', verbStripped)

  const segments = verbStripped.split(/\s+\band\b\s+/i).map((segment) => segment.trim()).filter(Boolean)
  console.log('[COMPOUND] Segments:', segments)

  for (const segment of segments) {
    const hasStickyMarker = /\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i.test(segment)
    const hasShapeMarker = /\b(?:circle|round|diamond|rhombus|romb|triangle|rectangle|box|shape)s?\b/i.test(segment)
    console.log('[COMPOUND] Segment:', segment, 'sticky:', hasStickyMarker, 'shape:', hasShapeMarker)
    // ...
  }
  // ...
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test` passes in functions directory
- [ ] New log statements appear in Firebase Functions console

#### Manual Verification:
- [ ] Run compound command and observe logs in Firebase console
- [ ] Run BMC command and observe logs in Firebase console
- [ ] Identify actual execution path for failing commands

---

## Phase 2: Fix Compound Create Parser

### Overview
Apply fixes based on diagnostic logging results

### Changes Required:

#### 1. `functions/index.js` - Fix segment validation
**File**: `functions/index.js` (~line 1058-1063)
**Changes**: Ensure segments with shape markers pass validation

**Potential Issue**: The regex check for markers might be case-sensitive or too restrictive

```javascript
// Before (potential issue):
const hasStickyMarker = /\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i.test(segment)
const hasShapeMarker = /\b(?:circle|round|diamond|rhombus|romb|triangle|rectangle|box|shape)s?\b/i.test(segment)
if (!hasStickyMarker && !hasShapeMarker) {
  return []  // Reject entire command
}
```

**Fix**: Add diagnostic logging first, then adjust if needed

#### 2. `functions/index.js` - Fix text extraction for segments
**File**: `functions/index.js` (~line 1071-1074)
**Changes**: Ensure "with words X" pattern is captured

```javascript
// Check text extraction patterns
const textMatch = segment.match(/\b(?:with\s+words?|with\s+text|text\s*[:=-]|that\s+says|saying)\s+(.+)$/i)
const extractedText = sanitizeText(stripWrappingQuotes(textMatch?.[1] || ''))
console.log('[COMPOUND] Text match:', textMatch?.[1], 'Extracted:', extractedText)
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- test/command-parser.test.js` passes
- [ ] `npm test -- test/requirements-ai-command-capabilities.test.js` passes

#### Manual Verification:
- [ ] Command "add 1 red round sticky and 1 green triangle with words boo" creates exactly 2 stickies
- [ ] First sticky: red circle shape
- [ ] Second sticky: green triangle shape with text "boo"

---

## Phase 3: Fix Business Model Canvas Routing

### Overview
Ensure BMC command reaches deterministic path instead of failing

### Changes Required:

#### 1. `functions/index.js` - Verify parseBusinessModelCanvasCommand
**File**: `functions/index.js`
**Changes**: Check BMC parser regex patterns

**Potential Issue**: Command might not match BMC pattern due to casing or wording

```javascript
// Check if parseBusinessModelCanvasCommand is working
const parseBusinessModelCanvasCommand = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  const pattern = /\bbusiness\s+model\s+canvas\b/
  console.log('[BMC] Checking:', lower)
  console.log('[BMC] Pattern match:', pattern.test(lower))
  // ...
}
```

#### 2. Ensure BMC path is checked BEFORE compound fallback
**File**: `functions/index.js` (~line 2332)
**Changes**: Verify order in `runCommandPlan`

**Current order is correct**:
1. BMC check
2. Compound fallback
3. LLM path

### Success Criteria:

#### Automated Verification:
- [ ] `npm test -- test/command-parser.test.js` passes (BMC test exists)
- [ ] `npm test -- test/requirements-ai-command-capabilities.test.js` passes (AI-CMDS-017)

#### Manual Verification:
- [ ] Command "Generate a Business Model Canvas for ai chat bot" creates 9 stickies
- [ ] Stickies arranged in 3x3 grid
- [ ] Each section has correct title and content

---

## Phase 4: Add E2E Regression Tests

### Overview
Add Playwright E2E tests for the specific failure scenarios

### Changes Required:

#### 1. `app/e2e/ai-command-regression.spec.ts` - New test file
**File**: `app/e2e/ai-command-regression.spec.ts`
**Changes**: Add new E2E test file

```typescript
import { test, expect } from './fixtures'

test.describe('AI Command Regression Tests', () => {
  test('compound create: red circle and green triangle with text', async ({ boardPage }) => {
    await boardPage.goto()
    await boardPage.aiCommand('add 1 red round sticky and 1 green triangle with words boo')

    // Wait for objects to sync
    await boardPage.waitForObjectsCount(2)

    const objects = await boardPage.getObjects()
    expect(objects.length).toBe(2)

    const redCircle = objects.find(o =>
      o.color === '#fca5a5' && o.shapeType === 'circle'
    )
    expect(redCircle).toBeDefined()

    const greenTriangle = objects.find(o =>
      o.color === '#86efac' && o.shapeType === 'triangle'
    )
    expect(greenTriangle).toBeDefined()
    expect(greenTriangle.text).toContain('boo')
  })

  test('business model canvas: creates 9-section layout', async ({ boardPage }) => {
    await boardPage.goto()
    await boardPage.aiCommand('Generate a Business Model Canvas for ai chat bot')

    await boardPage.waitForObjectsCount(9)

    const objects = await boardPage.getObjects()
    expect(objects.length).toBe(9)

    const titles = [
      'Key Partners', 'Key Activities', 'Key Resources',
      'Value Propositions', 'Customer Relationships', 'Channels',
      'Customer Segments', 'Cost Structure', 'Revenue Streams'
    ]

    for (const title of titles) {
      const hasSection = objects.some(o => o.text?.includes(title))
      expect(hasSection, `Missing section: ${title}`).toBe(true)
    }
  })

  test('compound create: multiple counts with colors', async ({ boardPage }) => {
    await boardPage.goto()
    await boardPage.aiCommand('add 2 blue sticky notes and 1 red sticky note saying risk')

    await boardPage.waitForObjectsCount(3)

    const objects = await boardPage.getObjects()
    expect(objects.length).toBe(3)

    const blueStickies = objects.filter(o => o.color === '#93c5fd')
    expect(blueStickies.length).toBe(2)

    const redSticky = objects.find(o => o.color === '#fca5a5')
    expect(redSticky).toBeDefined()
    expect(redSticky.text).toContain('risk')
  })
})
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:e2e` passes with new tests
- [ ] Tests run in CI without flakiness

#### Manual Verification:
- [ ] Run E2E tests locally and observe visual execution
- [ ] All 3 new regression tests pass consistently

---

## Testing Strategy

### Unit Tests:
- Existing tests already cover parser functions
- Add targeted tests if new parsing logic is added

### Integration Tests:
- Firebase Functions emulator for local testing
- Mock LLM responses for deterministic testing

### Manual Testing Steps:
1. Deploy Functions with diagnostic logging
2. Open Firebase console → Functions logs
3. Run failing commands in app
4. Trace execution path through logs
5. Apply fixes based on findings
6. Re-deploy and verify

## Performance Considerations

- Logging adds minimal overhead (<5ms per command)
- E2E tests add ~2 minutes to CI suite
- No changes to hot-path code execution

## Migration Notes

- No database migrations needed
- No breaking changes to API
- Existing commands unaffected

## References

- Original issue: Screenshot showing command failure
- Existing BMC test: `functions/test/requirements-ai-command-capabilities.test.js:193-225` (AI-CMDS-017)
- Existing compound test: `functions/test/command-parser.test.js:47-58`
- Hybrid architecture: `functions/index.js:2332` (`runCommandPlan`)
