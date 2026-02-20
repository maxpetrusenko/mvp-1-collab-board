# Gauntlet Fellowship — Cohort G4 (Operating Notes)


---

## Context

- Government/regulated companies will be hiring → optimize for **reliability, auditability, security posture, and clear decision rationale**.
- Tech stack varies per project; we must be able to justify stack choice:
- **TypeScript / Python / Go / Rails** — know *why* one beats another for a given constraint set.
- Login: https://gauntlet-portal.web.app/login  
- Account: `max.petrusenko@gfachallenger.gauntletai.com`
- url `https://mvp-1-collab-board.web.app/b/mvp-demo-board`


## Tooling Principles

- Use different tools for different strengths:
  - **Claude (thinking / architecture)**
  - **Cursor (speed / implementation)**
  - **Codex (clarity / review & refactor )**
- If decisions change: **document why** (we must defend it later).

---

## Required Documentation (Keep Updated)

### `Requirements.md` (mandatory, this has to be delivered to client)

### `DECISIONS.md` (mandatory, table view or map to view easily)
- What we decided
- Alternatives considered
- Why we chose this
- What would change our mind
- Date + link to relevant discussion/transcript

### `Tasks.md` (mandatory)
- Ticket list + status
- Each feature: link to tests + PR/commit

## Engineering Standards

- We are making **system decisions** → prioritize correctness under constraints.
- **E2E TDD**:
  - Use for backend/system flows.
  - Avoid forcing E2E TDD for frontend UI polish.
- Frontend expectations:
  - Components + types (if React, use **v17+**).
  - **do not rewrite tests just to pass**.
- Code quality:
  - Must scale and perform reasonably.
  - Indexing + query design matters (especially Firestore / SQL).
- **Scalability**: Does code scale? Perform well?
- **Components**: React 17+ with types + tailwind + shadcn
- **Reuse**: Pre-built solutions over scratch builds, use components

Ask these questions before coding and when planning:
is this convention?
is this best practice?
find me a short 1-2 minute overview youtube video for it
is this secure? 1-10
is this easy to use? 1-10
is this performant? 1-10
is this have good ui\ux? 1-10
can this be build cheap? 1-10
what do i need to know about this stack?

---

## Research Workflow

- Always run **Presearch** first.
- Use **multi-model triangulation**:
  - Create Presearch doc once.
  - “Throw it” into multiple AIs → compare responses.
- Prefer Google Deep Research; if unavailable, use Perplexity.

---

## Hosting & System Design Focus

Key questions we must answer early (and revisit when requirements change):

- What’s the main focus *right now*? (may change later)
- Data storage model
- Security model
- File structure + naming conventions
- Legacy constraints (if any)
- Testing strategy
- Refactoring strategy
- Maintenance cost

System design checklist:
- Time to ship?
- Requirements clarity?
- Scaling/load profile?
- Budget?
- Team size/roles?
- Authentication?
- Failure modes?

---

## Docs & Tests Workflow

- If not already done: generate **PRD + MVP** from `requirements.md`.
- Walk through documentation *every time it changes*:
  - PRD
  - MVP
  - Patterns
  - Duplication / inconsistencies
- Use `www.Skills.sh` downloads progressively:
  - project-level skill + symlink
- Tests:
  - Build tests for every new feature.
  - References:
    - https://github.com/steipete/CodexBar/tree/main/Tests
    - (E2E TDD styles referenced by Jeffrey Emanuel / Steve Yegge)

---

## Project Management

- Use **Linear** for tickets.
- After implementing a new feature:
  - Update `Tasks.md`
  - Update tests
  - Add/refresh `DECISIONS.md` entries
- Track maintenance cost implications.

---

## Tasks (Draft)

1. Can I download all transcripts and save them from Google to Gauntlet Notion (curriculum)?
2. Define “1 hour deliverables” and hard deadlines per week.
3. Find a good resource for system design:
   - Search top-rated + most-forked repos (Meta, OpenAI, Anthropic patterns).
4. IP implications if selecting a hiring partner.
5. If using Cursor rules and Skills.sh patterns, document them.
6. Hand this plan to OpenClaw (as operating context).
7. Reminder: use Aqua + Whisper for talking to AI instead of typing.

---

## Submission Requirements (Must Include)

- Deployed app(s)
- Demo video
- Pre-search doc
- AI development log (1 page)
- LinkedIn or X post: what I did in 1 week
- AI cost analysis
- Document submission as **PDF**
- Add **PAT token** if GitHub repo access needs it

---

## AI Development Log (Required Template)

Submit a 1-page document covering:

- Tools & Workflow: which AI coding tools were used and how integrated
- MCP Usage: which MCPs were used (if any) and what they enabled
- Effective Prompts: 3–5 prompts that worked well (include actual prompts)
- Code Analysis: rough % AI-generated vs hand-written
- Strengths & Limitations: where AI excelled and struggled
- Key Learnings: insights about working with coding agents

---

## AI Cost Analysis (Required)

Track development and testing costs:

- LLM API costs (OpenAI, Anthropic, etc.)
- Total tokens consumed (input/output breakdown)
- Number of API calls
- Other AI-related costs (embeddings, hosting)

Production cost projections must include:

- 100 users: $___/month
- 1,000 users: $___/month
- 10,000 users: $___/month
- 100,000 users: $___/month

Include assumptions:

- average AI commands per user per session
- average sessions per user per month
- token counts per command type

---

## Technical Stack (Possible Paths)

- Backend:
  - Firebase (Firestore, Realtime DB, Auth)
  - Supabase
  - AWS (DynamoDB, Lambda, WebSockets)
  - Custom WebSocket server
- Frontend:
  - React / Vue / Svelte + Konva.js / Fabric.js / PixiJS / Canvas
  - Vanilla JS (if fastest)
- AI integration:
  - OpenAI (function calling)
  - Anthropic Claude (tool use / function calling)
- Deployment:
  - Vercel
  - Firebase Hosting
  - Render

> Rule: choose whichever ships fastest **after** completing Pre-Search to justify decisions.

---

## Build Strategy (Priority Order)

1. Cursor sync — two cursors moving across browsers
2. Object sync — sticky notes appear for all users
3. Conflict handling — simultaneous edits
4. State persistence — survive refresh + reconnect
5. Board features — shapes, frames, connectors, transforms
6. AI commands (basic) — single-step creation/manipulation
7. AI commands (complex) — multi-step template generation

---

## Critical Guidance

- Multiplayer sync is the hardest part → start here.
- Build vertically: finish one layer before the next.
- Test with multiple browser windows continuously.
- Throttle network speed during testing.
- Test simultaneous AI commands from multiple users.

---

## Deadline & Deliverables

- Deadline: Sunday 10:59 PM CT
- GitHub repo must include:
  - setup guide
  - architecture overview
  - deployed link
- Demo video (3–5 min):
  - realtime collaboration
  - AI commands
  - architecture explanation
- Pre-Search document:
  - completed checklist (Phase 1–3)
- AI Development Log:
  - 1-page breakdown using required template
- AI Cost Analysis:
  - dev spend + projections for 100/1K/10K/100K users
- Deployed app:
  - publicly accessible
  - supports 5+ users with auth
- Social post:
  - X or LinkedIn with features + demo/screenshots
  - tag `@GauntletAI`