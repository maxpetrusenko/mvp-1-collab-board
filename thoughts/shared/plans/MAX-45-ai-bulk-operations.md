# Implementation Plan: MAX-45 AI Bulk Operations and Shape Composition

## Executive Summary

This plan adds bulk operations for create/color/delete and a shape composition system. The implementation reuses existing patterns from `functions/index.js` (batch writes, template builders, bulk color/delete fallbacks) and extends the LLM tool registry.

**Key constraint:** `index.js` is currently 5,364 lines. All new code must be extracted to helper modules to avoid exceeding this file size.

## Architecture Analysis

### Existing Patterns to Reuse

1. **Batch Writes** (`commitObjectBatchWrites` at line 3126):
   - Already handles chunking at `FIRESTORE_BATCH_WRITE_LIMIT = 450`
   - Used in `createSwotTemplate`, `createRetrospectiveTemplate`, `createStickyGridTemplate`

2. **Bulk Color Mutation** (`tryApplyBulkColorMutationFallback` at line 946):
   - Already iterates multiple targets with `changeColor`
   - Has color family inference for shade matching

3. **Bulk Delete** (`parseBulkDeleteIntent` at line 985):
   - Token-based intent parsing already exists
   - `tryApplyBulkDeleteFallback` pattern established

4. **Template Builders** (e.g., `createSwotTemplate` at line 3442):
   - Pattern: stage objects array, batch commit, push to state, log tools

5. **Tool Registry** (`tool-registry.js`):
   - `TOOL_DEFINITIONS` array for schema
   - `buildSystemPrompt` for LLM guidance
   - Tool name dispatch in `executeLlmToolCall` (line 4011+)

---

## Phase 1: Bulk Create Operations

### 1.1 New File: `functions/src/bulk-operations.js`

Extract bulk operation helpers to keep `index.js` size controlled:

```javascript
// Constants
const BULK_CREATE_CHUNK_SIZE = 400  // Stay under 450 limit
const GRID_SPACING_X = 200
const GRID_SPACING_Y = 150

// Pre-compute non-overlapping positions
function computeBulkPositions(count, anchor, existingBounds) {
  const positions = []
  const cols = Math.ceil(Math.sqrt(count))
  const spacingX = GRID_SPACING_X
  const spacingY = GRID_SPACING_Y

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = anchor.x + col * spacingX
    const y = anchor.y + row * spacingY
    positions.push({ x, y })
  }

  return positions
}

// Build array of sticky payloads with pre-computed positions
function buildBulkStickyPayloads(ctx, texts, colors, anchor) {
  const count = texts.length
  const positions = computeBulkPositions(count, anchor, ctx.state)

  return texts.map((text, i) => ({
    id: crypto.randomUUID(),
    boardId: ctx.boardId,
    type: 'stickyNote',
    text: sanitizeText(text),
    color: toColor(colors[i % colors.length], '#fde68a'),
    position: positions[i],
    size: { width: 180, height: 110 },
    zIndex: getNextZIndex(ctx.state) + i,
    createdBy: ctx.userId,
    createdAt: nowMs(),
    updatedBy: ctx.userId,
    updatedAt: nowMs(),
    version: 1,
  }))
}

// Chunked write for >450 objects
async function commitBulkCreates(boardId, objects) {
  for (let i = 0; i < objects.length; i += BULK_CREATE_CHUNK_SIZE) {
    const chunk = objects.slice(i, i + BULK_CREATE_CHUNK_SIZE)
    await commitObjectBatchWrites({ boardId, objects: chunk })
  }
}
```

### 1.2 Tool Schema Addition in `tool-registry.js`

```javascript
{
  type: 'function',
  function: {
    name: 'createObjects',
    description: 'Create multiple objects at once. Use for repetitive creation requests (e.g., "create 10 stickies"). Pre-computes positions to avoid overlap.',
    parameters: {
      type: 'object',
      properties: {
        objects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { enum: ['stickyNote', 'shape', 'frame'] },
              text: { type: 'string' },
              color: { enum: COLOR_OPTIONS },
              shapeType: { enum: SHAPE_TYPES }
            }
          },
          minItems: 2,
          maxItems: 500,
          description: 'Objects to create'
        },
        anchor: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' }
          }
        }
      },
      required: ['objects']
    }
  }
}
```

