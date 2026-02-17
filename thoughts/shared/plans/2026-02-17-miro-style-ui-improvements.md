# Miro-Style UI Improvements Implementation Plan

## Overview

Implement Miro-inspired zoom controls and enhance existing UI patterns (shape selection, color picker) for a more intuitive, polished whiteboard experience. Focus on dedicated zoom controls with visual feedback, keyboard shortcuts, and zoom-to-fit functionality.

## Current State Analysis

**Existing:**
- Wheel-based zoom (0.25x - 3x scale, 1.05x increments) with pointer-centered zoom
- Color swatches appear in floating toolbar when object selected (styles.css:537-567)
- Shape selection buttons in floating toolbar (BoardPage.tsx:1740-1800)
- Floating toolbar with glassmorphism effect (styles.css:484-511)

**Missing:**
- Dedicated zoom in/out buttons
- Zoom percentage display
- Zoom-to-fit button
- Keyboard shortcuts (Cmd+/-, Cmd+0)
- Visual feedback for current zoom level

## Desired End State

**Specification:**
1. Bottom-right floating zoom widget with +/- buttons, percentage display, and fit-to-screen button
2. Keyboard shortcuts: Cmd/Ctrl + Plus/Minus for zoom, Cmd/Ctrl + 0 for 100%, Cmd/Ctrl + Shift + F for fit
3. Smooth zoom transitions with percentage animation
4. Zoom-to-fit calculates bounds of all objects and centers them
5. Mini-map integration for quick navigation (stretch goal)

**Verification:**
- Click zoom in/out buttons changes scale by 25%
- Percentage display updates in real-time during wheel zoom
- Cmd+/- shortcuts work on Mac, Ctrl+/- on Windows
- Zoom-to-fit frames all visible objects with padding
- Visual indicator shows current zoom relative to 100%

## What We're NOT Doing

- Full mini-map implementation (deferred to separate ticket)
- Zoom presets dropdown (100%, 75%, 50% - not in Miro)
- Touch gesture pinch-to-zoom (browser handles this)
- Zoom history navigation

## Implementation Approach

Three focused phases: zoom widget UI, keyboard shortcuts + fit-to-screen, then polish/animation. Keep changes minimal and localized to BoardPage.tsx + styles.css.

---

## Phase 1: Zoom Controls Widget

### Overview
Add floating zoom widget in bottom-right corner with +/- buttons and percentage display.

### Changes Required:

#### 1. BoardPage.tsx - Zoom Widget UI
**File**: `app/src/pages/BoardPage.tsx`

**Location**: After `floating-toolbar` div (around line 1832)

**Changes**: Add new zoom controls widget

```tsx
{/* Zoom controls - bottom right */}
<div className="zoom-controls">
  <button
    type="button"
    className="zoom-button"
    onClick={() => {
      const stage = stageRef.current
      if (!stage) return
      const newScale = clamp(viewport.scale * 1.25, 0.25, 3)
      const center = { x: stage.width() / 2, y: stage.height() / 2 }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale
      setViewport({
        scale: newScale,
        x: center.x - worldX * newScale,
        y: center.y - worldY * newScale,
      })
    }}
    disabled={viewport.scale >= 3}
    title="Zoom in (Cmd +)"
    aria-label="Zoom in"
  >
    +
  </button>

  <div className="zoom-percentage" aria-live="polite">
    {Math.round(viewport.scale * 100)}%
  </div>

  <button
    type="button"
    className="zoom-button"
    onClick={() => {
      const stage = stageRef.current
      if (!stage) return
      const newScale = clamp(viewport.scale / 1.25, 0.25, 3)
      const center = { x: stage.width() / 2, y: stage.height() / 2 }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale
      setViewport({
        scale: newScale,
        x: center.x - worldX * newScale,
        y: center.y - worldY * newScale,
      })
    }}
    disabled={viewport.scale <= 0.25}
    title="Zoom out (Cmd -)"
    aria-label="Zoom out"
  >
    −
  </button>
</div>
```

#### 2. styles.css - Zoom Widget Styles
**File**: `app/src/styles.css`

**Location**: After `.floating-toolbar` section (after line 511)

**Changes**: Add zoom controls styling

