# CollabBoard  
## Building Real-Time Collaborative Whiteboard Tools with AI-First Development

---

## Before You Start: Pre-Search (1 Hour)

After reviewing this document **but before writing any code**, complete the **Pre-Search methodology** at the end of this document.

This structured process uses AI to:
- Explore stack options
- Surface tradeoffs
- Document architecture decisions

Your Pre-Search output becomes part of your final submission.

This week emphasizes **AI-first development workflows**. Pre-Search is the first step in that methodology.

---

## Background

Miro solved hard problems:
- Real-time synchronization  
- Conflict resolution  
- Smooth performance while streaming data  

Multiple users can brainstorm and collaborate without merge conflicts.

This project requires you to:

1. Build production-scale collaborative whiteboard infrastructure  
2. Extend it with an AI agent that manipulates the board via natural language  

Focus: **AI-first development methodology** using coding agents, MCPs, and structured AI workflows.

> 🚪 Gate: Project completion is required for Austin admission.

---

# Project Overview

### One-Week Sprint

| Checkpoint | Deadline | Focus |
|------------|----------|-------|
| Pre-Search | Monday (1 hour in) | Architecture & planning |
| MVP | Tuesday (24 hours) | Collaborative infrastructure |
| Early Submission | Friday (4 days) | Full feature set |
| Final | Sunday (7 days) | Polish, documentation, deployment |

---

# MVP Requirements (24 Hours) — Hard Gate

All items required to pass:

- ☐ Infinite board with pan/zoom  
- ☐ Sticky notes with editable text  
- ☐ At least one shape type  
- ☐ Create, move, edit objects  
- ☐ Real-time sync (2+ users)  
- ☐ Multiplayer cursors with labels  
- ☐ Presence awareness  
- ☐ User authentication  
- ☐ Deployed & publicly accessible  

> A simple whiteboard with bulletproof multiplayer beats a feature-rich board with broken sync.

---

# Core Collaborative Whiteboard

## Board Features

| Feature | Requirements |
|----------|--------------|
| Workspace | Infinite board, smooth pan/zoom |
| Sticky Notes | Create/edit text, change colors |
| Shapes | Rectangles, circles, lines |
| Connectors | Lines/arrows between objects |
| Text | Standalone text elements |
| Frames | Group/organize content |
| Transforms | Move, resize, rotate |
| Selection | Single + multi-select |
| Operations | Delete, duplicate, copy/paste |

---

## Real-Time Collaboration

| Feature | Requirements |
|----------|--------------|
| Cursors | Multiplayer cursors w/ names |
| Sync | Instant object updates |
| Presence | Show active users |
| Conflicts | Handle simultaneous edits |
| Resilience | Graceful reconnect |
| Persistence | Board survives empty state |

---

## Testing Scenarios

1. 2 users editing simultaneously  
2. Refresh mid-edit (state persistence)  
3. Rapid object creation/movement  
4. Network throttling recovery  
5. 5+ concurrent users  

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame Rate | 60 FPS |
| Object Sync Latency | <100ms |
| Cursor Latency | <50ms |
| Object Capacity | 500+ |
| Concurrent Users | 5+ |

---

# AI Board Agent

## Required Capabilities

Must support **6+ commands** across:

### Creation
- "Add a yellow sticky note..."
- "Create a blue rectangle..."
- "Add a frame called Sprint Planning"

### Manipulation
- Move objects
- Resize frames
- Change colors

### Layout
- Arrange in grid
- Create 2x3 layout
- Space evenly

### Complex
- SWOT template
- User journey map
- Retrospective board

---

## Tool Schema (Minimum)

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

AI Agent Performance
Metric	Target
Response Latency	<2s
Command Breadth	6+ types
Complexity	Multi-step supported
Reliability	Accurate execution

All users must see AI results in real time.

AI-First Development Requirements

Use at least two of:

Claude Code

Cursor

Codex

MCP integrations

AI Development Log (1 Page Required)

Include:

Tools & workflow

MCP usage

3–5 effective prompts

% AI vs handwritten code

Strengths & limitations

Key learnings

AI Cost Analysis (Required)
Track Development Spend

LLM API costs

Token breakdown

API call count

Other AI costs

Production Cost Projections

Estimate monthly costs at:

Users	Cost
100	$
1,000	$
10,000	$
100,000	$

Include assumptions:

Commands per session

Sessions per user

Tokens per command

Technical Stack (Flexible)
Layer	Options
Backend	Firebase, Supabase, AWS, custom WS
Frontend	React/Vue/Svelte + Canvas
AI	OpenAI / Claude w/ function calling
Deployment	Vercel, Firebase Hosting, Render

Ship fast. Justify decisions via Pre-Search.

Build Strategy
Priority Order

Cursor sync

Object sync

Conflict handling

State persistence

Board features

Basic AI commands

Complex AI commands

Critical Guidance

Multiplayer sync is hardest — start here

Build vertically

Test in multiple browsers continuously

Throttle network

Test simultaneous AI commands

Submission Requirements

Deadline: Sunday 10:59 PM CT

Deliver:

GitHub repo + setup guide

Demo video (3–5 min)

Pre-Search document

AI Dev Log

AI Cost Analysis

Deployed app (5+ users supported)

Social post tagging @GauntletAI

Final Note

A stable multiplayer system with working AI beats a feature-heavy board with broken collaboration.

Project completion is required for Austin admission.

Appendix: Pre-Search Checklist
Phase 1: Define Constraints

Scale & load

Budget

Time to ship

Compliance

Team constraints

Phase 2: Architecture Discovery

Hosting

Auth

Database

Backend architecture

Frontend rendering

Third-party integrations

Phase 3: Post-Stack Refinement

Security

File structure

Naming conventions

Testing strategy

Tooling & DX

Save your AI conversations.
Document tradeoffs.
Be able to defend your decisions.