### 1.3 Handler in `index.js`

```javascript
const createObjects = async (ctx, args) => {
  const objects = args.objects || []
  if (objects.length === 0) return { count: 0 }

  const anchor = args.anchor || resolvePlacementAnchor(ctx.commandPlacement) || { x: 640, y: 360 }

  // Build payloads by type
  const stagedObjects = []
  const stickyTexts = objects.filter(o => o.type === 'stickyNote').map(o => o.text || 'Note')
  const colors = objects.filter(o => o.color).map(o => o.color)

  if (stickyTexts.length > 0) {
    const payloads = buildBulkStickyPayloads(ctx, stickyTexts, colors, anchor)
    stagedObjects.push(...payloads)
  }

  // Chunked commit
  await commitBulkCreates(ctx.boardId, stagedObjects)

  // Update state
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push({ tool: 'createObjects', count: stagedObjects.length })

  return { count: stagedObjects.length }
}
```

### 1.4 Timeout Extension

In `glm-client.js`, add bulk operation timeout awareness:

```javascript
const isBulkOperation = (command) => /\b(?:create|add)\s+\d+\b/i.test(command)

const resolveTimeoutForCommand = (command) => {
  if (isBulkOperation(command)) {
    return AI_PROVIDER_TIMEOUT_CAP_MS  // 30s for bulk
  }
  return AI_PROVIDER_TIMEOUT_DEFAULT_MS  // 12s normal
}
```

---

## Phase 2: Bulk Color Operations

### 2.1 New File: `functions/src/bulk-color-operations.js`

```javascript
async function changeColors(ctx, args) {
  const objectIds = args.objectIds || []
  const targetColor = args.color

  if (objectIds.length === 0) return { count: 0 }

  // Batch Firestore write
  const batch = db.batch()
  const updatedObjects = []

  for (const objectId of objectIds) {
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
    if (object) {
      object.color = updated.color
    }
  }

  ctx.executedTools.push({ tool: 'changeColors', count: updatedObjects.length })

  return { count: updatedObjects.length }
}
```

### 2.2 Tool Schema

```javascript
{
  type: 'function',
  function: {
    name: 'changeColors',
    description: 'Change color of multiple objects at once',
    parameters: {
      type: 'object',
      properties: {
        objectIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'IDs of objects to recolor'
        },
        color: {
          type: 'string',
          enum: COLOR_OPTIONS,
          description: 'New color'
        }
      },
      required: ['objectIds', 'color']
    }
  }
}
```

---

## Phase 3: Bulk Delete Operations

### 3.1 Handler in `bulk-operations.js`

```javascript
async function deleteObjects(ctx, args) {
  const objectIds = args.objectIds || []

  if (objectIds.length === 0) return { count: 0 }

  const now = nowMs()
  const batch = db.batch()
  const deletedIds = []

  for (const objectId of objectIds) {
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

  // Remove from state
  ctx.state = ctx.state.filter(o => !deletedIds.includes(o.id))

  ctx.executedTools.push({ tool: 'deleteObjects', count: deletedIds.length })

  return { count: deletedIds.length }
}
```

### 3.2 Tool Schema

```javascript
{
  type: 'function',
  function: {
    name: 'deleteObjects',
    description: 'Delete multiple objects at once',
    parameters: {
      type: 'object',
      properties: {
        objectIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'IDs of objects to delete'
        }
      },
      required: ['objectIds']
    }
  }
}
```

---

## Phase 4: Shape Composition System

### 4.1 Data Model Extension

In `app/src/types/board.ts`, add group concept:

```typescript
export type CompositeGroupObject = BoardObjectBase & {
  type: 'group'
  memberIds: string[]
  position: Point  // Group anchor
  size: Size
}
```

