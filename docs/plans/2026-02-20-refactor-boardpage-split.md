# BoardPage.tsx Refactoring Plan

## Overview

Refactor the monolithic `BoardPage.tsx` file (6,917 lines, 262KB) into ~25-30 focused modules, each under 500 LOC per project guidelines.

## Current State Analysis

**File**: `app/src/pages/BoardPage.tsx`
- **Lines**: 6,917 (13x over 500 LOC guideline)
- **React hooks**: 37 useState, 18 useRef, 15 useEffect, 70+ useCallback, 24 useMemo
- **Functions**: 70+ callback functions, 20 utility functions
- **JSX**: 600+ lines of inline Konva rendering

### Key Discoveries:
- All object rendering (sticky, shape, frame, connector, text) is inline
- State management is centralized but complex (100+ state pieces)
- Event handling scattered throughout the file
- No component extraction - all UI inline in one file

## Desired End State

A modular directory structure with:
```
src/pages/BoardPage/
├── index.tsx                    # Main orchestrator (~200 LOC)
├── hooks/                       # Custom hooks (8 files, ~1500 LOC)
├── components/                  # UI components (12 files, ~2000 LOC)
├── canvas/                      # Canvas renderers (10 files, ~1500 LOC)
└── utils/                       # Utilities (7 files, ~800 LOC)
```

Each module < 500 LOC, testable in isolation, clear responsibility.

## What We're NOT Doing

- Changing functionality or behavior
- Rewriting the component architecture (React + Konva stays)
- Performance optimizations (deferred to separate work)
- Adding new features

## Implementation Approach

**Incremental extraction with continuous testing**:
1. Extract utilities first (no React dependencies)
2. Extract custom hooks (state logic extraction)
3. Extract UI components (presentational)
4. Extract canvas renderers (Konva components)
5. Clean up main orchestrator

Each phase maintains passing tests throughout.

## Phase 1: Utility Modules (No React Dependencies)

### 1.1 Extract `board-constants.ts`
**File**: `src/pages/BoardPage/utils/board-constants.ts`
**Lines**: ~100 LOC from current lines 168-253

**Changes**:
- Move all constants: `RESIZE_HANDLE_SIZE`, `ROTATION_HANDLE_*`, `MIN/MAX_*_SCALE`
- Move color arrays: `STICKY_COLOR_OPTIONS`, `SHAPE_COLOR_OPTIONS`
- Move options arrays: `selectedShapeOptions`, `selectedColorOptions`
- Move magic numbers: `DEFAULT_*` values

### 1.2 Extract `board-geometry.ts`
**File**: `src/pages/BoardPage/utils/board-geometry.ts`
**Lines**: ~200 LOC from current lines 343-519

**Changes**:
- Move `clamp`, `isFinitePoint`, `overlaps`
- Move `getObjectBounds`, `toConnectorBounds`, `toConnectorPatch`
- Move `getObjectAnchors`, `getAnchorPointForObject`

### 1.3 Extract `board-normalizers.ts`
**File**: `src/pages/BoardPage/utils/board-normalizers.ts`
**Lines**: ~150 LOC from current lines 429-599, 2481-2535

**Changes**:
- Move `normalizeAnchorKind`, `normalizeShapeKind`, `normalizeConnectorStyle`
- Move `normalizeSharedWith`, `normalizeSharedRoles`
- Move `toBoardMeta`, `canAccessBoardMeta`

### 1.4 Extract `board-timer.ts`
**File**: `src/pages/BoardPage/utils/board-timer.ts`
**Lines**: ~100 LOC from current lines 520-527, 3931-3984

**Changes**:
- Move `formatTimerLabel`
- Move timer-related constants

### 1.5 Extract `ai-commands.ts`
**File**: `src/pages/BoardPage/utils/ai-commands.ts`
**Lines**: ~150 LOC from current lines 255-333, 4500-4608

**Changes**:
- Move `sanitizeAiStickyText`, `parseLocalMultiStickyCommand`
- Move `calculateRotationAngle`, `calculateRotationFromHandleTarget`

### Success Criteria - Phase 1:
- [ ] All utility modules created in `src/pages/BoardPage/utils/`
- [ ] `npm run build` passes
- [ ] `npm run test:e2e` passes (no behavioral changes)
- [ ] No imports reference old locations
- [ ] TypeScript no errors

---

## Phase 2: Custom Hooks (State Logic Extraction)

