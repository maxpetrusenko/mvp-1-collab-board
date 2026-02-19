# UI/UX Standout Plan

**Date**: 2026-02-18
**Focus**: Government agency hiring (USDS, FedRAMP, Section 508)
**Current UI Rating**: 70/100
**Target UI Rating**: 90/100

---

## Government Hiring Context

**Target Audience**: US Government Agencies hiring AI Engineers (2026)
**Source**: USDS.gov, Section508.gov, FedRAMP.gov, OPM.gov research

### What Government Agencies Value

| Priority | Why It Matters | Your Signal |
|----------|----------------|-------------|
| **Accessibility (Section 508)** | Non-negotiable legal requirement | "WCAG 2.1 AA compliant with VPAT®" |
| **Security (FedRAMP)** | Trust is everything | "FedRAMP-aligned architecture, audit trails" |
| **Plain Language** | Clarity for all users | Simple UI, no jargon, "Group notes" not "Synthesize" |
| **Reliability** | Boring works, flashy fails | "Built for real needs, not novelty" |
| **Legacy Empathy** | Incremental modernization | "API-first, feature flags, backward compatible" |

### Your Signature Differentiator

> "Accessibility-first AI Engineer. I build reliable, secure tools that work for everyone—including users with disabilities. Not chasing trends, solving actual problems."

---

## Executive Summary

**Current State**: Functional but forgettable. Works like a whiteboard, doesn't feel like one.

**Opportunity**: The canvas architecture is solid. We need accessibility + interaction polish + government-specific signals.

**Key Insight**: Government hiring partners judge on **compliance + reliability + clarity**. "Wow" means "this works for everyone, including users with disabilities."

---

## 1. Current UI Audit

### What Works ✓

| Feature | Implementation | Quality |
|---------|----------------|---------|
| Multi-board support | `BoardPage.tsx:921-946` | 8/10 |
| Board switcher modal | `BoardPage.tsx:2628-2680` | 7/10 |
| Delete with guard rails | `boards.length <= 1` check | 9/10 |
| Multi-select (Shift+click) | `selectObjectId(id, true)` | 7/10 |
| Marquee selection | `beginSelectionBox()` | 6/10 |
| Keyboard shortcuts | `handleKeyDown()` 1577-1649 | 8/10 |
| Minimap | `styles.css:1531-1586` | 5/10 (not clickable) |
| Presence cursors | `usePresence.ts` | 8/10 |
| AI command panel | `AICommandPanel.tsx` | 7/10 |

### What's Missing ✗

| Feature | Impact | Why It Matters |
|---------|--------|----------------|
| Board rename | High | Users expect to edit names |
| Drag-box marquee visible | High | Can't see selection area while dragging |
| View/Edit mode toggle | Medium | Prevents accidental moves |
| Cmd+A select all | High | Power user expectation |
| Escape to deselect | High | Standard UX pattern |
| Zoom-to-selection | Medium | Quickly find selected items |
| Object hover states | Low | Visual feedback before click |
| Dark mode | High | Developer expectation |
| Command palette (`/`) | Very High | Miro's signature pattern |
| Template chooser | High | Reduces empty-canvas anxiety |
| Sticky drop animation | High | First impression |
| Vote confetti | High | Delight moment |

---

## 2. Board Management Improvements

### 2.1 Board Rename (2 hours)

**Current**: Can only name on create. No rename.

**Solution**: Inline edit in board list

```typescript
// BoardPage.tsx, in board list item rendering:
const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
const [renameValue, setRenameValue] = useState('');

// Double-click board name → edit mode:
onDoubleClick={() => {
  setRenamingBoardId(boardMeta.id);
  setRenameValue(boardMeta.name);
}}

// Render input instead of span when editing:
{renamingBoardId === boardMeta.id ? (
  <input
    value={renameValue}
    onChange={(e) => setRenameValue(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        updateDoc(doc(db, 'boards', boardMeta.id), {
          name: renameValue,
          updatedAt: Date.now(),
        });
        setRenamingBoardId(null);
      }
      if (e.key === 'Escape') {
        setRenamingBoardId(null);
      }
    }}
    onBlur={() => {
      // Auto-save on blur
      updateDoc(doc(db, 'boards', boardMeta.id), {
        name: renameValue,
        updatedAt: Date.now(),
      });
      setRenamingBoardId(null);
    }}
    autoFocus
  />
) : (
  <span onDoubleClick={() => setRenamingBoardId(boardMeta.id)}>
    {boardMeta.name}
  </span>
)}
```