### 4.2 New File: `functions/src/shape-composition.js`

```javascript
// Shape templates for common icons
const SHAPE_TEMPLATES = {
  bus: {
    parts: [
      { type: 'rectangle', width: 200, height: 80, color: '#fbbf24', offsetX: 0, offsetY: 0 },
      { type: 'circle', width: 40, height: 40, color: '#93c5fd', offsetX: 30, offsetY: 40 },
      { type: 'circle', width: 40, height: 40, color: '#93c5fd', offsetX: 170, offsetY: 40 },
    ]
  },
  house: {
    parts: [
      { type: 'rectangle', width: 120, height: 100, color: '#fde68a', offsetX: 0, offsetY: 30 },
      { type: 'triangle', width: 140, height: 80, color: '#fca5a5', offsetX: 0, offsetY: 0 },
      { type: 'rectangle', width: 30, height: 50, color: '#a16207', offsetX: 45, offsetY: 60 },
    ]
  },
  tree: {
    parts: [
      { type: 'rectangle', width: 30, height: 60, color: '#a16207', offsetX: 45, offsetY: 60 },
      { type: 'circle', width: 100, height: 100, color: '#86efac', offsetX: 10, offsetY: 0 },
    ]
  }
}

async function groupObjects(ctx, args) {
  const memberIds = args.objectIds || []
  if (memberIds.length < 2) return null

  const members = ctx.state.filter(o => memberIds.includes(o.id))
  if (members.length === 0) return null

  // Compute bounding box
  const bounds = computeGroupBounds(members)

  const groupId = crypto.randomUUID()
  const group = {
    id: groupId,
    boardId: ctx.boardId,
    type: 'group',
    memberIds,
    position: { x: bounds.x, y: bounds.y },
    size: { width: bounds.width, height: bounds.height },
    zIndex: Math.max(...members.map(m => m.zIndex || 0)),
    createdBy: ctx.userId,
    createdAt: nowMs(),
    updatedBy: ctx.userId,
    updatedAt: nowMs(),
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: groupId, payload: group })

  // Update members with groupId reference
  const memberBatch = db.batch()
  for (const member of members) {
    const ref = getObjectsRef(ctx.boardId).doc(member.id)
    memberBatch.set(ref, {
      groupId,
      updatedAt: nowMs(),
      updatedBy: ctx.userId,
    }, { merge: true })
  }
  await memberBatch.commit()

  ctx.state.push(group)
  members.forEach(m => { m.groupId = groupId })

  ctx.executedTools.push({ tool: 'groupObjects', groupId, count: members.length })

  return { groupId, count: members.length }
}

async function ungroupObjects(ctx, args) {
  const groupId = args.groupId
  if (!groupId) return null

  const group = ctx.state.find(o => o.id === groupId)
  if (!group || group.type !== 'group') return null

  const members = ctx.state.filter(o => o.groupId === groupId)

  // Clear groupId from members
  const memberBatch = db.batch()
  for (const member of members) {
    const ref = getObjectsRef(ctx.boardId).doc(member.id)
    memberBatch.set(ref, {
      groupId: null,
      updatedAt: nowMs(),
      updatedBy: ctx.userId,
    }, { merge: true })
    delete member.groupId
  }
  await memberBatch.commit()

  // Delete group marker
  await writeObject({
    boardId: ctx.boardId,
    objectId: groupId,
    payload: { deleted: true, deletedAt: nowMs() },
    merge: true
  })

  const index = ctx.state.findIndex(o => o.id === groupId)
  if (index !== -1) ctx.state.splice(index, 1)

  ctx.executedTools.push({ tool: 'ungroupObjects', groupId, count: members.length })

  return { groupId, count: members.length }
}

async function createShapeTemplate(ctx, args) {
  const template = SHAPE_TEMPLATES[args.templateType]
  if (!template) return null

  const anchor = args.anchor || resolvePlacementAnchor(ctx.commandPlacement) || { x: 640, y: 360 }
  const stagedObjects = []
  let zIndexCursor = getNextZIndex(ctx.state)

  for (const part of template.parts) {
    const object = buildShapePayload(ctx, {
      type: part.type,
      x: anchor.x + part.offsetX,
      y: anchor.y + part.offsetY,
      width: part.width,
      height: part.height,
      color: part.color,
      zIndex: zIndexCursor++,
    })
    stagedObjects.push(object)
  }

  await commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)

  ctx.executedTools.push({ tool: 'createShapeTemplate', type: args.templateType, count: stagedObjects.length })

  return { type: args.templateType, count: stagedObjects.length }
}

function computeGroupBounds(members) {
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const m of members) {
    const x = m.position?.x || 0
    const y = m.position?.y || 0
    const w = m.size?.width || 0
    const h = m.size?.height || 0

    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
```

