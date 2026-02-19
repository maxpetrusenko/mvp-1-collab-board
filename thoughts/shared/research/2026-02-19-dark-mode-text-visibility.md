# Dark Mode Text Visibility Issues

**Date**: 2026-02-19
**Issue**: Comment text input and display have dark/invisible text in dark mode

## Root Causes Identified

### 1. Missing `color` property on `.ai-input` (CRITICAL)

**File**: `app/src/styles.css:1752`

```css
.ai-input {
  min-height: 96px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  font: inherit;
  font-size: 0.95rem;
  resize: vertical;
  transition: all var(--transition-fast);
  background: var(--color-surface);
  /* MISSING: color: var(--color-text-primary); */
}
```

**Impact**: The comment textarea (`className="ai-input comment-input"`) has no explicit text color. It relies on parent inheritance, which may not work correctly in dark mode. In dark mode, if the parent doesn't have a proper color set, the text could inherit a dark color making it invisible against the dark background.

**Used by**:
- Comment input in BoardPage.tsx:7238
- Any AI command panel text inputs

### 2. Comment display text contrast

**File**: `app/src/styles.css:1634-1639`

```css
.comment-item p {
  margin: var(--space-xs) 0 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
```

**Analysis**: Uses `--color-text-secondary` which is:
- Light mode: `#6B7280` (medium gray)
- Dark mode: `#9ca3af` (medium gray)

This should be visible, but may have low contrast depending on the background. The `.comment-item` background is `var(--color-surface-elevated)` which is `#111827` in dark mode. The contrast ratio between `#9ca3af` and `#111827` is approximately 7.2:1, which meets WCAG AA standards.

### 3. Other text inputs that ARE properly styled

These inputs have explicit `color` properties set correctly:
- `.board-field input/textarea/select` (line 1000-1011): Has `color: var(--color-text-primary)`
- `.inline-editor` (line 1382-1393): Has `color: var(--color-text-primary)`
- `.toolbar-popover-content` (line 1160-1165): Has `color: var(--color-text-primary)`

### 4. Hardcoded canvas colors

**File**: `app/src/pages/BoardPage.tsx`

Multiple hardcoded colors that don't respect dark mode:
- Line 5890: `fill="#1d4ed8"` (blue)
- Line 5895: `fill="#ffffff"` (white)
- Line 5988: `stroke="#1d4ed8"` (blue)
- Line 6888: `fill="#ffffff"` (white)

These are for Konva canvas elements and may need theme-aware colors.

## Files to Fix

1. **app/src/styles.css** - Add `color: var(--color-text-primary);` to `.ai-input` rule
2. **app/src/pages/BoardPage.tsx** - Review hardcoded fill/stroke colors for canvas elements

## Additional Investigation Needed

- The user mentioned "multiple people can't comment" - need to verify if this is purely a UI visibility issue or if there's also a backend/permission issue with commenting

## CSS Variable Reference

Dark mode colors (from `:root[data-theme='dark']`):
```css
--color-text-primary: #e5e7eb;
--color-text-secondary: #9ca3af;
--color-text-tertiary: #6b7280;
--color-surface: #0b1220;
--color-surface-elevated: #111827;
```