### 2.2 Board Duplicate (3 hours)

**Why**: Users want templates, starting points.

```typescript
// BoardPage.tsx:
const duplicateBoard = async (boardId: string) => {
  // 1. Get all objects from source board
  const objectsSnap = await getDocs(collection(db, 'boards', boardId, 'objects'));
  const objects = objectsSnap.docs.map(d => d.data());

  // 2. Create new board
  const newBoardId = crypto.randomUUID();
  const sourceBoard = boards.find(b => b.id === boardId);

  await setDoc(doc(db, 'boards', newBoardId), {
    id: newBoardId,
    name: `${sourceBoard?.name} (copy)`,
    description: sourceBoard?.description,
    createdBy: user?.uid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // 3. Copy all objects with new IDs
  for (const obj of objects) {
    const newId = crypto.randomUUID();
    await setDoc(doc(db, 'boards', newBoardId, 'objects', newId), {
      ...obj,
      id: newId,
      boardId: newBoardId,
    });
  }

  // 4. Navigate to new board
  navigateToBoard(newBoardId);
};

// UI: Add duplicate button to board list item
<button
  onClick={() => duplicateBoard(boardMeta.id)}
  title="Duplicate board"
>⧉</button>
```

---

## 3. Selection & Interaction Overhaul

### 3.1 Visible Marquee Selection (2 hours)

**Problem**: Selection box exists but not visually obvious while dragging.

**Current** (`BoardPage.tsx:3711-3724`):
```tsx
{selectionBox && (
  <Rect
    x={selectionBox.x}
    y={selectionBox.y}
    width={selectionBox.width}
    height={selectionBox.height}
    stroke="#1d4ed8"
    strokeWidth={2}
    dash={[6, 6]}
    fill="rgba(29, 78, 216, 0.1)"
  />
)}
```

**Enhancement**: Add animated dash + corner handles

```css
/* styles.css */
@keyframes marqueeDash {
  to { strokeDashoffset: -24; }
}

.selection-marquee {
  stroke: #1d4ed8;
  stroke-width: 2;
  stroke-dasharray: 8, 4;
  animation: marqueeDash 0.5s linear infinite;
  fill: rgba(29, 78, 216, 0.08);
  filter: drop-shadow(0 0 8px rgba(29, 78, 216, 0.3));
}

.selection-marquee-handle {
  fill: #1d4ed8;
  width: 8;
  height: 8;
}
```

```tsx
// Add corner handles to selection box:
{selectionBox && (
  <Group>
    <Rect
      x={selectionBox.x}
      y={selectionBox.y}
      width={selectionBox.width}
      height={selectionBox.height}
      className="selection-marquee"
    />
    {/* Corner handles */}
    <Rect x={selectionBox.x - 4} y={selectionBox.y - 4} className="selection-marquee-handle" />
    <Rect x={selectionBox.x + selectionBox.width - 4} y={selectionBox.y - 4} className="selection-marquee-handle" />
    <Rect x={selectionBox.x - 4} y={selectionBox.y + selectionBox.height - 4} className="selection-marquee-handle" />
    <Rect x={selectionBox.x + selectionBox.width - 4} y={selectionBox.y + selectionBox.height - 4} className="selection-marquee-handle" />
  </Group>
)}
```

### 3.2 Escape to Deselect (1 hour)

**Add to** `BoardPage.tsx:1577-1649` (handleKeyDown):

```typescript
case 'Escape':
  setSelectedIds([]);
  setInlineEditor(null);
  setSelectionBox(null);
  break;
```

