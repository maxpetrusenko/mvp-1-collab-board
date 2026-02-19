# Large Board Performance Analysis & Plan

**Date**: 2026-02-18
**Question**: Will the board lag with lots of items? Should we use tldraw?

---

## Current Tech Stack

**NOT using tldraw**. Using:
- `konva@^10.2.0` - Canvas rendering engine
- `react-konva@^19.2.2` - React integration for Konva

---

## Performance Characteristics

### Tested Performance (from E2E tests)

| Metric | Target | Warning | Critical | Current Status |
|--------|--------|---------|----------|----------------|
| Time to first sticky | <500ms | <750ms | <2500ms | ✅ Passes |
| Drag FPS (20 objects) | >55 | >45 | >30 | ✅ Passes |
| Zoom FPS (20 objects) | >55 | >50 | >45 | ✅ Passes |
| Large board load (100 objects) | <8s | <11s | <15s | ✅ Passes |
| Drag FPS (100 objects) | >35 | >28 | >20 | ✅ Passes |

**Source**: `app/e2e/performance/large-board.spec.ts`, `app/e2e/performance/rendering.spec.ts`

---

## Konva Optimizations Already in Place

### 1. Layer `listening={false}`

**BoardPage.tsx:3760, 4668, 4687**:
```tsx
<Layer listening={false}>
```

**Impact**: Disables event listening on static layers (background, confetti, cursors), reducing event processing overhead.

### 2. Cursor Throttling

**usePresence.ts:84-86**:
```typescript
if (now - lastCursorPublishAtRef.current < 50) {
  return
}
```

**Impact**: Max 20 cursor updates/second, preventing network/canvas spam.

### 3. Drag Throttling

**BoardPage.tsx:2292** (connector publisher):
```typescript
if (now - lastDragPublishAt < 100) {
  return
}
```

**Impact**: Max 10 drag updates/second during object manipulation.

### 4. Optimistic UI with Reconciliation

**useObjectSync.ts**: Local state updates immediately, reconciles with Firestore snapshots.

**Impact**: UI feels instant even with network latency.

---

## Scaling Analysis

### Object Count vs Performance

| Objects | Expected Load Time | Expected Drag FPS | Risk Level |
|---------|-------------------|-------------------|------------|
| 0-50 | <1s | 60 FPS | ✅ Low |
| 50-100 | 1-2s | 45-60 FPS | ✅ Low |
| 100-200 | 2-4s | 30-45 FPS | ⚠️ Medium |
| 200-500 | 4-8s | 20-30 FPS | ⚠️ Medium |
| 500+ | 8s+ | <20 FPS | ❌ High |

**NFR-4**: 500+ objects without major degradation - **This is the risk zone**

---

## Why Not tldraw?

| Aspect | Current (Konva) | tldraw |
|--------|-----------------|--------|
| Canvas engine | Konva (HTML5 Canvas) | Custom Canvas + optimized rendering |
| Object virtualization | None | Viewport culling |
| Performance ceiling | ~500 objects | 1000+ objects |
| Implementation effort | Working today | Major rewrite |
| Team expertise | Existing | Would need learning |

---

## Recommendations

### Option A: Optimize Konva (Recommended for Sprint)

**Effort**: 2-3 hours

1. **Add Viewport Culling** - Only render objects visible in viewport
2. **Add Object Pooling** - Reuse Konva node instances
3. **Batch Updates** - Group multiple object updates into single frame
4. **Use React.memo** - Prevent unnecessary re-renders of object components

**Pros**: Minimal changes, keeps current architecture, achievable in sprint
**Cons**: Still has ceiling around 1000 objects

### Option B: Hybrid Approach (Post-MVP)

**Effort**: 8-16 hours

1. Implement simple viewport culling
2. Use tldraw's rendering patterns as inspiration
3. Keep existing Konva foundation

**Pros**: Better performance, learning opportunity
**Cons**: More complex, takes longer

### Option C: Full tldraw Migration (Not Recommended)

**Effort**: 40+ hours

**Pros**: Best performance, professional rendering
**Cons**: Complete rewrite, high risk, timeline impact

---

## Implementation Plan (Option A)

### Phase 1: Viewport Culling (1 hour)

**File**: `app/src/pages/BoardPage.tsx`

```typescript
// Calculate visible viewport bounds
const visibleBounds = useMemo(() => {
  const padding = 200 // Render slightly outside visible area
  return {
    xMin: -viewport.x / viewport.scale - padding,
    xMax: (-viewport.x + window.innerWidth) / viewport.scale + padding,
    yMin: -viewport.y / viewport.scale - padding,
    yMax: (-viewport.y + window.innerHeight) / viewport.scale + padding,
  }
}, [viewport, window.innerWidth, window.innerHeight])

// Filter objects to render
const visibleObjects = useMemo(() => {
  return objectsRef.current.filter(obj => {
    if (!obj.position || !obj.size) return true // Always render if no bounds
    const objX = obj.position.x
    const objY = obj.position.y
    return objX < visibleBounds.xMax && objX + obj.size.width > visibleBounds.xMin &&
           objY < visibleBounds.yMax && objY + obj.size.height > visibleBounds.yMin
  })
}, [objectsRef.current.length, visibleBounds])
```

**Impact**: Only render visible objects, O(n) check but大幅 reduces draw calls.

### Phase 2: Optimize Re-renders (30 min)

```typescript
// Memoize object rendering
const MemoizedObject = React.memo(({ boardObject, ... }) => {
  // ... existing render logic
}, (prev, next) => {
  return prev.boardObject.id === next.boardObject.id &&
         prev.boardObject.version === next.boardObject.version &&
         prev.selected === next.selected
})
```

### Phase 3: Batch Firestore Sync (30 min)

**File**: `app/src/hooks/useObjectSync.ts`

Debounce rapid Firestore updates:

```typescript
const syncDebounced = useMemo(() => debounce((snapshot) => {
  // Process snapshot
}, 100), [])
```

---

## Performance Tests to Add

**File**: `app/e2e/performance/scaling.spec.ts` (new)

```typescript
test('500 objects: drag FPS remains above 15', async ({ page }) => {
  // Test with 500 objects
  // Verify FPS threshold
})

test('viewport culling reduces render time with 1000 objects', async ({ page }) => {
  // Create 1000 objects spread across board
  // Measure FPS with only 50 in viewport
  // Verify 60 FPS despite 1000 total objects
})
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Lag with 100+ objects | Medium | Medium | Viewport culling |
| Memory leak with objects | Low | High | Proper cleanup in useEffect |
| Konva performance ceiling | High | Medium | Consider tldraw for Phase 2 |

---

## Conclusion

**Current Status**: ✅ **Adequate for MVP/Sprint**

- 100 objects tested and working
- 60 FPS with 20 objects
- 30+ FPS with 100 objects

**Recommendation**: Implement Option A (viewport culling) to safely handle 500+ objects. tldraw migration not needed for this sprint but could be considered for Phase 2 if scaling requirements increase.

---

## References

- `app/e2e/performance/large-board.spec.ts` - 100-object stress test
- `app/e2e/performance/rendering.spec.ts` - FPS measurements
- `app/test/requirements-performance-thresholds.test.mjs` - Throttling guardrails
- `app/src/hooks/usePresence.ts:84` - Cursor throttle
- `app/src/pages/BoardPage.tsx:2292` - Drag throttle
