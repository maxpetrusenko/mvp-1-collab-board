# Gauntlet G4 - Agent Protocol

> **Deadline**: Sunday 10:59 PM CT | **Portal**: https://gauntlet-portal.web.app | **Email**: max.petrusenko@gfachallacker.gauntletai.com

---

## Project Overview

**Context**: Government companies hiring; participation requires full context + defendable decisions.

**Tech Stack Awareness**: TypeScript, Python, Go, Rails — know tradeoffs.

**Potential Project**: AI avatar + images + late.dev + scheduling + news search + OpenAI (board creation access)

---

## 1. Development Workflow

### Core Principles
- **E2E TDD**: End-to-end test driven development (not frontend)
- **Frontend**: Cursor agent + tests/review (no rewriting tests to pass)
- **Scalability**: Does code scale? Perform well?
- **Components**: React 17+ with types
- **Reuse**: Pre-built solutions over scratch builds
- **Reusability**: build modular reusable components ( code ui and back end too ) that we can reuse for multiple items

### Golden Rule: E2E First
- Always write a failing Playwright E2E test before implementation.
- Exception: hot-fixes may ship immediately, but must include the regression E2E test in the same commit.
- Do not rewrite tests just to force a passing result.

### Tools & Agents
- **Review**: Thinking Claude, Speed Cursor, Clarity Codex
- **Decisions**: Track in `DECISIONS.md` — defend every change
- **Research**: Google Deep Research → Perplexity fallback
- **Presearch**: Generate doc, throw at multiple AIs for diverse responses
- **Cursor**: Use indexing if available
- **Linear**: ticket tracking

---

## 2. Documentation Structure

```
/docs/
├── PRESEARCH.md           # Phase 1-3 checklist
├── PRD.md                 # Product requirements
├── MVP.md                 # Minimum viable features
├── DECISIONS.md           # Defendable choices
├── DEMO_SCRIPT.md         # 3-5 min demo
├── AI_DEVELOPMENT_LOG.md  # 1-page dev log
├── AI_COST_ANALYSIS.md    # Dev spend + projections
├── SUBMISSION_PACKAGE.md  # Deliverables checklist
├── TEST_EVIDENCE.md       # Test results
├── YJS_SPIKE.md           # CRDT research
└── DOCUMENTATION.md       # Architecture
```

**Walk docs every update** (PRD, MVP, Patterns, Duplication check)

---

## 3. Submission Requirements

| Deliverable | Format |
|-------------|--------|
| Deployed app | Public URL, 5+ users, auth |
| Demo video | 3-5 min: collaboration + AI + architecture |
| Pre-search doc | PDF (complete checklist) |
| AI dev log | 1 page (see template below) |
| AI cost analysis | Dev spend + 100/1K/10K/100K projections |
| Social post | X or LinkedIn, tag @GauntletAI |
| GitHub repo | Setup guide, architecture, deployed link |

### AI Development Log Template
- Tools & Workflow (AI coding tools, integration)
- MCP Usage (which + what enabled)
- Effective Prompts (3-5 actual prompts)
- Code Analysis (% AI vs handwritten)
- Strengths & Limitations
- Key Learnings

### Cost Analysis Projections
Track: LLM costs, tokens in/out, API calls, other costs

**Per 100/1K/10K/100K users**: Include assumptions for commands/session, sessions/month, tokens per command

---

## 4. Technical Stack Options

**Backend**: Firebase (Firestore/Realtime DB/Auth), Supabase, AWS (DynamoDB/Lambda/WebSockets), custom WebSocket

**Frontend**: React/Vue/Svelte + Konva.js/Fabric.js/PixiJS/HTML5 Canvas

**AI**: OpenAI GPT-4 or Anthropic Claude (function calling)

**Deployment**: Vercel, Firebase Hosting, Render

> Ship fastest path; justify with Pre-Search

---

## 5. Build Strategy (Priority)

1. Cursor sync — two browsers, real-time movement
2. Object sync — sticky notes for all users
3. Conflict handling — simultaneous edits
4. State persistence — survive refresh/reconnect
5. Board features — shapes, frames, connectors, transforms
6. AI commands (basic) — single-step create/manipulate
7. AI commands (complex) — multi-step templates

**Critical**: Multiplayer sync is hardest. Build vertically, test continuously with multiple browsers, throttle network, test concurrent AI commands.

---

## 6. System Design Focus

**Main focus now**: System design → data storage, security, file structure, legacy code, naming, testing, refactoring

**Presearch → PRD → Stack**: All PDFs

**Questions**: Requirements? Scaling/load profiles? Budget? Ship timeline? Team? Auth?

---

## 7. Quality Gates

- [ ] Updated `TASKS.md` after feature
- [ ] Tests for every new feature
- [ ] E2E examples: github.com/steipete/CodexBar/tree/main/Tests
- [ ] Linear tickets synced
- [ ] Review covered everything

---

## 8. Quick Tasks (1-hr deliverables)

1. Download all transcripts → Gauntlet Notion curriculum
2. System design resources (top forked: META, OpenAI, Claude)
3. IP selection if hiring partner
4. Cursor rules + skills setup
5. OpenAI integration

---

## 9. Resources

**System Design**: Search top-rated/forked repos (META, OpenAI, Claude)

**Test Examples**: [CodexBar Tests](https://github.com/steipete/CodexBar/tree/main/Tests)

**Session Transcripts**: `Sessions/` folder