### 4.3 Tool Schemas

```javascript
{
  type: 'function',
  function: {
    name: 'groupObjects',
    description: 'Create a composite group from multiple objects',
    parameters: {
      type: 'object',
      properties: {
        objectIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: 'Object IDs to group'
        }
      },
      required: ['objectIds']
    }
  }
},
{
  type: 'function',
  function: {
    name: 'ungroupObjects',
    description: 'Dissolve a composite group',
    parameters: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'Group ID to dissolve'
        }
      },
      required: ['groupId']
    }
  }
},
{
  type: 'function',
  function: {
    name: 'createShapeTemplate',
    description: 'Create a pre-defined composite shape (bus, house, tree, person, etc.)',
    parameters: {
      type: 'object',
      properties: {
        templateType: {
          type: 'string',
          enum: ['bus', 'house', 'tree', 'person', 'car', 'building'],
          description: 'Template to create'
        },
        anchor: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' }
          }
        }
      },
      required: ['templateType']
    }
  }
}
```

---

## Phase 5: LLM Integration Updates

### 5.1 Update `glm-client.js`

Add bulk tools to tool sets:

```javascript
const BULK_OPERATION_TOOL_NAMES = new Set([
  'createObjects',
  'changeColors',
  'deleteObjects',
  'groupObjects',
  'ungroupObjects',
  'createShapeTemplate',
])

const isBulkOperationCommand = (command) => {
  const normalized = normalizeCommand(command)
  return /\b\d+\s+(?:sticky|stickies|notes?|shapes?|objects?|items?)\b/i.test(normalized) ||
         /\b(?:all|every)\s+(?:sticky|notes?|shapes?|objects?)/i.test(normalized)
}

const selectToolDefinitions = (command) => {
  if (shouldUseFullToolSet(command)) {
    return TOOL_DEFINITIONS
  }

  if (isBulkOperationCommand(command)) {
    return filterToolDefinitions(new Set([...BULK_OPERATION_TOOL_NAMES, 'executeBatch']))
  }

  // ... existing logic
}
```

### 5.2 Update `tool-registry.js`

Add bulk preference guidance to `buildSystemPrompt`:

```javascript
function buildSystemPrompt(boardContext) {
  return `You are CollabBoard's board note creator AI agent.
...
GUIDELINES:
...
13. For bulk operations (>5 objects), prefer createObjects/changeColors/deleteObjects over repeated single calls.
14. Use createShapeTemplate for common icons (bus, house, tree) instead of building from primitives.
15. Use groupObjects to create composite shapes that move together.
`
}
```

### 5.3 Update `index.js` Tool Dispatcher

```javascript
case 'createObjects':
  await createObjects(ctx, args)
  return
case 'changeColors':
  await changeColors(ctx, args)
  return
case 'deleteObjects':
  await deleteObjects(ctx, args)
  return
case 'groupObjects':
  await groupObjects(ctx, args)
  return
case 'ungroupObjects':
  await ungroupObjects(ctx, args)
  return
case 'createShapeTemplate':
  await createShapeTemplate(ctx, args)
  return
```

---

## Implementation Order

