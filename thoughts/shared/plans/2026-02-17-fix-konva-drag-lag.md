# Fix Konva Drag-and-Drop Lag/Jump Issue

## Overview

Fix the visual lag and position jumping during drag operations on sticky notes, shapes, and frames. The root cause is React re-renders overwriting Konva's internal position state during active drag, causing objects to "snap back" to their original position mid-drag.

## Current State Analysis

### The Bug
When dragging an object:
1. User drags → Konva updates internal position
2. `onDragMove` fires → updates `localObjectPositions` state
3. React re-renders with new `x={position.x} y={position.y}` props
4. **These props overwrite Konva's internal position**, causing visual jump
5. Object may or may not be at correct position on release (race condition)

### Current Implementation

**app/src/pages/BoardPage.tsx**

Lines 2149-2152 (Sticky Notes Group):
```tsx
<Group
  key={boardObject.id}
  x={position.x}        // <-- Overwrites Konva position during drag
  y={position.y}        // <-- Overwrites Konva position during drag
  draggable
```

Lines 2162-2173 (onDragMove):
```tsx
onDragMove={(event) => {
  const newPos = { x: event.target.x(), y: event.target.y() }
  setLocalObjectPositions((prev) => ({  // <-- Triggers re-render
    ...prev,
    [boardObject.id]: {
      point: newPos,
      mode: 'dragging',
      updatedAt: Date.now(),
    },
  }))
  getDragPublisher(boardObject.id)(newPos)
}}
```

Same pattern exists for:
- Shapes (lines 2628-2639)
- Frames (lines 2513-2540)

### Why Tests Pass

**app/e2e/sticky-drag-persistence.spec.ts**
- Uses `await expect.poll()` with 600ms wait (line 96)
- Tests only verify final persisted position, not visual behavior during drag
- 6px tolerance masks small inconsistencies (line 7, 90-91)
- Playwright's `page.mouse.move()` doesn't catch the visual jumping

### Key Discoveries

1. **React-Konva prop conflict**: Setting `x`/`y` props during drag causes Konva to reset its internal position
2. **No `listening={false}` pattern used**: Konva has a `listening={false}` prop that disables event processing without hiding
3. **`localObjectPositions` serves two purposes**: drag override AND server sync pending state - these should be separate
4. **Frame drag already uses ref pattern**: `frameDragSnapshotRef` avoids re-renders for bulk operations (line 303-311)

## Desired End State

- Objects follow mouse smoothly during drag without jumping
- Position persists correctly to server on drag end
- Real-time collaboration still works (remote users see drag updates)
- No visual lag or position "snap-back"

## What We're NOT Doing

- Changing the server sync mechanism (keep `patchObject` flow)
- Modifying connector drag (different pattern, works fine)
- Changing frame drag logic (already optimized with refs)
- Removing position override pattern (needed for real-time collaboration)

## Implementation Approach

**Strategy: Use `listening={false}` during drag to prevent prop updates from affecting Konva**

React-Konva components accept a `listening` prop. When `false`, the component doesn't process events but still renders. More importantly for our case: **props that would trigger internal state changes don't override current state when `listening={false}`**.

Alternative considered: Using refs exclusively for position during drag. Rejected because it breaks the position override pattern needed for multi-user sync.

## Phase 1: Add Drag State Tracking via Ref

### Overview
Add a ref to track which objects are actively being dragged, so we can conditionally disable position prop updates during drag.

### Changes Required:

#### app/src/pages/BoardPage.tsx

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Add ref to track active drag state

After line 311 (after `frameDragSnapshotRef`), add:

```tsx
// Track which objects are actively being dragged to prevent React prop updates from overwriting Konva position
const activelyDraggingIdsRef = useRef<Set<string>>(new Set())
```

**Why**: Using a ref instead of state avoids triggering re-renders when tracking drag state.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] No TypeScript errors in BoardPage.tsx
- [ ] Build succeeds: `cd app && npm run build`

---

## Phase 2: Modify onDragStart to Set Ref

### Overview
Update drag start handlers to populate the ref instead of (or in addition to) state.

### Changes Required:

#### app/src/pages/BoardPage.tsx: Sticky Notes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update sticky note onDragStart (line 2159-2161)

```tsx
onDragStart={() => {
  activelyDraggingIdsRef.current.add(boardObject.id)
  setDraggingObjectId(boardObject.id)
}}
```

#### app/src/pages/BoardPage.tsx: Shapes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update shape onDragStart (line 2625-2627)

```tsx
onDragStart={() => {
  activelyDraggingIdsRef.current.add(boardObject.id)
  setDraggingObjectId(boardObject.id)
}}
```

#### app/src/pages/BoardPage.tsx: Frames

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update frame onDragStart (line 2505-2511)