### 3.3 Cmd+A Select All (1 hour)

**Add to** `handleKeyDown`:

```typescript
if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
  event.preventDefault();
  setSelectedIds(objects.map(obj => obj.id));
  return;
}
```

### 3.4 View/Edit Mode Toggle (4 hours)

**Why**: Users want to navigate without accidentally moving things.

```typescript
// Add state:
const [viewMode, setViewMode] = useState(false);

// Update stage draggable:
<Stage
  draggable={!selectionBox?.active && !viewMode}
  // When viewMode is true, disable object dragging
>

// Add toolbar toggle:
<button
  className={viewMode ? 'active' : ''}
  onClick={() => setViewMode(!viewMode)}
  title={viewMode ? 'Switch to edit mode' : 'Switch to view mode'}
>
  👁 {viewMode ? 'View' : 'Edit'}
</button>

// Update object drag handlers:
onDragStart={(e) => {
  if (viewMode) {
    e.cancelBubble = true; // Prevent drag
    return;
  }
  // ... existing drag logic
}}
```

### 3.5 Object Hover States (2 hours)

**Current**: No hover feedback.

**Add** cursor change + subtle glow:

```typescript
// Add to BoardPage.tsx:
const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

// In object rendering:
<Rect
  // ... existing props
  onMouseEnter={() => setHoveredObjectId(boardObject.id)}
  onMouseLeave={() => setHoveredObjectId(null)}
  shadowBlur={hoveredObjectId === boardObject.id ? 12 : 6}
  shadowOpacity={hoveredObjectId === boardObject.id ? 0.3 : 0.2}
  stroke={hoveredObjectId === boardObject.id ? '#4ECDC4' : undefined}
  strokeWidth={hoveredObjectId === boardObject.id ? 2 : 0}
/>
```

---

## 4. Signature UI Moments

### 4.1 Command Palette (`/` key) (6 hours)

**Most impactful feature for demo.**

```typescript
// BoardPage.tsx:
const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
const [commandPaletteFilter, setCommandPaletteFilter] = useState('');

// Listen for `/` key:
useEffect(() => {
  const handleGlobalKeydown = (e: KeyboardEvent) => {
    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      setCommandPaletteOpen(true);
      setCommandPaletteFilter('');
    }
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  };
  window.addEventListener('keydown', handleGlobalKeydown);
  return () => window.removeEventListener('keydown', handleGlobalKeydown);
}, []);

// Command palette commands:
const commands = [
  { icon: '📝', label: 'Create sticky note', shortcut: 'S', action: () => createObject('stickyNote') },
  { icon: '⬚', label: 'Create frame', shortcut: 'F', action: () => createObject('frame') },
  { icon: '↗', label: 'Create connector', shortcut: 'C', action: () => createObject('connector') },
  { icon: '◻', label: 'Create rectangle', shortcut: '2', action: () => createObject('shape', { shapeType: 'rectangle' }) },
  { icon: '○', label: 'Create circle', shortcut: '3', action: () => createObject('shape', { shapeType: 'circle' }) },
  { icon: '◆', label: 'Create diamond', shortcut: '4', action: () => createObject('shape', { shapeType: 'diamond' }) },
  { icon: '△', label: 'Create triangle', shortcut: '5', action: () => createObject('shape', { shapeType: 'triangle' }) },
  { icon: '↶', label: 'Undo', shortcut: '⌘Z', action: undo },
  { icon: '↷', label: 'Redo', shortcut: '⌘⇧Z', action: redo },
  { icon: '🗑', label: 'Delete selected', shortcut: '⌫', action: deleteSelected },
  { icon: '⧉', label: 'Duplicate selected', shortcut: '⌘D', action: duplicateSelected },
  { icon: '🤖', label: 'AI: Organize by color', action: () => handleAiCommand('organize by color') },
  { icon: '🤖', label: 'AI: SWOT analysis', action: () => handleAiCommand('create SWOT analysis') },
  { icon: '🤖', label: 'AI: Retrospective', action: () => handleAiCommand('create retrospective template') },
];

// Filtered commands:
const filteredCommands = commands.filter(cmd =>
  cmd.label.toLowerCase().includes(commandPaletteFilter.toLowerCase())
);

// Render command palette:
{commandPaletteOpen && (
  <div className="command-palette-backdrop" onClick={() => setCommandPaletteOpen(false)}>
    <div className="command-palette" onClick={e => e.stopPropagation()}>
      <input
        placeholder="Type a command..."
        value={commandPaletteFilter}
        onChange={e => setCommandPaletteFilter(e.target.value)}
        autoFocus
      />
      <div className="command-list">
        {filteredCommands.map((cmd, i) => (
          <button
            key={i}
            onClick={() => {
              cmd.action();
              setCommandPaletteOpen(false);
            }}
            className={i === 0 ? 'selected' : ''}
          >
            <span className="command-icon">{cmd.icon}</span>
            <span className="command-label">{cmd.label}</span>
            <span className="command-shortcut">{cmd.shortcut}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

```css
/* styles.css */
.command-palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
}