### 2.1 Extract `useVoteConfetti.ts`
**File**: `src/pages/BoardPage/hooks/useVoteConfetti.ts`
**Lines**: ~100 LOC from current lines 1078-1120, 3986-4018

**Changes**:
- Extract confetti particle system
- Expose `launchVoteConfetti`, `VoteConfettiParticles` state

### 2.2 Extract `useBoardTimer.ts`
**File**: `src/pages/BoardPage/hooks/useBoardTimer.ts`
**Lines**: ~100 LOC from current lines 3931-3984

**Changes**:
- Extract timer state management
- Expose `timerState`, `startTimer`, `pauseTimer`, `resetTimer`

### 2.3 Extract `useSelectionBox.ts`
**File**: `src/pages/BoardPage/hooks/useSelectionBox.ts`
**Lines**: ~150 LOC from current lines 1943-2007

**Changes**:
- Extract marquee selection logic
- Expose `selectionBox`, `startSelectionBox`, `updateSelectionBox`, `completeSelectionBox`, `clearSelectionBox`

### 2.4 Extract `useKeyboardShortcuts.ts`
**File**: `src/pages/BoardPage/hooks/useKeyboardShortcuts.ts`
**Lines**: ~200 LOC from current lines 3643-3860

**Changes**:
- Extract global keyboard handler
- Keep `isEditableTarget` guard in main file (accesses refs)
- Expose bound keyboard handlers

### 2.5 Extract `useBoardViewport.ts`
**File**: `src/pages/BoardPage/hooks/useBoardViewport.ts`
**Lines**: ~250 LOC from current lines 1870-1926, 3350-3450

**Changes**:
- Extract zoom/pan/momentum logic
- Expose `viewport`, `zoomIn`, `zoomOut`, `zoomReset`, `zoomToFit`

### 2.6 Extract `useBoardHistory.ts`
**File**: `src/pages/BoardPage/hooks/useBoardHistory.ts`
**Lines**: ~150 LOC from current lines 3286-3350

**Changes**:
- Extract undo/redo stack management
- Expose `canUndo`, `canRedo`, `undo`, `redo`

### 2.7 Extract Transform Hooks
**File**: `src/pages/BoardPage/hooks/useObjectDrag.ts`
**Lines**: ~250 LOC from current lines 4308-4400

**Changes**:
- Extract single/multi-drag with frame member tracking
- Expose `beginObjectDrag`, `moveObjectDrag`, `endObjectDrag`

**File**: `src/pages/BoardPage/hooks/useObjectResize.ts`
**Lines**: ~150 LOC

**Changes**:
- Extract resize with local override pattern
- Expose `resizeObjectLocal`, `commitResizeObject`

**File**: `src/pages/BoardPage/hooks/useObjectRotation.ts`
**Lines**: ~150 LOC

**Changes**:
- Extract rotation logic
- Expose `rotateSelectionBy`

### 2.8 Extract `useBoardObjects.ts`
**File**: `src/pages/BoardPage/hooks/useBoardObjects.ts`
**Lines**: ~300 LOC from current lines 1243-1400, plus object CRUD

**Changes**:
- Extract object CRUD operations
- Extract selection state management
- Expose `selectObjectId`, `createObject`, `deleteSelected`, `patchObject`, `duplicateObject`

### Success Criteria - Phase 2:
- [ ] All custom hooks created in `src/pages/BoardPage/hooks/`
- [ ] `npm run build` passes
- [ ] `npm run test:e2e` passes
- [ ] Each hook exports focused interface
- [ ] No prop drilling or unnecessary re-renders

---

## Phase 3: UI Component Extraction

### 3.1 Extract `ShortcutsModal.tsx`
**File**: `src/pages/BoardPage/components/ShortcutsModal.tsx`
**Lines**: ~100 LOC from current lines 7260-7282

### 3.2 Extract `ZoomControls.tsx`
**File**: `src/pages/BoardPage/components/ZoomControls.tsx`
**Lines**: ~100 LOC from current lines 7025-7068

### 3.3 Extract `BoardMinimap.tsx`
**File**: `src/pages/BoardPage/components/BoardMinimap.tsx`
**Lines**: ~150 LOC from current lines 7070-7124

### 3.4 Extract `ObjectContextMenu.tsx`
**File**: `src/pages/BoardPage/components/ObjectContextMenu.tsx`
**Lines**: ~150 LOC from current lines 6845-6948

### 3.5 Extract `BoardToolbar.tsx`
**File**: `src/pages/BoardPage/components/BoardToolbar.tsx`
**Lines**: ~250 LOC from current lines 5200-5659

