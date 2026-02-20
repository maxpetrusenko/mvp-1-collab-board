# Local State Persistence Implementation Plan

## Overview

Implement localStorage persistence for transient state in BoardPage.tsx to improve UX. Currently 20+ state pieces are lost on refresh, causing users to lose their work context.

**Goal**: Persist meaningful state (selection, viewport, drafts) so users don't lose context on refresh.

## Current State Analysis

### Existing Persistence (Working)
- ✅ `themeMode` (light/dark) - persisted to `collabboard-theme`
- ✅ `lastBoardId` - persisted per-user with `collabboard-last-board-id:{uid}`

### Transient State Lost on Refresh (Issue H-004)
| State | Type | Priority | Impact |
|-------|------|----------|-------|
| **viewport** | `{x, y, scale}` | HIGH | User loses their place on board |
| **selectedIds** | `string[]` | MEDIUM | Multi-selection lost |
| **commentDraft** | `string` | MEDIUM | In-progress comment lost |
| **showCommentsPanel** | `boolean` | MEDIUM | Panel state resets |
| **showTimelinePanel** | `boolean` | MEDIUM | Panel state resets |
| **interactionMode** | `'edit'\|'view'` | LOW-MEDIUM | View mode resets |
| **selectionMode** | `'select'\|'area'` | LOW | Tool preference lost |

### States That Should NOT Be Persisted
- All active drag/resize/rotate states (transient by design)
- All form drafts (intentionally ephemeral)
- All modal states (intentionally ephemeral)
- `inlineEditor` (risk of data loss on refresh)
- `clipboardObject` (session-scoped)
- AI command history (session-scoped)

## Desired End State

After refresh, users should see:
1. Same viewport position (zoom/pan)
2. Same objects selected (if they still exist)
3. Same side panel open (comments/timeline)
4. View/edit mode preserved
5. Comment drafts restored

### Verification
- Refresh board → viewport at same position
- Select 3 objects → refresh → all 3 still selected
- Open timeline panel → refresh → timeline still open
- Start typing comment → refresh → draft restored

## What We're NOT Doing

