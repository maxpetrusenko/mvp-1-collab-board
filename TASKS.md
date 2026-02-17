# TASKS.md

Date initialized: 2026-02-16
Last updated: 2026-02-16
Cadence: 1-hour deliverables with hard deadlines
Source: `mvp-1-collab-board/G4 Week 1 - CollabBoard-requirements.pdf`

## Priority Lanes
- Lane A: MVP hard gate (must pass first)
- Lane B: AI board agent
- Lane C: Submission artifacts and documentation
- Lane D: Operations (Linear, transcripts, OpenClaw readiness)

## Hourly Execution Plan

| ID | Deadline (CT) | Task | Lane | Owner | Status |
|---|---|---|---|---|---|
| T-001 | 2026-02-16 14:30 | Finalize `PRESEARCH.md` from PDF rubric | C | Max | Done |
| T-002 | 2026-02-16 15:00 | Finalize `PRD.md`, `MVP.md`, `DECISIONS.md` | C | Max | Done |
| T-003 | 2026-02-16 15:30 | Break implementation work into Linear tickets | D | Max | Done |
| T-004 | 2026-02-16 16:30 | Initialize app scaffold (web + backend functions) | A | Max | Done |
| T-005 | 2026-02-16 17:30 | Implement authentication flow | A | Max | Done |
| T-006 | 2026-02-16 18:30 | Implement presence and multiplayer cursors | A | Max | Done |
| T-007 | 2026-02-16 19:30 | Implement object create/move/edit + realtime sync | A | Max | Done |
| T-008 | 2026-02-16 20:30 | Implement infinite pan/zoom + shape support | A | Max | Done |
| T-009 | 2026-02-16 21:30 | Run 2-browser and refresh/disconnect tests | A | Max | In Progress |
| T-010 | 2026-02-17 09:30 | Deploy MVP public URL + verify hard gate checklist | A | Max | Done |
| T-011 | 2026-02-17 12:00 | Add AI command dispatcher and 3 basic commands | B | Max | Done |
| T-012 | 2026-02-18 12:00 | Expand to 6+ commands including layout + complex | B | Max | Done |
| T-013 | 2026-02-19 18:00 | Add automated tests for core collaboration flows | A | Max | In Progress |
| T-014 | 2026-02-20 18:00 | Prepare early submission package (video + docs) | C | Max | Done |
| T-015 | 2026-02-22 20:00 | Final polish, cost analysis, social post assets | C | Max | In Progress |
| T-016 | 2026-02-22 22:00 | Final submission freeze and upload | C | Max | Todo |
| T-017 | 2026-02-17 14:00 | Implement and validate `BoardObject` + `CursorPresence` schemas | A | Max | Done |
| T-018 | 2026-02-17 16:00 | Implement LWW/versioned write and optimistic reconcile policy | A | Max | Done |
| T-019 | 2026-02-18 14:00 | Add AI idempotency records and per-board FIFO command ordering | B | Max | Done |
| T-020 | 2026-02-18 17:00 | Enable Firestore offline persistence + RTDB `onDisconnect()` | A | Max | Done |
| T-021 | 2026-02-19 12:00 | Add Playwright multi-context e2e for sync + concurrent AI commands | A | Max | In Progress |
| T-022 | 2026-02-19 16:00 | Add Konva stage manager optimization for high object count | A | Max | Done |
| T-023 | 2026-02-22 19:00 | Run manual OAuth browser throttle/reconnect demo and capture proof | A | Max | Todo |
| T-024 | 2026-02-22 19:30 | Add demo video URL + social post URL to `SUBMISSION_PACKAGE.md` | C | Max | Todo |
| T-025 | 2026-02-22 20:30 | Final QA sweep of all submission PDFs and links | C | Max | Todo |

## Current Evidence Snapshot
- Deployed app: `https://mvp-1-collab-board.web.app`
- Playwright run: `6 passed, 5 skipped` (`npm run test:e2e`)
- Critical backend checks: `scripts/run-critical-checks.sh`
- Latest artifact bundle:
  - `submission/test-artifacts/latest-critical-checks.json`
  - `submission/test-artifacts/latest-critical-checks.log`

## Dependency Map
- T-004 blocked T-005, T-006, T-007.
- T-005 blocked T-006 and T-010.
- T-006 and T-007 blocked T-009.
- T-007 blocked T-017 and T-018.
- T-017 blocked T-019 and T-021.
- T-018 blocked T-021.
- T-019 blocked final AI reliability sign-off.
- T-020 blocked reconnect validation.
- T-009, T-020, and T-021 feed hard-gate confidence.
- T-023 blocks T-024.
- T-024 and T-025 block T-016.

## Execution Roles
- Max: accountable owner and final decision maker.
- Codex: architecture/docs/review support and implementation assistance.
- Cursor: implementation acceleration and rapid edits.
- Claude: adversarial review and prompt iteration support.

## Linear Integration Status
- Integration confirmed for team `Maxpetrusenko`.
- Existing issues:
  - T-004 -> `MAX-19`
  - T-005 -> `MAX-20`
  - T-006 -> `MAX-21`
  - T-007 -> `MAX-22`
  - T-008 -> `MAX-23`
  - T-009 -> `MAX-24`
  - T-010 -> `MAX-25`
- Pending sync:
  - update statuses for T-004 through T-022
  - create tickets for T-023 through T-025

## Required Artifacts Checklist
- [x] Public deployed URL
- [ ] Demo video (3-5 minutes)
- [x] Pre-Search checklist completion
- [x] AI Development Log (1 page)
- [x] AI Cost Analysis (dev spend + projections)
- [x] Architecture overview + setup guide in repo
- [x] Test evidence bundle (`TEST_EVIDENCE.md` + artifacts)
- [ ] Social post published with screenshots

## Linear Ticket Skeleton
Use this template for each ticket:
- Title: `[Lane] <Feature/Task>`
- Description:
  - Goal
  - Scope in/out
  - Acceptance criteria
  - Test plan
  - Deadline

## Operations Tasks
- [ ] Export session transcripts and keep in `Sessions/`.
- [ ] Publish curriculum/transcript package to Notion.
- [x] Confirm OpenClaw read/push access remains functional.
- [x] Keep `DECISIONS.md` updated whenever architecture changes.
