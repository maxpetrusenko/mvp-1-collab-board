# Implementation Plan: MAX-45 AI Bulk Operations (v2 - Revised)

## Executive Summary

**Scope Reduction:** Phase 4 (shape composition/grouping) moved to separate ticket. Focus on reliable bulk create/color/delete operations.

**Key Changes from v1:**
1. Remove `createObjects(objects[])` - too fragile for LLM tool parsing
2. Use **command pattern** with count-based generation (like `tryApplyFramesWithStickiesFallback`)
3. Chunk **all** Firestore batch operations at 400
4. Work **within** existing type system (no new `group` type)
5. Leverage existing fallback patterns (`tryApplyBulkColorMutationFallback`, `tryApplyBulkDeleteFallback`)

**Architecture Principle:** Server-side intent parsing with LLM-tool-call fallback, not LLM-tool-call primary.

---

## Problem Analysis

### Current State (Working Patterns)

| Pattern | Location | Status |
|---------|----------|--------|
| Bulk color mutation | `tryApplyBulkColorMutationFallback` (line 946) | Works - iterates `changeColor` |
| Bulk delete | `tryApplyBulkDeleteFallback` (line 1097) | Works - iterates `deleteObject` |
| Frame+stickies | `tryApplyFramesWithStickiesFallback` (line 2526) | Works - grid layout + batch |

### Why v1 Would Fail

| Issue | v1 Flaw | v2 Fix |
|-------|---------|--------|
| #1 | Schema promises stickyNote/shape/frame, handler only does stickies | Server-side generates, no schema承诺 |
| #2 | Unbounded batch commit | Chunk at 400 always |
| #3 | Large objects[] payload fails parse | Use count + template params |
| #4 | New `group` type breaks frontend | Remove from scope |
| #5 | Template enum mismatch | Remove templates |
| #6 | existingBounds unused | Compute actual bounds from ctx.state |
| #7 | Color mapping misalignment | Direct 1:1 mapping |
| #8 | Timeout already 30s | Remove timeout changes |
| #9 | More regex routing | Use existing fallback pattern |

---

## Phase 1: Server-Side Bulk Create (Command Pattern)

### 1.1 New File: `functions/src/bulk-create-fallback.js`

**Pattern:** Parse intent server-side, generate objects, commit in chunks.

```javascript
const GRID_SPACING_X = 200
const GRID_SPACING_Y = 150
const BULK_CREATE_CHUNK_SIZE = 400

function parseBulkCreateIntent(command) {
  const normalized = normalizeCommand(command).toLowerCase()
  const tokens = tokenizeCommandWords(normalized)

  // "create 100 stickies", "add 50 yellow notes"
  const countToken = tokens.find(t => parseStickyCountToken(t) !== null)
  const count = countToken ? parseStickyCountToken(countToken) : null

  if (!count || count < 2) return null  // Only bulk operations

  const color = tokens.find(t => isKnownColor(t)) || null
  const hasStickyKeyword = tokens.some(t => ['sticky', 'stickies', 'note', 'notes'].includes(t))
  const hasShapeKeyword = tokens.some(t => ['shape', 'shapes', 'circle', 'rectangle'].includes(t))

  let objectType = 'stickyNote'
  if (hasShapeKeyword && !hasStickyKeyword) objectType = 'shape'

  return { count, objectType, color }
}

function computeNonOverlappingPosition(index, count, anchor, existingBounds) {
  const cols = Math.ceil(Math.sqrt(count))
  const row = Math.floor(index / cols)
  const col = index % cols

  const x = anchor.x + col * GRID_SPACING_X
  const y = anchor.y + row * GRID_SPACING_Y

  // Check for overlap with existing objects
  const spacing = 180  // sticky width + margin
  for (const bound of existingBounds) {
    if (x >= bound.x - spacing && x <= bound.x + bound.width + spacing &&
        y >= bound.y - spacing && y <= bound.y + bound.height + spacing) {
      // Shift if overlapping
      return { x: x + spacing, y: y + spacing }
    }
  }

  return { x, y }
}

function getExistingBounds(state) {
  return state.filter(Boolean).map(obj => ({
    x: obj.position?.x || 0,
    y: obj.position?.y || 0,
    width: obj.size?.width || 180,
    height: obj.size?.height || 110,
  }))
}

async function tryApplyBulkCreateFallback(ctx, command) {
  const intent = parseBulkCreateIntent(command)
  if (!intent) return null

  const anchor = resolvePlacementAnchor(ctx.commandPlacement) ||
                 resolveViewportCenterFromPlacement(ctx.commandPlacement) ||
                 { x: 640, y: 360 }

  const existingBounds = getExistingBounds(ctx.state)
  const createdObjects = []
  const baseZIndex = getNextZIndex(ctx.state)

  // Generate payloads
  for (let i = 0; i < intent.count; i++) {
    const position = computeNonOverlappingPosition(i, intent.count, anchor, existingBounds)
    existingBounds.push({ x: position.x, y: position.y, width: 180, height: 110 })

    if (intent.objectType === 'stickyNote') {
      const sticky = {
        id: crypto.randomUUID(),
        boardId: ctx.boardId,
        type: 'stickyNote',
        text: `Note ${i + 1}`,
        color: toColor(intent.color, '#fde68a'),
        position,
        size: { width: 180, height: 110 },
        zIndex: baseZIndex + i,
        createdBy: ctx.userId,
        createdAt: nowMs(),
        updatedBy: ctx.userId,
        updatedAt: nowMs(),
        version: 1,
      }
      createdObjects.push(sticky)
    } else if (intent.objectType === 'shape') {
      const shape = {
        id: crypto.randomUUID(),
        boardId: ctx.boardId,
        type: 'shape',
        shapeType: 'rectangle',
        color: toColor(intent.color, '#93c5fd'),
        position,
        size: { width: 100, height: 100 },
        zIndex: baseZIndex + i,
        createdBy: ctx.userId,
        createdAt: nowMs(),
        updatedBy: ctx.userId,
        updatedAt: nowMs(),
        version: 1,
      }
      createdObjects.push(shape)
    }
  }

  // Chunked commit
  for (let i = 0; i < createdObjects.length; i += BULK_CREATE_CHUNK_SIZE) {
    const chunk = createdObjects.slice(i, i + BULK_CREATE_CHUNK_SIZE)
    await commitObjectBatchWrites({ boardId: ctx.boardId, objects: chunk })
  }

  // Update state
  ctx.state.push(...createdObjects)

  const typeLabel = intent.objectType === 'stickyNote' ?
                    (intent.count === 1 ? 'sticky note' : 'sticky notes') :
                    (intent.count === 1 ? 'shape' : 'shapes')

  return {
    count: createdObjects.length,
    message: `Created ${createdObjects.length} ${typeLabel}.`
  }
}

module.exports = {
  tryApplyBulkCreateFallback,
  parseBulkCreateIntent,
}
```