```css
/* === ZOOM CONTROLS === */
.zoom-controls {
  position: fixed;
  bottom: var(--space-xl);
  right: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: var(--z-sticky);
  animation: zoomReveal var(--transition-slow) cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes zoomReveal {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.zoom-button {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-size: 1.25rem;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--transition-fast);
  line-height: 1;
}

.zoom-button:hover:not(:disabled) {
  background: var(--color-primary);
  color: white;
  transform: scale(1.05);
}

.zoom-button:active:not(:disabled) {
  transform: scale(0.95);
}

.zoom-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-percentage {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  min-width: 48px;
  text-align: center;
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-surface-subtle);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.zoom-percentage.value-changed {
  color: var(--color-primary);
  background: rgba(255, 107, 107, 0.1);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Linting passes: `cd app && npm run lint`
- [ ] Build succeeds: `cd app && npm run build`

#### Manual Verification:
- [ ] Zoom widget appears in bottom-right corner
- [ ] Click + button zooms in 25% (e.g., 100% → 125%)
- [ ] Click - button zooms out 25% (e.g., 100% → 80%)
- [ ] Percentage display shows current zoom level
- [ ] Buttons disable at min (25%) and max (300%) zoom
- [ ] Widget has glassmorphism effect matching toolbar

**Note**: Verify manual testing before Phase 2.

---

## Phase 2: Keyboard Shortcuts + Fit-to-Screen

### Overview
Add keyboard shortcuts for zoom and implement zoom-to-fit functionality.

### Changes Required:

#### 1. BoardPage.tsx - Keyboard Handler
**File**: `app/src/pages/BoardPage.tsx`

**Location**: Add useEffect after viewport state (around line 200-250)

**Changes**: Add keyboard shortcuts

```tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Ignore if typing in input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey

    if (!cmdOrCtrl) return

    const stage = stageRef.current
    if (!stage) return

    if (event.key === '=' || event.key === '+') {
      // Cmd/Ctrl + Plus: Zoom in
      event.preventDefault()
      const newScale = clamp(viewport.scale * 1.25, 0.25, 3)
      const center = { x: stage.width() / 2, y: stage.height() / 2 }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale
      setViewport({
        scale: newScale,
        x: center.x - worldX * newScale,
        y: center.y - worldY * newScale,
      })
    } else if (event.key === '-' || event.key === '_') {
      // Cmd/Ctrl + Minus: Zoom out
      event.preventDefault()
      const newScale = clamp(viewport.scale / 1.25, 0.25, 3)
      const center = { x: stage.width() / 2, y: stage.height() / 2 }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale
      setViewport({
        scale: newScale,
        x: center.x - worldX * newScale,
        y: center.y - worldY * newScale,
      })
    } else if (event.key === '0') {
      // Cmd/Ctrl + 0: Reset to 100%
      event.preventDefault()
      const center = { x: stage.width() / 2, y: stage.height() / 2 }
      const worldX = (center.x - viewport.x) / viewport.scale
      const worldY = (center.y - viewport.y) / viewport.scale
      setViewport({
        scale: 1,
        x: center.x - worldX,
        y: center.y - worldY,
      })
    } else if (event.key === 'f' && event.shiftKey) {
      // Cmd/Ctrl + Shift + F: Fit to screen
      event.preventDefault()
      fitToScreen()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [viewport])
```

#### 2. BoardPage.tsx - Fit-to-Screen Function
**File**: `app/src/pages/BoardPage.tsx`

**Location**: Add near other handler functions (before return statement)

**Changes**: Implement fit-to-screen logic

```tsx
const fitToScreen = () => {
  const stage = stageRef.current
  if (!stage || objects.length === 0) return

  // Calculate bounding box of all objects
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  objects.forEach((obj) => {
    const objRight = obj.position.x + (obj.size?.width || 100)
    const objBottom = obj.position.y + (obj.size?.height || 100)
    minX = Math.min(minX, obj.position.x)
    minY = Math.min(minY, obj.position.y)
    maxX = Math.max(maxX, objRight)
    maxY = Math.max(maxY, objBottom)
  })

  // Add padding
  const padding = 100
  const contentWidth = maxX - minX + padding * 2
  const contentHeight = maxY - minY + padding * 2

  // Calculate scale to fit
  const scaleX = stage.width() / contentWidth
  const scaleY = stage.height() / contentHeight
  const newScale = clamp(Math.min(scaleX, scaleY), 0.25, 3)

  // Center the content
  const contentCenterX = (minX + maxX) / 2
  const contentCenterY = (minY + maxY) / 2
  const stageCenterX = stage.width() / 2
  const stageCenterY = stage.height() / 2

  setViewport({
    scale: newScale,
    x: stageCenterX - contentCenterX * newScale,
    y: stageCenterY - contentCenterY * newScale,
  })
}
```

#### 3. BoardPage.tsx - Fit Button
**File**: `app/src/pages/BoardPage.tsx`

**Location**: Add to zoom-controls div after percentage

**Changes**: Add fit-to-screen button

```tsx
<button
  type="button"
  className="zoom-button zoom-fit"
  onClick={fitToScreen}
  disabled={objects.length === 0}
  title="Fit to screen (Cmd + Shift + F)"
  aria-label="Fit all objects to screen"