| Phase | Step | File | Action |
|-------|------|------|--------|
| 1 | 1.1 | `functions/src/bulk-operations.js` | Create new file with bulk helpers |
| 1 | 1.2 | `functions/src/tool-registry.js` | Add `createObjects` schema |
| 1 | 1.3 | `functions/index.js` | Add handler, import bulk module |
| 1 | 1.4 | `functions/src/glm-client.js` | Add bulk timeout awareness |
| 1 | 1.5 | `functions/test/requirements-ai-command-capabilities.test.js` | Add bulk create tests |
| 2 | 2.1 | `functions/src/bulk-color-operations.js` | Create color batch module |
| 2 | 2.2 | `functions/src/tool-registry.js` | Add `changeColors` schema |
| 2 | 2.3 | `functions/index.js` | Wire up handler |
| 2 | 2.4 | Add bulk color tests | |
| 3 | 3.1 | `functions/src/bulk-operations.js` | Add `deleteObjects` |
| 3 | 3.2 | `functions/src/tool-registry.js` | Add `deleteObjects` schema |
| 3 | 3.3 | `functions/index.js` | Wire up handler |
| 3 | 3.4 | Add bulk delete tests | |
| 4 | 4.1 | `app/src/types/board.ts` | Add `CompositeGroupObject` type |
| 4 | 4.2 | `functions/src/shape-composition.js` | Create composition module |
| 4 | 4.3 | `functions/src/tool-registry.js` | Add group/ungroup/template schemas |
| 4 | 4.4 | `functions/index.js` | Wire up handlers |
| 4 | 4.5 | Add composition tests | |
| 5 | 5.1 | `functions/src/glm-client.js` | Update tool selection |
| 5 | 5.2 | `functions/src/tool-registry.js` | Update system prompt |
| 5 | 5.3 | Full integration testing | |

---

## Test Coverage Plan

### Bulk Create Tests
- `AI-BULK-001`: `createObjects` creates N stickies without overlap
- `AI-BULK-002`: Pre-computed positions prevent overlap at scale
- `AI-BULK-003`: >450 objects chunk correctly

### Bulk Color Tests
- `AI-BULK-010`: `changeColors` updates all specified objects
- `AI-BULK-011`: Empty array returns zero count

### Bulk Delete Tests
- `AI-BULK-020`: `deleteObjects` removes from Firestore and state
- `AI-BULK-021`: Invalid IDs ignored gracefully

### Composition Tests
- `AI-COMP-001`: `groupObjects` creates group with correct bounds
- `AI-COMP-002`: `ungroupObjects` clears member references
- `AI-COMP-003`: `createShapeTemplate` builds bus/house/tree correctly

---

## Risk Mitigation

1. **File size**: New modules prevent `index.js` growth
2. **Firestore limits**: Chunking at 400 (safety margin below 450)
3. **Timeout**: Extended only for detected bulk operations
4. **State consistency**: All paths update both Firestore and `ctx.state`
5. **Backwards compatibility**: New tools optional, no breaking changes

---

### Critical Files for Implementation

| File | Reason |
|------|--------|
| `/Users/maxpetrusenko/Desktop/Gauntlet Cohort/mvp-1-collab-board/functions/index.js` | Tool dispatcher, existing batch patterns, handler registration |
| `/Users/maxpetrusenko/Desktop/Gauntlet Cohort/mvp-1-collab-board/functions/src/tool-registry.js` | Tool schema definitions, LLM system prompt guidance |
| `/Users/maxpetrusenko/Desktop/Gauntlet Cohort/mvp-1-collab-board/functions/src/glm-client.js` | Tool selection filtering, timeout resolution per command type |
| `/Users/maxpetrusenko/Desktop/Gauntlet Cohort/mvp-1-collab-board/functions/test/requirements-ai-command-capabilities.test.js` | Test patterns for new bulk operations |
| `/Users/maxpetrusenko/Desktop/Gauntlet Cohort/mvp-1-collab-board/app/src/types/board.ts` | TypeScript type definitions for group object |