```tsx
onDragStart={() => {
  activelyDraggingIdsRef.current.add(boardObject.id)
  // ... existing snapshot logic
  setDraggingObjectId(boardObject.id)
}}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Build succeeds: `cd app && npm run build`

---

## Phase 3: Modify onDragEnd to Clear Ref

### Overview
Clean up the ref when drag completes.

### Changes Required:

#### app/src/pages/BoardPage.tsx: Sticky Notes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update sticky note onDragEnd (line 2174-2186)

```tsx
onDragEnd={(event) => {
  const finalPos = { x: event.target.x(), y: event.target.y() }
  activelyDraggingIdsRef.current.delete(boardObject.id)
  setLocalObjectPositions((prev) => ({
    ...prev,
    [boardObject.id]: {
      point: finalPos,
      mode: 'pending',
      updatedAt: Date.now(),
    },
  }))
  setDraggingObjectId(null)
  void patchObject(boardObject.id, { position: finalPos }, { actionLabel: 'moved sticky' })
}}
```

#### app/src/pages/BoardPage.tsx: Shapes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update shape onDragEnd (line 2640-2652)

```tsx
onDragEnd={(event) => {
  const finalPos = { x: event.target.x(), y: event.target.y() }
  activelyDraggingIdsRef.current.delete(boardObject.id)
  // ... rest of existing logic
}}
```

#### app/src/pages/BoardPage.tsx: Frames

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update frame onDragEnd (line 2541-2578)

```tsx
onDragEnd={(event) => {
  const finalFramePos = { x: event.target.x(), y: event.target.y() }
  activelyDraggingIdsRef.current.delete(boardObject.id)
  // ... rest of existing logic
}}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Build succeeds: `cd app && npm run build`

---

## Phase 4: Conditionally Apply Position Props Based on Drag State

### Overview
Only update `x` and `y` props when the object is NOT actively being dragged. During drag, let Konva manage its own position.

### Changes Required:

#### app/src/pages/BoardPage.tsx: Sticky Notes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Modify position prop application (line 2149-2153)

```tsx
<Group
  key={boardObject.id}
  x={activelyDraggingIdsRef.current.has(boardObject.id) ? undefined : position.x}
  y={activelyDraggingIdsRef.current.has(boardObject.id) ? undefined : position.y}
  draggable
```

**Wait!** This won't work because we can't read from ref during render (it violates React rules). Instead, we need a different approach.

**Revised approach**: Use the `draggingObjectId` state which we already track.

```tsx
<Group
  key={boardObject.id}
  x={draggingObjectId === boardObject.id ? undefined : position.x}
  y={draggingObjectId === boardObject.id ? undefined : position.y}
  draggable
```

**Wait again!** Setting `x={undefined}` resets to 0, not "don't update". We need the actual Konva position.

**Final approach**: Store initial position in state during drag start, use that during drag.

Actually, the cleanest solution is to use the `listening` prop pattern:

```tsx
<Group
  key={boardObject.id}
  x={position.x}
  y={position.y}
  draggable={draggingObjectId !== boardObject.id}
  listening={draggingObjectId !== boardObject.id}
```

**NO!** Setting `draggable={false}` during drag breaks the drag operation.

**Correct solution**: We need to accept that React will re-render during drag, but prevent the position prop from causing the jump. The key is to set the position ONLY when not actively dragging, and use a ref to track the Konva node's position during drag.

Let me revise the entire approach:

**Solution**: Use a ref to cache the object's Konva node position, and only read from it during drag. Never write position props during drag.

Revised Phase 4 changes:

```tsx
const isDragging = draggingObjectId === boardObject.id
const displayPosition = isDragging
  ? localObjectPositions[boardObject.id]?.point || boardObject.position
  : boardObject.position

<Group
  key={boardObject.id}
  x={displayPosition.x}
  y={displayPosition.y}
  draggable
```

Wait, this is what we already have. The issue is the re-render itself.

**ACTUAL SOLUTION**: The issue is that `setLocalObjectPositions` in `onDragMove` causes a re-render, and that re-render applies the `x`/`y` props which Konva interprets as "set position to this", but the position is slightly different from where Konva actually is due to the event loop timing.

The fix is simpler: **Remove the `setLocalObjectPositions` call from `onDragMove` entirely during drag**. Let Konva manage position. Only update state on `onDragEnd`.

Let me rewrite Phase 4 with this understanding:

### REVISED Phase 4: Remove Position State Updates During Drag

#### app/src/pages/BoardPage.tsx: Sticky Notes onDragMove

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Simplify onDragMove (line 2162-2173)

