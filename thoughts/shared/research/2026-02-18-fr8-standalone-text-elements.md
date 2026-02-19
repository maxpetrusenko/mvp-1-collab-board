# FR-8 Standalone Text Elements - Research

**Date**: 2026-02-18
**Requirement**: FR-8 - "Support frames/connectors/text elements in post-MVP phase"
**Current Status**: IMPLEMENTED - Standalone text has explicit toolbar popover creation with arbitrary text/color/font-size options

---

## Current State

### Type Definition

**board.ts:1**:
```typescript
export type BoardObjectKind = 'stickyNote' | 'shape' | 'frame' | 'connector' | 'text'
```

Text is defined as a first-class `BoardObjectKind`.

### TextObject Type

**board.ts:63-68**:
```typescript
export type TextObject = BoardObjectBase & {
  type: 'text'
  text: string
  color: string
  fontSize?: number
}
```

Text objects have:
- `text` content
- `color` for text color
- Optional `fontSize` (defaults to 24 in rendering)

### Rendering Support

**BoardPage.tsx:4189-4194**:
```typescript
if (boardObject.type === 'text') {
  const fontSize = Math.max(12, boardObject.fontSize || 24)
  const rotation = boardObject.rotation || 0
  // ... renders Text component
}
```

Text objects ARE rendered when they exist.

### Inline Editing Support

**BoardPage.tsx:893-895**:
```typescript
if (selectedObject.type === 'text') {
  return TEXT_COLOR_OPTIONS
}
```

**BoardPage.tsx:951-957**:
```typescript
if (inlineEditor.field === 'text' && inlineEditorTarget.type === 'text') {
  return {
    left: objectLeft,
    top: objectTop,
    // ...
  }
}
```

Text objects support inline editing.

---

## Gap Analysis

### Missing: UI Creation Method

**Problem**: There is no UI button or keyboard shortcut to create standalone text elements.

**Evidence**:
- Toolbar has buttons for: sticky note, frame, AI commands, selection, zoom
- No "add text" button
- No keyboard shortcut (e.g., 'T') for text creation

**Result**: Users can only create text via AI commands, not manual UI.

### Creation Methods

| Object Type | Toolbar Button | Keyboard Shortcut | AI Command |
|-------------|----------------|-------------------|------------|
| Sticky Note | ✅ | S | ✅ |
| Frame | ✅ | F | ✅ |
| Text | ❌ | ❌ | ✅ (implicitly) |

### AI Command Support

AI commands CAN create text objects through the tool registry:
- `createObject` with `type: 'text'`

**Issue**: Manual users (not using AI) have no way to create text.

---

## Implementation Options

### Option A: Add Toolbar Button (Recommended)

Add a "Add Text" button to the toolbar.

**UI Changes**:
1. Add text button to toolbar section
2. Icon: `Type` (already imported from lucide-react)
3. Keyboard shortcut: `T`
4. Click creates text at center of viewport

**Behavior**:
- Default text: "Double-click to edit"
- Default color: First `TEXT_COLOR_OPTIONS` value
- Default position: Center of visible viewport
- Default size: ~200x50 (auto-resizes to content)

**Pros**:
- Consistent with existing UI patterns
- Keyboard shortcut matches common design tools (Figma, Miro)
- Simple to implement

**Cons**:
- Toolbar already has many buttons (may need reorganization)

### Option B: Double-Click Canvas to Create Text

Double-clicking empty canvas creates text at that position.

**Pros**:
- No toolbar button needed
- Intuitive for many users
- Positions text exactly where clicked

**Cons**:
- Conflicts with other double-click behaviors
- Less discoverable
- May need mode toggle (text mode vs select mode)

### Option C: Text-Only via AI

Keep text as AI-only feature.

**Pros**:
- No UI changes needed
- Encourages AI usage

**Cons**:
- Not a "first-class" object type
- Breaks FR-8 requirement (text elements should be supported)
- Poor UX for users who don't want AI

---

## Recommended Implementation: Option A

Add toolbar button + keyboard shortcut for text creation.

### Phase 1: Basic Text Creation

1. **Add text button to toolbar**
   - Icon: `<Type size={16} />`
   - Tooltip: "Add text (T)"
   - Position: Next to frame button

2. **Add keyboard shortcut**
   - Press `T` to create text at viewport center
   - Auto-focus inline editor for immediate typing

3. **Default text properties**
   - Text: "Text" (or empty for immediate typing)
   - Color: `#0f172a` (first TEXT_COLOR_OPTIONS)
   - Font size: 24
   - Position: Center of viewport

### Phase 2: Auto-Resize Behavior

Text objects should auto-resize based on content.

**Implementation**:
- Measure text width using canvas context or Konva Text measurement
- Update object `size` when text changes
- Add padding for visual comfort

### Phase 3: Styling Parity

Text objects should support:
- Color picker (change text color)
- Font size (maybe a slider or presets)
- Background color (optional, for readability)

---

## Files Requiring Changes

1. **BoardPage.tsx**:
   - Add `addText()` function
   - Add toolbar button
   - Add keyboard shortcut handler
   - Update text creation logic

2. **AI Commands** (optional):
   - Ensure "add text" command uses same creation path
   - Support "add text 'content'" syntax

3. **Tests**:
   - E2E test for text creation via button
   - E2E test for text creation via keyboard shortcut
   - E2E test for text editing and color change

---

## Implementation Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Toolbar button | Low | Follows existing pattern |
| Keyboard shortcut | Low | Add to keydown handler |
| Text creation function | Low | Reuse existing writeBoardObject |
| Auto-resize | Medium | Need text measurement |
| Color change | Low | Already works (TEXT_COLOR_OPTIONS) |
| Font size UI | Medium | Need additional controls |

**Estimated effort**: 2-3 hours for basic button + shortcut

---

## Related Requirements

- FR-5: At least one shape type in MVP (text is a content object)
- FR-6: Create, move, edit, delete, duplicate objects
- FR-8: Support text elements
- FR-26: AI command panel (text should be creatable via AI too)

---

## References

- `app/src/types/board.ts:1` - BoardObjectKind includes 'text'
- `app/src/types/board.ts:63-68` - TextObject type definition
- `app/src/pages/BoardPage.tsx:4189-4194` - Text rendering
- `app/src/pages/BoardPage.tsx:893-895` - Text color options
- `app/src/pages/BoardPage.tsx:951-957` - Text inline editing
- `app/src/pages/BoardPage.tsx:1450` - Text inline editor field support