### 1.2 Integration Point

In `functions/index.js` around line 4320 (after LLM execution fails):

```javascript
// In runCommandPlan or executeViaLLM error handling
const bulkCreateResult = await tryApplyBulkCreateFallback(ctx, normalizedCommand)
if (bulkCreateResult) {
  return {
    message: bulkCreateResult.message,
    aiResponse: bulkCreateResult.message,
    executedTools: ctx.executedTools,
  }
}
```

---

## Phase 2: Chunked Bulk Color Operations

### 2.1 Enhance Existing Pattern

The existing `tryApplyBulkColorMutationFallback` works but calls `changeColor` one-by-one. Add chunked batch version:

```javascript
// In functions/src/bulk-color-operations.js or inline in index.js

const BULK_OPERATION_CHUNK_SIZE = 400

async function changeColorsChunked(ctx, objectIds, targetColor) {
  const chunks = []
  for (let i = 0; i < objectIds.length; i += BULK_OPERATION_CHUNK_SIZE) {
    chunks.push(objectIds.slice(i, i + BULK_OPERATION_CHUNK_SIZE))
  }

  let totalChanged = 0

  for (const chunk of chunks) {
    const batch = db.batch()
    const updatedObjects = []

    for (const objectId of chunk) {
      const object = ctx.state.find(o => o.id === objectId)
      if (!object) continue

      const ref = getObjectsRef(ctx.boardId).doc(objectId)
      const patch = {
        color: toColor(targetColor, object.color),
        updatedAt: nowMs(),
        updatedBy: ctx.userId,
        version: (object.version || 0) + 1,
      }
      batch.set(ref, patch, { merge: true })
      updatedObjects.push({ id: objectId, color: patch.color })
    }

    await batch.commit()

    // Update local state
    for (const updated of updatedObjects) {
      const object = ctx.state.find(o => o.id === updated.id)
      if (object) object.color = updated.color
    }

    totalChanged += updatedObjects.length
  }

  return totalChanged
}

// Update tryApplyBulkColorMutationFallback to use chunked version
const tryApplyBulkColorMutationFallbackV2 = async (ctx, command) => {
  const intent = parseBulkColorMutationIntent(command)
  if (!intent) return null

  let targets = resolveBulkColorMutationTargets(ctx.state, intent)

  // ... existing broad type fallback logic ...

  if (targets.length === 0) return null

  const targetIds = targets.map(t => t.id)
  const changedCount = await changeColorsChunked(ctx, targetIds, intent.targetColor)

  if (changedCount === 0) return null

  // ... existing message formatting ...

  return { count: changedCount, color: toColor(intent.targetColor), message }
}
```

---

## Phase 3: Chunked Bulk Delete Operations

