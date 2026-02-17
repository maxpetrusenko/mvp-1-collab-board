# Notion Curriculum Package (Copy/Paste)

## Week 1 Theme
Realtime collaboration architecture + AI command orchestration under deadline constraints.

## Learning objectives
- Model multiplayer board state with conflict-safe updates.
- Implement deterministic AI command processing (FIFO + idempotency).
- Build submission-ready documentation and verification evidence.

## Modules
1. System design pre-search and tradeoff framing (`PRESEARCH.md`, `DECISIONS.md`).
2. MVP implementation (`app/`, `functions/`).
3. Testing strategy (`TEST_EVIDENCE.md`, `app/e2e/`).
4. Cost and operations (`AI_COST_ANALYSIS.md`, `TASKS.md`).
5. Submission hardening (`SUBMISSION_PACKAGE.md`, `submission/`).

## Demo assets
- `https://mvp-1-collab-board.web.app/submission/collabboard-demo-2026-02-17_15-47-06.webm`
- `https://mvp-1-collab-board.web.app/submission/social-post-draft-2026-02-17.txt`

## Assessment prompts
- Why was Firebase chosen for MVP speed and delivery risk reduction?
- How does queue sequencing guarantee deterministic AI command execution?
- What changed after adding post-MVP collaboration depth features?
