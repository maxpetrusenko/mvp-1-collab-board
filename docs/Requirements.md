# CollabBoard  
## Building Real-Time Collaborative Whiteboard Tools with AI-First Development

---

## 🚦 Before You Start: Pre-Search (1 Hour)

After reviewing this document — **before writing any code** — complete the Pre-Search methodology (see Appendix).

This structured AI-assisted process helps you:

- Explore stack options  
- Surface architectural tradeoffs  
- Document architecture decisions  

Your Pre-Search output becomes part of your final submission.

This week emphasizes **AI-first development workflows**. Pre-Search is the first step.

---

## 📚 Background

Miro solved hard problems:

- Real-time synchronization  
- Conflict resolution  
- Smooth performance while streaming live data  
- Multiple simultaneous users without merge conflicts  

This project requires you to:

1. Build production-scale collaborative whiteboard infrastructure  
2. Extend it with an AI agent that manipulates the board via natural language  

The focus: **AI-first development methodology** — using coding agents, MCPs, and structured AI workflows throughout.

> Project completion is required for Austin admission.

---

# 🗓 Project Overview

### One-Week Sprint

| Checkpoint | Deadline | Focus |
|------------|----------|-------|
| Pre-Search | Monday (1 hour in) | Architecture & Planning |
| MVP | Tuesday (24 hours) | Collaborative infrastructure |
| Early Submission | Friday (4 days) | Full feature set |
| Final | Sunday (7 days) | Polish, documentation, deployment |

---

# ✅ MVP Requirements (24 Hours)

**Hard gate. All items required to pass.**

- [ ] Infinite board with pan/zoom  
- [ ] Sticky notes with editable text  
- [ ] At least one shape (rectangle, circle, or line)  
- [ ] Create, move, edit objects  
- [ ] Real-time sync (2+ users)  
- [ ] Multiplayer cursors with labels  
- [ ] Presence awareness  
- [ ] User authentication  
- [ ] Public deployment  

> A simple board with bulletproof multiplayer beats a feature-rich board with broken sync.

---

# 🧱 Core Collaborative Whiteboard

## Board Features

| Feature | Requirements |
|----------|--------------|
| Workspace | Infinite board, smooth pan/zoom |
| Sticky Notes | Create, edit text, change colors |
| Shapes | Rectangles, circles, lines |
| Connectors | Lines/arrows connecting objects |
| Text | Standalone text elements |
| Frames | Group and organize content |
| Transforms | Move, resize, rotate |
| Selection | Single + multi-select |
| Operations | Delete, duplicate, copy/paste |

---

## Real-Time Collaboration

| Feature | Requirements |
|----------|--------------|
| Cursors | Multiplayer cursors with names |
| Sync | Instant object updates |
| Presence | Clear online indicators |
| Conflicts | Handle simultaneous edits (last-write-wins acceptable — document approach) |
| Resilience | Graceful reconnect handling |
| Persistence | Board survives disconnect |

---

## 🧪 Testing Scenarios

1. Two users editing simultaneously  
2. One user refreshing mid-edit  
3. Rapid object creation/movement  
4. Network throttling and disconnection recovery  
5. 5+ concurrent users  

---

## 🎯 Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS |
| Object sync latency | <100ms |
| Cursor sync latency | <50ms |
| Object capacity | 500+ objects |
| Concurrent users | 5+ without degradation |

---

# 🤖 AI Board Agent

## Required Capabilities

Support **at least 6 distinct commands** across categories.

---

### Creation Commands

- “Add a yellow sticky note that says ‘User Research’”
- “Create a blue rectangle at position 100, 200”
- “Add a frame called ‘Sprint Planning’”

---

### Manipulation Commands

- “Move all the pink sticky notes to the right side”
- “Resize the frame to fit its contents”
- “Change the sticky note color to green”

---

### Layout Commands

- “Arrange these sticky notes in a grid”
- “Create a 2x3 grid of sticky notes for pros and cons”
- “Space these elements evenly”

---

### Complex Commands

- “Create a SWOT analysis template”
- “Build a user journey map with 5 stages”
- “Set up a retrospective board with columns”

---

## 🛠 Tool Schema (Minimum)

```ts
createStickyNote(text, x, y, color)
createShape(type, x, y, width, height, color)
createFrame(title, x, y, width, height)
createConnector(fromId, toId, style)
moveObject(objectId, x, y)
resizeObject(objectId, width, height)
updateText(objectId, newText)
changeColor(objectId, color)
getBoardState()