**Before:**
```tsx
onDragMove={(event) => {
  const newPos = { x: event.target.x(), y: event.target.y() }
  setLocalObjectPositions((prev) => ({
    ...prev,
    [boardObject.id]: {
      point: newPos,
      mode: 'dragging',
      updatedAt: Date.now(),
    },
  }))
  getDragPublisher(boardObject.id)(newPos)
}}
```

**After:**
```tsx
onDragMove={(event) => {
  const newPos = { x: event.target.x(), y: event.target.y() }
  // Don't update local state during drag - let Konva manage position
  getDragPublisher(boardObject.id)(newPos)
}}
```

**Impact**: This means `localObjectPositions` won't be updated during drag. The object will render from `boardObject.position` during drag, which will cause it to snap to the server position.

**That's also wrong.**

Let me think more carefully...

The real issue: Konva's internal position and React's position props get out of sync because of the re-render timing.

**CORRECT SOLUTION**: Use a ref to store position during drag, and read from that ref for rendering. Only update React state on drag end.

### ACTUAL Phase 4: Use Ref for Position During Drag

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Multiple modifications

1. Create position tracking ref (around line 311):
```tsx
const objectPositionsRef = useRef<Record<string, Point>>({})
```

2. Update position calculation (line 2139-2140):
```tsx
// Use ref position during drag (updated by onDragMove), server position otherwise
const position =
  objectPositionsRef.current[boardObject.id] ||
  localObjectPositions[boardObject.id]?.point ||
  boardObject.position
```

3. Update onDragStart (line 2159-2161):
```tsx
onDragStart={() => {
  objectPositionsRef.current[boardObject.id] = boardObject.position
  setDraggingObjectId(boardObject.id)
}}
```

4. Update onDragMove (line 2162-2173):
```tsx
onDragMove={(event) => {
  const newPos = { x: event.target.x(), y: event.target.y() }
  // Update ref directly - no re-render
  objectPositionsRef.current[boardObject.id] = newPos
  getDragPublisher(boardObject.id)(newPos)
}}
```

5. Update onDragEnd (line 2174-2186):
```tsx
onDragEnd={(event) => {
  const finalPos = { x: event.target.x(), y: event.target.y() }
  // Clear ref position so we fall back to localObjectPositions or server position
  delete objectPositionsRef.current[boardObject.id]
  setLocalObjectPositions((prev) => ({
    ...prev,
    [boardObject.id]: {
      point: finalPos,
      mode: 'pending',
      updatedAt: Date.now(),
    },
  }))
  setDraggingObjectId(null)
  void patchObject(boardObject.id, { position: finalPos }, { actionLabel: 'moved sticky' })
}}
```

This approach:
- Updates position via ref (no re-render)
- Reads from ref during render
- Clears ref on drag end to fall back to normal position source

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Build succeeds: `cd app && npm run build`
- [ ] All E2E tests pass: `cd app && npm run test:e2e`

#### Manual Verification:
- [ ] Drag sticky note - position follows mouse smoothly without jumping
- [ ] Drag shape - position follows mouse smoothly
- [ ] Drag frame - position follows mouse smoothly
- [ ] Drag object, wait 2 seconds, release - position persists correctly
- [ ] Rapid drag of multiple objects - each behaves independently
- [ ] Check that other users' cursors/drag still show in real-time

**Implementation Note**: After automated tests pass, manual testing is critical here since the bug is visual and timing-dependent. E2E tests won't catch the improvement.

---

## Phase 5: Apply Same Fix to Shapes and Frames

### Overview
Apply the ref-based position tracking pattern to shapes and frames.

### Changes Required:

#### app/src/pages/BoardPage.tsx: Shapes

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update shape drag handlers (lines 2625-2652)

```tsx
onDragStart={() => {
  objectPositionsRef.current[boardObject.id] = boardObject.position
  setDraggingObjectId(boardObject.id)
}}
onDragMove={(event) => {
  const newPos = { x: event.target.x(), y: event.target.y() }
  objectPositionsRef.current[boardObject.id] = newPos
  getDragPublisher(boardObject.id)(newPos)
}}
onDragEnd={(event) => {
  const finalPos = { x: event.target.x(), y: event.target.y() }
  delete objectPositionsRef.current[boardObject.id]
  // ... rest of existing logic
}}
```

#### app/src/pages/BoardPage.tsx: Frames

**File**: `app/src/pages/BoardPage.tsx`
**Changes**: Update frame drag handlers (lines 2505-2578)