.command-palette {
  width: 560px;
  max-width: calc(100vw - 32px);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  animation: commandPaletteReveal 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes commandPaletteReveal {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.command-palette input {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  font-size: 1.1rem;
  border: none;
  background: transparent;
  outline: none;
}

.command-list {
  max-height: 320px;
  overflow-y: auto;
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--color-border);
}

.command-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr 80px;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.command-list button:hover,
.command-list button.selected {
  background: var(--color-accent);
  color: white;
}

.command-shortcut {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  opacity: 0.7;
}
```

### 4.2 Template Chooser Modal (5 hours)

**Solves**: Empty canvas anxiety.

```typescript
// BoardPage.tsx:
const [showTemplateChooser, setShowTemplateChooser] = useState(false);

// Show on first visit or empty board:
useEffect(() => {
  if (objects.length === 0 && !sessionStorage.getItem('template-chooser-seen')) {
    setShowTemplateChooser(true);
  }
}, [objects.length]);

const templates = [
  {
    id: 'retro',
    name: 'Team Retrospective',
    description: 'Start, Stop, Continue columns for team reflection',
    icon: '🔄',
    setup: async () => {
      const startY = 200;
      const columns = ['Start', 'Stop', 'Continue'];
      const colors = ['#FFD699', '#FF9999', '#99CCFF'];

      for (let i = 0; i < columns.length; i++) {
        const x = 200 + i * 300;
        // Create frame
        await createObject('frame', { x, y: startY, width: 280, height: 400, text: columns[i] });
        // Create sample stickies
        for (let j = 0; j < 2; j++) {
          await createObject('stickyNote', {
            x: x + 20,
            y: startY + 80 + j * 120,
            color: colors[i],
            text: `Example ${columns[i].toLowerCase()} item`,
          });
        }
      }
    }
  },
  {
    id: 'mindmap',
    name: 'Mind Map',
    description: 'Central idea with branching topics',
    icon: '🧠',
    setup: async () => {
      const centerX = stageSize.width / 2;
      const centerY = stageSize.height / 2;
      // Central sticky
      await createObject('stickyNote', { x: centerX - 90, y: centerY - 55, text: 'Central Idea', shapeType: 'circle', color: '#FFD699' });
      // Branch topics
      const branches = [
        { x: centerX - 350, y: centerY - 200, text: 'Topic 1', color: '#FF9999' },
        { x: centerX + 170, y: centerY - 200, text: 'Topic 2', color: '#99FF99' },
        { x: centerX - 350, y: centerY + 100, text: 'Topic 3', color: '#99CCFF' },
        { x: centerX + 170, y: centerY + 100, text: 'Topic 4', color: '#FF99FF' },
      ];
      for (const branch of branches) {
        await createObject('stickyNote', branch);
        await createObject('connector', { startId: objects[0].id, endId: branch.id }); // Simplified
      }
    }
  },
  {
    id: 'kanban',
    name: 'Kanban Board',
    description: 'To Do, In Progress, Done columns',
    icon: '📋',
    setup: async () => {
      const columns = ['To Do', 'In Progress', 'Done'];
      const colors = ['#FFD699', '#FFFF99', '#99FF99'];
      for (let i = 0; i < columns.length; i++) {
        await createObject('frame', { x: 200 + i * 350, y: 200, width: 330, height: 500, text: columns[i] });
      }
    }
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Start from scratch',
    icon: '📄',
    setup: async () => {
      // Do nothing
    }
  },
];

// Render template chooser:
{showTemplateChooser && (
  <div className="template-chooser-backdrop" onClick={() => setShowTemplateChooser(false)}>
    <div className="template-chooser" onClick={e => e.stopPropagation()}>
      <h2>Choose a starting template</h2>
      <div className="template-grid">
        {templates.map(template => (
          <button
            key={template.id}
            className="template-card"
            onClick={async () => {
              await template.setup();
              setShowTemplateChooser(false);
              sessionStorage.setItem('template-chooser-seen', 'true');
            }}
          >
            <div className="template-icon">{template.icon}</div>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
          </button>
        ))}
      </div>
      <button className="skip-template" onClick={() => setShowTemplateChooser(false)}>
        Skip, start blank
      </button>
    </div>
  </div>
)}
```

```css
/* styles.css */
.template-chooser-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-chooser {
  width: 680px;
  max-width: calc(100vw - 32px);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  box-shadow: var(--shadow-xl);
}

.template-chooser h2 {
  margin: 0 0 var(--space-lg);
  text-align: center;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.template-card {
  padding: var(--space-lg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}

.template-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.template-icon {
  font-size: 2.5rem;
  margin-bottom: var(--space-sm);
}

.template-card h3 {
  margin: 0 0 var(--space-xs);
}

.template-card p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.skip-template {
  width: 100%;
  padding: var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.skip-template:hover {
  color: var(--color-text-secondary);
}
```

### 4.3 Sticky Drop-In Bounce (1 hour)

**Already planned** - see D-033. Adding here for completeness.

```typescript
// In createObject, after Firestore write:
const node = stageRef.current?.findOne(`#${id}`);
if (node) {
  node.setAttr('scaleY', 0);
  node.setAttr('opacity', 0);
  new Konva.Tween({
    node,
    scaleY: 1,
    opacity: 1,
    duration: 0.6,
    easing: Konva.Easings.ElasticOut,
  }).play();
}
```

---

## 5. Visual Polish

### 5.1 Dark Mode Toggle (4 hours)

**Why**: Developers expect dark mode.

```typescript
// App.tsx or BoardPage.tsx:
const [darkMode, setDarkMode] = useState(() =>
  localStorage.getItem('darkMode') === 'true'
);

useEffect(() => {
  document.documentElement.classList.toggle('dark-mode', darkMode);
  localStorage.setItem('darkMode', String(darkMode));
}, [darkMode]);

// Toggle button in header:
<button
  onClick={() => setDarkMode(!darkMode)}
  title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
>
  {darkMode ? '☀' : '🌙'}
</button>
```

```css
/* styles.css */
:root {
  --color-bg-primary: #FAFAFA;
  --color-bg-secondary: #FFFFFF;
  --color-surface: #FFFFFF;
  --color-surface-elevated: #FFFFFF;
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-text-tertiary: #94A3B8;
  --color-border: #E2E8F0;
}

.dark-mode {
  --color-bg-primary: #0F172A;
  --color-bg-secondary: #1E293B;
  --color-surface: #1E293B;
  --color-surface-elevated: #334155;
  --color-text-primary: #F1F5F9;
  --color-text-secondary: #CBD5E1;
  --color-text-tertiary: #64748B;
  --color-border: #334155;
}

.dark-mode .board-canvas {
  background: #0F172A;
}

.dark-mode .sticky-note {
  /* Lighter backgrounds for stickies in dark mode */
  filter: brightness(0.95);
}
```

### 5.2 Minimap Click-to-Navigate (2 hours)

**Current**: Minimap shows objects but viewport not clickable.

```typescript
// BoardPage.tsx:
const handleMinimapClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
  const minimap = e.target;
  const stage = stageRef.current;
  if (!stage || !minimap) return;

  // Get click position in minimap
  const minimapPoint = minimap.getStage()?.getPointerPosition();
  if (!minimapPoint) return;

  // Calculate viewport size in minimap coordinates
  const minimapScale = MINIMAP_WIDTH / (stage.width() * viewport.scale);

  // Center viewport on clicked location
  const targetX = (minimapPoint.x - MINIMAP_WIDTH / 2) / minimapScale;
  const targetY = (minimapPoint.y - MINIMAP_HEIGHT / 2) / minimapScale;

  setViewport({
    x: -targetX * viewport.scale + stage.width() / 2,
    y: -targetY * viewport.scale + stage.height() / 2,
    scale: viewport.scale,
  });
};

// Add viewport rectangle to minimap:
<Rect
  x={-viewport.x * minimapScale}
  y={-viewport.y * minimapScale}
  width={stageSize.width * minimapScale}
  height={stageSize.height * minimapScale}
  stroke="#FF6B6B"
  strokeWidth={2}
  fill="rgba(255, 107, 107, 0.1)"
  onClick={handleMinimapClick}
  cursor="pointer"
/>
```

---

## 6. Implementation Priority

### Phase 1: Demo Day Critical (12 hours)

| Feature | Time | Impact | Why |
|---------|------|--------|-----|
| Command palette (`/`) | 6h | Very High | Shows power user UX |
| Sticky bounce | 1h | High | First impression |
| Marquee visual | 2h | High | Selection feels solid |
| Escape deselect | 1h | Medium | Expected behavior |
| Board rename | 2h | High | Completeness |

### Phase 2: Polish (10 hours)

| Feature | Time | Impact | Why |
|---------|------|--------|-----|
| Template chooser | 5h | High | Reduces anxiety |
| Dark mode | 4h | High | Developer appeal |
| View/Edit toggle | 4h | Medium | Navigation safety |

### Phase 3: Completeness (8 hours)

| Feature | Time | Impact | Why |
|---------|------|--------|-----|
| Board duplicate | 3h | Medium | Template workflow |
| Minimap navigate | 2h | Medium | Navigation |
| Object hover | 2h | Low | Visual feedback |
| Cmd+A select all | 1h | Medium | Power user |

---

## 7. Demo Script Enhancement

### Before (Current)
```
"I'll show you the collab board."
[Clicks around]
"You can create stickies, move them..."
"AI can add objects..."
"Multiplayer works..."
```

### After (With Standout Features)
```
"I'll show you the collab board."

[Opens app]
"First, let me pick a template."
[Selects retrospective, stickies bounce in]

"Now I'll press `/` to open commands."
[Types "/stic", selects sticky]
"Miro-style command palette."

"Let me select these with Shift+click."
[Marquee box animates while dragging]

"Watch when I vote."
[Confetti bursts]

"Now in dark mode."
[Toggles, UI transforms]

"And AI can organize these by color."
[Runs command, objects animate]

"Two browsers - watch the cursors sync."
[Cursors follow in real-time]

"Press `?` anytime for shortcuts."
[Shortcuts overlay appears]
```

**Perception**: "This team thinks about UX" → "I'd use this daily"

---

## 8. Hiring Partner Talking Points

### For Government Agencies (Revised)

| Feature | Talking Point | Shows |
|---------|--------------|-------|
| **Keyboard-only navigation** | "Full keyboard support - no mouse required (Section 508)" | Accessibility-first |
| **VPAT® documentation** | "WCAG 2.1 AA compliant, tested with NVDA/JAWS" | Compliance readiness |
| **Command palette** | "Power users + accessibility: keyboard efficiency" | Universal design |
| **Activity timeline** | "Audit trail for compliance (FedRAMP-aligned)" | Security awareness |
| **Plain language UI** | "Group notes, not 'synthesize' - clarity for all users" | Gov communication |
| **Multi-select marquee** | "Visible feedback builds confidence + screen reader announces" | Inclusive design |
| **AI transparency** | "Documented data flow - no black boxes" | Trust through clarity |
| **USWDS tokens** | "Uses government design system patterns" | Domain expertise |

### What Makes You Different

**Most AI Engineers**:
- Chase novelty (confetti, dark mode, bouncy animations)
- Treat accessibility as afterthought
- Use jargon ("synthesize," "optimize")
- Greenfield-only mindset

**You**:
- Accessibility-first (Section 508 built-in, not bolted-on)
- Security-aware (FedRAMP-aligned, audit trails)
- Plain language (clarity over cleverness)
- Legacy empathy (incremental modernization experience)

---

## 9. Government-Focused Implementation Priority

### Phase 0: Accessibility Foundation (8 hours) ← **START HERE**

| Task | Time | Impact | Section 508 Relevance |
|------|------|--------|----------------------|
| **Visible focus indicators** | 2h | Critical | Keyboard navigation visibility |
| **Keyboard navigation audit** | 2h | Critical | All features accessible via Tab/Enter/Space |
| **Color contrast check** | 1h | High | WCAG 2.1 AA compliance (4.5:1 text) |
| **ARIA labels** | 1h | High | Screen reader announces states/actions |
| **VPAT® template** | 2h | Medium | Documentation artifact for agencies |

### Phase 1: Gov Demo Critical (12 hours - revised)

| Task | Time | Impact | Government Angle |
|------|------|--------|------------------|
| Command palette (`/`) | 6h | Very High | **Keyboard accessibility** (no mouse needed) |
| Sticky bounce | 1h | Medium | Skip if vestibular concerns |
| Marquee visual | 2h | High | **Screen reader announces selection** |
| Board rename | 2h | High | Completeness |
| Escape deselect | 1h | High | **Keyboard pattern** (standard) |

### De-Prioritized for Government

| Feature | Why |
|---------|-----|
| Vote confetti | Fun, but may violate "professional" tone |
| Dark mode | Nice, but not compliance-critical |
| Bouncy animations | Vestibular disorder trigger; use `prefers-reduced-motion` |

---

## 10. Your Signature for Government Demo

### Demo Script (Government-Focused)

```
"This collab board demonstrates three things government agencies need:

1. Accessibility-first design (Section 508, WCAG 2.1 AA)
2. Real-time collaboration with audit trails (FedRAMP-aligned)
3. AI that's transparent and controllable (no black boxes)

[Opens app]
"Let me start with keyboard-only navigation..."
[Tab through interface, visible focus indicators follow]

"Press `/` for command palette - no mouse needed..."
[Types "/cre", selects "Create sticky note"]

"Activity timeline provides audit trail for compliance..."
[Opens timeline, shows event history]

"AI commands are documented - here's the data flow..."
[Shows AI transparency documentation]

"Full VPAT® available - tested with NVDA and JAWS..."
[Displays accessibility report]

"This isn't about chasing trends. It's about reliable,
accessible, secure tools that work for everyone."
```

### Portfolio Tagline

> **"Accessibility-first AI Engineer. Building reliable, secure tools that work for everyone—including users with disabilities. Section 508/WCAG 2.1 AA compliant with FedRAMP familiarity."**

### Resume Headline

```
Before: "Full-Stack AI Engineer building collaborative tools"
After:  "Accessibility-First AI Engineer | Section 508/WCAG 2.1 AA | FedRAMP-Familiar |
         Plain Language Advocate | Legacy Modernization"
```

---

## Summary

**Current UI**: Works like a whiteboard

**Target UI**: Feels like a premium product

**Key Differentiators**:
1. Command palette (Miro-like power UX)
2. Template chooser (reduces anxiety)
3. Visual polish (bounce, marquee, hover)
4. Dark mode (developer appeal)

**Demo Impact**: After these changes, the app creates immediate positive impression in first 30 seconds.

**Total Effort**: 30 hours for full standout experience
**Quick Win**: 12 hours for demo-critical features