>
  ⛶
</button>
```

#### 4. styles.css - Fit Button Styles
**File**: `app/src/styles.css`

**Location**: Add after `.zoom-button` styles

**Changes**: Add fit button specific styles

```css
.zoom-fit {
  font-size: 1rem;
  margin-top: var(--space-xs);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Linting passes: `cd app && npm run lint`

#### Manual Verification:
- [ ] Cmd+Plus (Mac) or Ctrl+Plus (Windows) zooms in
- [ ] Cmd+Minus zooms out
- [ ] Cmd+0 resets to 100% zoom
- [ ] Cmd+Shift+F fits all objects to screen
- [ ] Fit button works with empty board (disabled)
- [ ] Fit button centers and scales content with padding
- [ ] Keyboard shortcuts ignored when typing in AI panel

**Note**: Verify manual testing before Phase 3.

---

## Phase 3: Polish & Animation

### Overview
Add smooth transitions, percentage change animation, and accessibility improvements.

### Changes Required:

#### 1. styles.css - Transition Enhancements
**File**: `app/src/styles.css`

**Location**: Update `.zoom-percentage` styles

**Changes**: Add transition and animation for value changes

```css
.zoom-percentage {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  min-width: 48px;
  text-align: center;
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-surface-subtle);
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.zoom-percentage.value-changed {
  color: var(--color-primary);
  background: rgba(255, 107, 107, 0.1);
  animation: pulseHighlight 300ms ease-out;
}

@keyframes pulseHighlight {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
```

#### 2. BoardPage.tsx - Percentage Animation State
**File**: `app/src/pages/BoardPage.tsx`

**Location**: Add state near viewport state

**Changes**: Track percentage changes for animation

```tsx
const [percentagePulse, setPercentagePulse] = useState(false)
```

Then update the percentage div:

```tsx
<div
  className={`zoom-percentage ${percentagePulse ? 'value-changed' : ''}`}
  aria-live="polite"
  onAnimationEnd={() => setPercentagePulse(false)}
>
  {Math.round(viewport.scale * 100)}%
</div>
```

And trigger pulse on zoom:

```tsx
// In zoom button handlers and keyboard handler
setViewport({
  scale: newScale,
  x: center.x - worldX * newScale,
  y: center.y - worldY * newScale,
})
setPercentagePulse(true)
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd app && npm run typecheck`
- [ ] Linting passes: `cd app && npm run lint`
- [ ] Build succeeds: `cd app && npm run build`
- [ ] No console errors or warnings

#### Manual Verification:
- [ ] Percentage pulses when zooming via buttons
- [ ] Percentage pulses when zooming via keyboard
- [ ] Percentage pulses when zooming via scroll wheel
- [ ] Animation is smooth (300ms duration)
- [ ] Focus states visible for keyboard navigation
- [ ] ARIA labels announce zoom level changes

---

## Testing Strategy

### Unit Tests:
- N/A (UI interactions, covered by manual testing)

### Integration Tests:
- N/A (browser keyboard events difficult to test)

### Manual Testing Steps:
1. **Zoom Buttons**: Click +/-, verify scale changes by 25%
2. **Percentage Display**: Wheel zoom, verify percentage updates
3. **Keyboard Shortcuts**: Test Cmd+/-, Cmd+0 on Mac; Ctrl on Windows
4. **Fit-to-Screen**: Create scattered objects, press fit, verify centered
5. **Edge Cases**: Test at min/max zoom, empty board, single object
6. **Accessibility**: Tab through controls, verify focus indicators

## Performance Considerations

- Zoom calculations run on every wheel event - already optimized with pointer-centered zoom
- Keyboard handler uses passive listener where possible
- Percentage animation uses CSS transforms (GPU accelerated)
- No re-renders during drag - viewport state updates on drag end

## Migration Notes

None - this is additive functionality only.

## References

- Miro zoom controls reference images (user provided screenshots)
- Current zoom implementation: `BoardPage.tsx:1871-1900`
- Current floating toolbar: `BoardPage.tsx:1720-1832`, `styles.css:484-511`
- Color swatch implementation: `styles.css:537-567`