### 3.1 Enhance Existing Pattern

Similar chunking for delete:

```javascript
async function deleteObjectsChunked(ctx, objectIds) {
  const chunks = []
  for (let i = 0; i < objectIds.length; i += BULK_OPERATION_CHUNK_SIZE) {
    chunks.push(objectIds.slice(i, i + BULK_OPERATION_CHUNK_SIZE))
  }

  let totalDeleted = 0
  const now = nowMs()

  for (const chunk of chunks) {
    const batch = db.batch()
    const deletedIds = []

    for (const objectId of chunk) {
      const object = ctx.state.find(o => o.id === objectId)
      if (!object) continue

      const ref = getObjectsRef(ctx.boardId).doc(objectId)
      const patch = {
        deleted: true,
        deletedAt: now,
        deletedBy: ctx.userId,
        updatedAt: now,
        updatedBy: ctx.userId,
      }
      batch.set(ref, patch, { merge: true })
      deletedIds.push(objectId)
    }

    await batch.commit()

    // Remove from state (in-place mutation, not array replacement)
    for (const deletedId of deletedIds) {
      const index = ctx.state.findIndex(o => o.id === deletedId)
      if (index !== -1) ctx.state.splice(index, 1)
    }

    totalDeleted += deletedIds.length
  }

  return totalDeleted
}
```

---

## Phase 4: Fallback Chain Integration

### 4.1 Fallback Ordering

Update the error handling in `executeViaLLM` to try fallbacks in order:

```javascript
// After LLM execution fails
const fallbacks = [
  tryApplyBulkCreateFallback,        // NEW - bulk create
  tryApplyBulkColorMutationFallback,  // EXISTING - bulk color
  tryApplyBulkDeleteFallback,         // EXISTING - bulk delete
  tryApplyFramesWithStickiesFallback, // EXISTING - frame+stickies
]

for (const fallback of fallbacks) {
  try {
    const result = await fallback(ctx, normalizedCommand)
    if (result) {
      return {
        message: result.message || 'Command completed via fallback.',
        aiResponse: result.message || 'Command completed via fallback.',
        executedTools: ctx.executedTools,
      }
    }
  } catch (fallbackError) {
    console.warn(`Fallback ${fallback.name} failed:`, fallbackError)
    continue
  }
}
```

### 4.2 No New LLM Tools

**Key decision:** Do NOT add new LLM tool schemas. The existing patterns work via server-side parsing. Adding new tools increases parse-failure surface area.

---

## Implementation Order

| Step | File | Action |
|------|------|--------|
| 1 | `functions/src/bulk-create-fallback.js` | Create new file |
| 2 | `functions/index.js` | Import and add to fallback chain |
| 3 | `functions/index.js` | Add `changeColorsChunked` helper |
| 4 | `functions/index.js` | Update `tryApplyBulkColorMutationFallback` to use chunking |
| 5 | `functions/index.js` | Add `deleteObjectsChunked` helper |
| 6 | `functions/index.js` | Update `tryApplyBulkDeleteFallback` to use chunking |
| 7 | Add tests for all bulk operations | |

---

## Test Coverage Plan

### Bulk Create Tests
- `AI-BULK-001`: "create 100 stickies" creates 100 without overlap
- `AI-BULK-002`: "add 50 yellow circles" creates 50 shapes
- `AI-BULK-003`: >400 stickies chunk correctly
- `AI-BULK-004`: Positions avoid existing objects

### Bulk Color Tests (existing + chunking verify)
- `AI-BULK-010`: "make all blue" works at scale
- `AI-BULK-011`: >450 objects chunk correctly

### Bulk Delete Tests (existing + chunking verify)
- `AI-BULK-020`: "delete all stickies" works at scale
- `AI-BULK-021`: >450 objects chunk correctly

### Regression Tests
- `AI-REG-001`: Parse-error recovery still works
- `AI-REG-002`: Typos in commands still handled
- `AI-REG-003`: Mixed-type fallback (frame+stickies) still works

---

## Files Modified

| File | Changes |
|------|---------|
| `functions/src/bulk-create-fallback.js` | NEW |
| `functions/index.js` | Add fallback chain, chunking helpers |
| `functions/test/requirements-ai-command-capabilities.test.js` | Add bulk tests |

---

## Removed from v1

| Feature | Why Removed |
|---------|-------------|
| `createObjects` LLM tool | Too fragile for parse-error path |
| Shape composition (group/ungroup) | New type system change - separate ticket |
| Shape templates | Scope creep |
| Timeout changes | Already 30s |
| New regex routing | Adds brittleness |

---

## Open Questions (Deferred)

1. **Shape composition/grouping** - Moved to MAX-46
2. **LLM tool-call reliability** - Separate investigation needed
3. **Frontend group type support** - Needs frontend change, separate ticket