- Persisting active drag/resize/rotate states (doesn't make sense)
- Persisting form drafts (intentionally ephemeral)
- Persisting modal states (intentionally ephemeral)
- Changing how authentication works
- Modifying the URL structure

## Implementation Approach

**Pattern**: Create reusable `useBoardLocalStorage` hook following existing theme/last-board patterns.

**Storage Keys**: `collabboard-{key}:{boardId}` for per-board state, `collabboard-{key}` for global preferences.

**Save Strategy**: Immediate save on change (debounced for viewport to avoid excessive writes).

**Restore Strategy**: On mount after YJS sync completes, validate IDs exist before restoring.

## Phase 1: Create Reusable Hook

### 1.1 Create `useBoardLocalStorage.ts`
**File**: `src/hooks/useBoardLocalStorage.ts`

**Changes**:
- Create hook with generic type parameter
- Support serialize/deserialize functions
- Include debounce option
- Auto-save on value change
- Restore from localStorage on mount

```typescript
interface UseBoardLocalStorageOptions<T> {
  key: string
  defaultValue: T
  boardId?: string
  serialize?: (value: T) => string
  deserialize?: (raw: string) => T
  debounceMs?: number
}
```

### Success Criteria - Phase 1:
- [ ] Hook created at `src/hooks/useBoardLocalStorage.ts`
- [ ] TypeScript compiles without errors
- [ ] Hook exports `[value, setValue, isRestored, clearValue]`

---

## Phase 2: Persist Viewport State

### 2.1 Apply hook to viewport
**File**: `src/pages/BoardPage.tsx`

**Changes**:
- Replace `useState` for viewport with `useBoardLocalStorage`
- Key: `collabboard-viewport`
- Debounce: 300ms (prevent excessive writes during zoom momentum)
- Restore on mount after objects loaded
- Clamp to min/max scale bounds on restore

### Success Criteria - Phase 2:
- [ ] Viewport persists across refresh
- [ ] Zoom level maintained
- [ ] Pan position maintained
- [ ] Bounds respected after restore
- [ ] No performance regression

---

## Phase 3: Persist Selection State

### 3.1 Apply hook to selectedIds
**File**: `src/pages/BoardPage.tsx`

**Changes**:
- Replace `useState` for selectedIds with `useBoardLocalStorage`
- Key: `collabboard-selection`
- No debounce (immediate save)
- Restore on mount, validate IDs exist
- Filter out deleted objects during restore

### Success Criteria - Phase 3:
- [ ] Selection persists across refresh
- [ ] Single selection maintained
- [ ] Multi-selection maintained
- [ ] Invalid IDs filtered out
- [ ] Empty array if no valid selection

---

## Phase 4: Persist Panel State

### 4.1 Persist side panel state
**File**: `src/pages/BoardPage.tsx`

**Changes**:
- Replace `useState` for showCommentsPanel/showTimelinePanel
- Store as enum: `'comments' | 'timeline' | null`
- Key: `collabboard-panel`
- Restore on mount

### Success Criteria - Phase 4:
- [ ] Active panel restored on refresh
- [ ] Panel toggle state preserved
- [ ] Default to null (no panel) if no state

---

## Phase 5: Persist Interaction/Selection Mode

### 5.1 Persist interactionMode
**Changes**:
- Replace `useState` for interactionMode
- Key: `collabboard-mode`
- Restore before role check (role check can override)

### 5.2 Persist selectionMode
**Changes**:
- Replace `useState` for selectionMode
- Key: `collabboard-selection-mode` (global, not per-board)
- Restore on mount

### Success Criteria - Phase 5:
- [ ] View/edit mode toggles persist
- [ ] Selection mode preference persists
- [ ] Role checks still override view mode appropriately

---

## Phase 6: Persist Comment Draft

### 6.1 Apply hook to commentDraft
**File**: `src/pages/BoardPage.tsx`

**Changes**:
- Replace `useState` for commentDraft with `useBoardLocalStorage`
- Key: `collabboard-comment-draft`
- Debounce: 500ms OR save on blur
- Clear after successful comment submission

### Success Criteria - Phase 6:
- [ ] Comment drafts persist across refresh
- [ ] Draft cleared after comment submitted
- [ ] No duplicate drafts created

---

## Testing Strategy

### Automated Verification:
- [ ] `npm run build` passes
- [ ] `npm run test:e2e` passes (no behavioral changes)
- [ ] TypeScript strict mode clean
- [ ] No new ESLint warnings

### Manual Verification:
- [ ] Refresh maintains viewport position
- [ ] Refresh maintains selection
- [ ] Refresh maintains open panels
- [ ] Comment draft restored after refresh
- [ ] State cleared when switching boards
- [ ] Invalid selection filtered out

### Edge Cases to Test:
- [ ] Select 3 objects, delete 1, refresh → 2 remaining selected
- [ ] Zoom to 200%, refresh → zoom level maintained
- [ ] Open timeline, refresh → timeline still open
- [ ] Type comment, refresh, submit → draft works
- [ ] Switch boards → old state cleared, new board doesn't inherit

---

## Performance Considerations

**localStorage quotas**:
- 5-10MB typical per domain
- Each entry ~100-200 bytes (JSON stringified)
- We'll add ~6 entries per board × user boards = negligible impact

**Debounce strategy**:
- viewport: 300ms (prevents excessive writes during zoom momentum)
- commentDraft: 500ms (prevents excessive writes while typing)
- All others: immediate (selection, panels, modes)

**Memory cleanup**:
- When switching boards, clear old board's storage from localStorage
- Optional: `clearBoardStorage(boardId)` utility

---

## Migration Notes

**Breaking changes**: None. This is purely additive.

**Data migration**: None needed. State will be restored on first visit after deployment.

**Rollback**: Remove hook usage, state reverts to transient behavior (no localStorage pollution).

---

## References

- Issue: H-004 in codebase audit
- File: `app/src/pages/BoardPage.tsx` (~7,500 LOC)
- Pattern: Existing theme/last-board persistence (lines 669-680, 804, 810)
- Related: CLAUDE.md guidelines