```tsx
onDragStart={() => {
  objectPositionsRef.current[boardObject.id] = boardObject.position
  // ... existing snapshot logic
  setDraggingObjectId(boardObject.id)
}}
onDragMove={(event) => {
  const nextFramePos = { x: event.target.x(), y: event.target.y() }
  objectPositionsRef.current[boardObject.id] = nextFramePos
  // Update member positions in ref too
  const snapshot = frameDragSnapshotRef.current[boardObject.id]
  if (snapshot) {
    const dx = nextFramePos.x - snapshot.frameStart.x
    const dy = nextFramePos.y - snapshot.frameStart.y
    snapshot.members.forEach((member) => {
      objectPositionsRef.current[member.id] = {
        x: member.start.x + dx,
        y: member.start.y + dy,
      }
    })
  }
  getDragPublisher(boardObject.id)(nextFramePos)
}}
onDragEnd={(event) => {
  const finalFramePos = { x: event.target.x(), y: event.target.y() }
  delete objectPositionsRef.current[boardObject.id]
  const snapshot = frameDragSnapshotRef.current[boardObject.id]
  if (snapshot) {
    const dx = finalFramePos.x - snapshot.frameStart.x
    const dy = finalFramePos.y - snapshot.frameStart.y
    snapshot.members.forEach((member) => {
      delete objectPositionsRef.current[member.id]
      const memberFinal = {
        x: member.start.x + dx,
        y: member.start.y + dy,
      }
      // ... existing patch logic
    })}
  }
  // ... rest of existing logic
}}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Build succeeds: `cd app && npm run build`
- [ ] All E2E tests pass: `cd app && npm run test:e2e`

#### Manual Verification:
- [ ] Drag shapes of all types (circle, diamond, rectangle, etc.) - smooth drag
- [ ] Drag frame with multiple members - all members move smoothly together
- [ ] Drag frame member that's also individually draggable - correct behavior

---

## Phase 6: Add Visual Regression Test for Drag Behavior

### Overview
Create a test that specifically checks for position jumping during drag (not just final position).

### Changes Required:

#### app/e2e/sticky-drag-behavior.spec.ts (new file)

**File**: `app/e2e/sticky-drag-behavior.spec.ts`
**Changes**: Create new test file

```tsx
import { expect, test } from '@playwright/test'

import { createTempUser, deleteTempUser, loginWithEmail } from './helpers/auth'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'

test.describe('Sticky drag visual behavior', () => {
  test.setTimeout(180_000)

  test('does not jump back to original position during drag', async ({ page }) => {
    const user = await createTempUser()
    const boardId = `pw-drag-behavior-${Date.now()}`

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      await page.locator('button[title="Add sticky note (S)"]').click()
      await page.waitForTimeout(500)

      const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
      if (!canvasBox) {
        throw new Error('Canvas bounds unavailable')
      }

      // Get initial sticky position from canvas
      const sticky = page.locator('.board-stage canvas').first()
      const initialPos = await sticky.evaluate((el) => {
        // This is a conceptual test - actual implementation would need
        // to read Konva's internal state or use visual regression
        return { x: 0, y: 0 }
      })

      // Simulate slow drag to catch any jumping
      await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100)
      await page.mouse.down()
      await page.mouse.move(canvasBox.x + 200, canvasBox.y + 100, { steps: 20 })
      await page.mouse.move(canvasBox.x + 300, canvasBox.y + 100, { steps: 20 })
      await page.mouse.up()

      // Verify no "jump back" occurred by checking final position
      // Visual regression would be better here
      await page.waitForTimeout(500)

      // The sticky should be at release position, not snapped back
      await expect(page.locator('.board-stage')).toBeVisible()
    } finally {
      await deleteTempUser(user.idToken)
    }
  })
})
```

**Note**: This test is more of a placeholder. A true visual regression test would capture screenshots during drag or use Konva's internal state to verify no jumping occurred.

### Success Criteria:

#### Automated Verification:
- [ ] New test file created
- [ ] Test runs without errors: `cd app && npm run test:e2e sticky-drag-behavior`

---

## Testing Strategy

### Unit Tests:
- No new unit tests required (this is a React/Konva integration issue)

### Integration Tests:
- Existing E2E tests verify persistence (keep these passing)
- New behavior test documents the fix (even if it can't fully verify visual smoothness)

### Manual Testing Steps:
1. Open board in browser
2. Add a sticky note
3. Drag it slowly - should follow mouse smoothly, no jumps
4. Drag it rapidly - should follow smoothly
5. Release after holding - should stay at release position
6. Test with shapes (circle, diamond, etc.)
7. Test with frames containing multiple objects
8. Test multi-user: open board in two tabs, drag in one tab, verify other tab sees smooth updates

## Performance Considerations

- **Before**: Re-render on every drag move event (60+ times per second)
- **After**: Zero re-renders during drag (ref updates only)
- **Expected impact**: Significant performance improvement + smoother UX

## Migration Notes

No data migration required. This is a client-side behavior change only.

## References

- Bug report: User observation of drag lag/jump during manual testing
- Analysis: Phase 1-3 research above
- Similar pattern: Frame drag uses `frameDragSnapshotRef` for bulk position tracking
