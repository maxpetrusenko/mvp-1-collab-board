# BoardPage.tsx Refactoring Plan

**Status**: Planning Phase
**Target**: Reduce BoardPage.tsx from 7,625 LOC to <500 LOC
**Approach**: Incremental, test-driven, no breaking changes

---

## Current State Analysis

| File | LOC | Issues |
|------|-----|--------|
| BoardPage.tsx | 7,625 | 62 useState, 109 hooks, massive component |
| tool-registry.js | 417 | Acceptable (<500) |

**Key Problems:**
- 62 state declarations in one component
- 109 React hooks (useCallback, useMemo, useEffect)
- Mixed concerns: rendering, state management, business logic, AI commands
- No reusable sub-components
- Duplicate type definitions

---

## Refactoring Strategy

### Phase 1: Extract Constants & Types (~100 LOC saved)
**Files to create:**
- `app/src/pages/board/constants.ts` - All magic numbers, color arrays, thresholds
- `app/src/pages/board/types.ts` - Local types not in shared/types/board.ts

**No runtime impact** - pure extraction

### Phase 2: Extract Pure Utilities (~200 LOC saved)
**File to create:**
- `app/src/pages/board/utils.ts` - Pure functions (no React dependencies)

**Functions to extract:**
- `clamp()`, `isFinitePoint()`, `normalizeRotationDegrees()`
- `overlaps()`, `toConnectorBounds()`, `toConnectorPatch()`
- `getAnchorPointForBounds()`, `getAnchorPointForObject()`, `getObjectAnchors()`
- `getObjectBounds()`, `formatTimerLabel()`, `getColorLabel()`
- AI command parsers, board meta normalizers

**No runtime impact** - pure functions, already testable

### Phase 3: Extract Custom Hooks (~2,000 LOC saved)
**Files to create:**
- `app/src/pages/board/useTimer.ts` - Timer state & logic
- `app/src/pages/board/useViewport.ts` - Zoom, pan, stage sizing
- `app/src/pages/board/useBoardObjects.ts` - Object CRUD operations
- `app/src/pages/board/useBoardSelection.ts` - Selection state management
- `app/src/pages/board/useBoardSharing.ts` - Share dialogs, permissions
- `app/src/pages/board/useAICommands.ts` - AI command history & execution

**Each hook:**
- Encapsulates related state + operations
- Returns clean public API
- Testable in isolation

### Phase 4: Extract UI Components (~4,000 LOC saved)
**Files to create:**
```
app/src/pages/board/components/
├── BoardHeader.tsx          (toolbar, title, actions)
├── BoardCanvas.tsx          (Konva Stage, Layer rendering)
├── ObjectRenderer.tsx       (individual object rendering)
├── SelectionBox.tsx         (drag selection UI)
├── CreatePopover.tsx        (shape/connector/text creation)
├── CommentsPanel.tsx        (comments sidebar)
├── TimelinePanel.tsx        (activity timeline)
├── BoardsPanel.tsx          (board list/management)
├── ShareDialog.tsx          (share permissions)
├── CommandPalette.tsx       (keyboard shortcuts)
├── TemplateChooser.tsx      (board templates)
└── ShortcutsModal.tsx       (keyboard help)
```

**Resulting BoardPage.tsx:**
```tsx
export const BoardPage = () => {
  const hooks = useBoardHooks()
  return (
    <>
      <BoardHeader {...hooks.header} />
      <BoardCanvas {...hooks.canvas} />
      <CommentsPanel {...hooks.comments} />
      <TimelinePanel {...hooks.timeline} />
      {/* other panels */}
    </>
  )
}
```

### Phase 5: Extract Business Logic (~1,000 LOC saved)
**Files to create:**
- `app/src/pages/board/logic/objectOperations.ts` - Create, update, delete
- `app/src/pages/board/logic/connectorLogic.ts` - Connector snapping/anchoring
- `app/src/pages/board/logic/exportLogic.ts` - PDF/PNG export
- `app/src/pages/board/logic/keyboardShortcuts.ts` - Keybinding handling

---

## Execution Order

1. **Start with Phase 1** (constants) - zero risk
2. **Then Phase 2** (utilities) - zero risk, pure functions
3. **Then Phase 3** (hooks) - moderate risk, needs careful testing
4. **Then Phase 4** (components) - higher risk, visual testing needed
5. **Finally Phase 5** (business logic) - isolate complex algorithms

---

## Testing Strategy

**Before each phase:**
1. Run existing E2E tests: `npm run test:e2e`
2. Verify manual smoke test: create objects, drag, resize, AI commands

**After each extraction:**
1. Type-check: `npm run typecheck`
2. Lint: `npm run lint`
3. E2E regression: `npm run test:e2e`

**Stop points:**
- If tests fail → rollback, analyze, retry
- If build breaks → immediate rollback

---

## File Structure After Refactor

```
app/src/pages/board/
├── index.tsx                 (main BoardPage, ~150 LOC)
├── constants.ts              (~100 LOC)
├── types.ts                  (~50 LOC)
├── utils.ts                  (~200 LOC)
├── hooks/
│   ├── useTimer.ts           (~80 LOC)
│   ├── useViewport.ts        (~120 LOC)
│   ├── useBoardObjects.ts    (~250 LOC)
│   ├── useBoardSelection.ts  (~180 LOC)
│   ├── useBoardSharing.ts    (~200 LOC)
│   └── useAICommands.ts      (~150 LOC)
├── components/
│   ├── BoardHeader.tsx       (~200 LOC)
│   ├── BoardCanvas.tsx       (~300 LOC)
│   ├── ObjectRenderer.tsx    (~250 LOC)
│   ├── SelectionBox.tsx      (~80 LOC)
│   ├── CreatePopover.tsx     (~180 LOC)
│   ├── CommentsPanel.tsx     (~200 LOC)
│   ├── TimelinePanel.tsx     (~150 LOC)
│   ├── BoardsPanel.tsx       (~250 LOC)
│   ├── ShareDialog.tsx       (~180 LOC)
│   ├── CommandPalette.tsx    (~150 LOC)
│   ├── TemplateChooser.tsx   (~120 LOC)
│   └── ShortcutsModal.tsx    (~100 LOC)
└── logic/
    ├── objectOperations.ts   (~200 LOC)
    ├── connectorLogic.ts     (~180 LOC)
    ├── exportLogic.ts        (~150 LOC)
    └── keyboardShortcuts.ts  (~120 LOC)
```

**Total: ~3,500 LOC across 25 files, each <300 LOC**

---

## Success Criteria

- [ ] BoardPage.tsx < 500 LOC
- [ ] All E2E tests passing
- [ ] No visual regressions
- [ ] No performance degradation
- [ ] Each file < 300 LOC (except maybe BoardCanvas.tsx)
- [ ] All exports clearly named and documented
- [ ] No circular dependencies

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking complex interactions | Incremental extraction, test after each step |
| Performance regression | Profile before/after, useMemo/useCallback where needed |
| Circular dependencies | Careful import planning, use barrel exports (index.ts) |
| Lost context during moves | Keep git history, use `git mv` for renames |

---

## Next Steps

1. Review this plan with team/stakeholders
2. Run full E2E suite to establish baseline
3. Create feature branch: `refactor/boardpage-modularization`
4. Start Phase 1 (constants extraction)
