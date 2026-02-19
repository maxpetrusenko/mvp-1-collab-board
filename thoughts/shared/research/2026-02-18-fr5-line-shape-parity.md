# FR-5 Line Shape Object Parity - Research

**Date**: 2026-02-18
**Requirement**: FR-5 - "At least one shape type in MVP; full pass targets rectangle/circle/line"
**Current Status**: IMPLEMENTED - line shape is handled as full shape parity in creation/edit/render/test flows

---

## Current State

### Type Definition

**board.ts:2**:
```typescript
export type ShapeKind = 'rectangle' | 'circle' | 'diamond' | 'triangle' | 'line'
```

Line is defined as a `ShapeKind`, which means it should have parity with other shapes.

### ShapeObject Type

**board.ts:50-55**:
```typescript
export type ShapeObject = BoardObjectBase & {
  type: 'shape'
  shapeType: ShapeKind
  color: string
  text?: string
}
```

All shapes share the same schema. Line should support:
- `color`
- `text` (inline editable)
- All shape operations (move, resize, rotate, delete, duplicate)

### Default Shape Sizes

**BoardPage.tsx:194-200**:
```typescript
const DEFAULT_SHAPE_SIZES: Record<ShapeKind, { width: number; height: number }> = {
  rectangle: { width: 180, height: 110 },
  circle: { width: 130, height: 130 },
  diamond: { width: 170, height: 120 },
  triangle: { width: 170, height: 120 },
  line: { width: 220, height: 24 },
}
```

Line has a default size of 220x24px.

---

## Gap Analysis

### 1. Rendering

Lines are rendered differently from other shapes. They use `Line` Konva component instead of filled shapes.

**Expected behavior for full parity**:
- Line should be selectable (click to select)
- Line should show selection outline
- Line should support color changes
- Line should support inline text editing
- Line should support rotation

### 2. Inline Text Editing

**BoardPage.tsx:939-947** shows shape text editing:
```typescript
if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'shape') {
  const inset = 10 * viewport.scale
  return {
    left: objectLeft + inset,
    // ...
  }
}
```

This applies to all `shape` types. **Question**: Does the line rendering support showing text overlay?

### 3. Selection Visuals

**BoardPage.tsx:4189+** shows rendering for `text` type with special handling. Line shapes need similar treatment for:
- Selection outline (lines may need special bounding box)
- Resize handles (line has start/end points, not corner-based resize)

### 4. Color Change

Line shapes should respond to color picker changes. The color options apply to all selected shapes:
**BoardPage.tsx:886-891**:
```typescript
if (selectedObject.type === 'shape') {
  return SHAPE_COLOR_OPTIONS
}
```

This should work for line shapes since they are `type: 'shape'`.

---

## Implementation Options

### Option A: Line as Vector Path (Current)

Keep line as a `Line` Konva component (drawn from point A to point B).

**Pros**:
- Matches mental model of "line"
- Efficient rendering
- Simple start/end positioning

**Cons**:
- Text overlay positioning is tricky (line has no "body")
- Selection outline is non-standard
- Resize works differently (drag endpoints vs corners)
- Width is line thickness, not bounding box

### Option B: Line as Thin Rectangle (Recommended for Parity)

Render line as a thin filled rectangle with rounded ends.

**Pros**:
- Full feature parity: selection, text, resize all work the same
- Consistent UX with other shapes
- Text centers naturally in the rectangle body
- Color fill works identically

**Cons**:
- Not a "true" vector line
- Slightly different visual (may need rounded corners)

### Option C: Hybrid - Connector for Lines

Use the connector system for "lines" and keep shape as only closed shapes.

**Pros**:
- Separates concerns (lines = connectors, shapes = closed areas)
- Connectors already have start/end point model

**Cons**:
- Changes the type system (line is no longer a shape)
- May break existing AI commands that reference "line shape"

---

## Recommended Implementation: Option A with Parity Enhancements

Keep line as a `Line` component but add parity features:

### Phase 1: Visual Selection Parity

1. **Add selection outline** for line shapes
   - Draw a bounding box around the line when selected
   - Show resize handles at both endpoints

2. **Add color indicator**
   - Line stroke color changes with color picker
   - Match color options to other shapes

### Phase 2: Text Support

1. **Add text overlay** for line shapes
   - Position text at the midpoint of the line
   - Use semi-transparent background for readability
   - Support inline editing like other shapes

### Phase 3: Operations

1. **Rotation support**
   - Rotate line around its center point
   - Update start/end coordinates accordingly

2. **Resize via endpoints**
   - Drag start handle to move start point
   - Drag end handle to move end point
   - Maintain visual feedback during drag

---

## Files Requiring Changes

1. **Rendering**: `BoardPage.tsx` - Line shape rendering with selection/outline
2. **Selection**: Add line-specific selection bounding box logic
3. **Inline Editor**: Position text at line midpoint
4. **Resize**: Endpoint-based resize for lines
5. **AI Commands**: Ensure "create line" commands work properly
6. **Tests**: Add line-specific E2E tests (create, select, edit text, color, delete)

---

## Implementation Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Selection outline | Medium | Line needs custom bounding box |
| Color change | Low | Already works via shape type |
| Text overlay | Medium | Need midpoint calculation |
| Endpoint resize | Medium | Different from corner resize |
| Rotation | High | Need to update start/end coordinates |
| AI command support | Low | Already creates shapes with line type |

**Estimated effort**: 3-4 hours for visual + text parity

---

## Related Requirements

- FR-5: At least one shape type in MVP; full pass targets rectangle/circle/**line**
- FR-6: Create, move, edit, delete, duplicate objects
- FR-7: Single-select and multi-select

---

## References

- `app/src/types/board.ts:2` - ShapeKind definition
- `app/src/types/board.ts:50-55` - ShapeObject type
- `app/src/pages/BoardPage.tsx:194-200` - Default shape sizes
- `app/src/pages/BoardPage.tsx:939-947` - Shape text editing
- `app/src/pages/BoardPage.tsx:886-891` - Shape color options