### 3.6 Extract `BoardHeader.tsx`
**File**: `src/pages/BoardPage/components/BoardHeader.tsx`
**Lines**: ~200 LOC from current lines 4770-4901

### 3.7 Extract Side Panels
**Files**:
- `src/pages/BoardPage/components/CommentsPanel.tsx` (~150 LOC)
- `src/pages/BoardPage/components/TimelinePanel.tsx` (~150 LOC)

### 3.8 Extract `BoardsPanel.tsx`
**File**: `src/pages/BoardPage/components/BoardsPanel.tsx`
**Lines**: ~350 LOC from current lines 4902-5098

### 3.9 Extract `CommandPalette.tsx`
**File**: `src/pages/BoardPage/components/CommandPalette.tsx`
**Lines**: ~200 LOC from current lines 5099-5198

### Success Criteria - Phase 3:
- [ ] All components created in `src/pages/BoardPage/components/`
- [ ] `npm run build` passes
- [ ] `npm run test:e2e` passes
- [ ] Components accept props (no direct state access)
- [ ] No visual regressions

---

## Phase 4: Canvas Renderer Extraction

### 4.1 Extract Object Renderers
**Files**:
- `src/pages/BoardPage/canvas/StickyNoteRenderer.tsx` (~200 LOC)
- `src/pages/BoardPage/canvas/ShapeRenderer.tsx` (~200 LOC)
- `src/pages/BoardPage/canvas/FrameRenderer.tsx` (~150 LOC)
- `src/pages/BoardPage/canvas/TextRenderer.tsx` (~150 LOC)
- `src/pages/BoardPage/canvas/ConnectorRenderer.tsx` (~200 LOC)

**Changes**:
- Extract inline Konva JSX to components
- Pass position, size, rotation, selection state as props
- Keep event handlers passed as callbacks

### 4.2 Extract Layer Components
**Files**:
- `src/pages/BoardPage/canvas/SelectionLayer.tsx` (~100 LOC)
- `src/pages/BoardPage/canvas/PresenceLayer.tsx` (~100 LOC)
- `src/pages/BoardPage/canvas/ConfettiLayer.tsx` (~100 LOC)

### 4.3 Extract `BoardStage.tsx`
**File**: `src/pages/BoardPage/canvas/BoardStage.tsx`
**Lines**: ~150 LOC wrapper for Stage

### Success Criteria - Phase 4:
- [ ] All canvas components created
- [ ] `npm run build` passes
- [ ] `npm run test:e2e` passes
- [ ] Konva rendering unchanged
- [ ] Performance maintained (viewport culling still works)

---

## Phase 5: Main Component Cleanup

**File**: `src/pages/BoardPage/index.tsx`
**Target**: ~200 LOC

**Changes**:
- Import all extracted modules
- Wire up state with hooks
- Render composed JSX
- Remove extracted code

### Success Criteria - Phase 5 (Final):
- [ ] Main file under 300 LOC
- [ ] All tests pass
- [ ] Bundle size unchanged or reduced
- [ ] No console warnings/errors
- [ ] TypeScript strict mode clean

---

## Testing Strategy

### Automated Verification:
- [ ] `npm run build` passes after each phase
- [ ] `npm run test:e2e` passes after each phase
- [ ] No TypeScript errors
- [ ] No ESLint warnings

### Manual Verification:
- [ ] Board loads and displays objects correctly
- [ ] All interactions work (drag, resize, rotate, select)
- [ ] AI commands function
- [ ] Multiplayer cursors visible
- [ ] Performance acceptable with 100+ objects

---

## Performance Considerations

**Maintain existing optimizations**:
- Viewport culling (renderObjects useMemo)
- Local override pattern for drag/resize/rotate
- Request animation frame cleanup
- Efficient re-renders via useMemo

**Do NOT change during refactoring**:
- Rendering performance characteristics
- Memory usage patterns
- Bundle size

---

## Migration Notes

This is a pure code organization refactoring:
- No data migration needed
- No API changes
- No user-facing changes
- Can be deployed incrementally by phase

**Rollback strategy**: Keep each phase in a separate branch, merge to main after verification.

---

## References

- Source audit: Codebase audit (2026-02-20)
- Issue: C-001 in codebase audit
- File: `app/src/pages/BoardPage.tsx` (6,917 lines)
- Guidelines: `CLAUDE.md` - keep files <500 LOC
