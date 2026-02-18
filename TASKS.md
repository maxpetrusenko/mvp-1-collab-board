# TASKS.md

Date initialized: 2026-02-16
Last updated: 2026-02-18 (requirements parity review + missing-requirement tests added)
Cadence: 1-hour deliverables with hard deadlines
Source: `mvp-1-collab-board/G4 Week 1 - CollabBoard-requirements.pdf`

## Priority Lanes
- Lane A: MVP hard gate (must pass first)
- Lane B: AI board agent
- Lane C: Submission artifacts and documentation
- Lane D: Operations (Linear, transcripts, OpenClaw readiness)
- Lane E: Post-MVP differentiators and collaboration depth

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
| T-009 | 2026-02-16 21:30 | Run 2-browser and refresh/disconnect tests | A | Max | Done |
| T-010 | 2026-02-17 09:30 | Deploy MVP public URL + verify hard gate checklist | A | Max | Done |
| T-011 | 2026-02-17 12:00 | Add AI command dispatcher and 3 basic commands | B | Max | Done |
| T-012 | 2026-02-18 12:00 | Expand to 6+ commands including layout + complex | B | Max | Done |
| T-013 | 2026-02-19 18:00 | Add automated tests for core collaboration flows | A | Max | Done |
| T-014 | 2026-02-20 18:00 | Prepare early submission package (video + docs) | C | Max | Done |
| T-015 | 2026-02-22 20:00 | Final polish, cost analysis, social post assets | C | Max | Done |
| T-016 | 2026-02-22 22:00 | Final submission freeze and upload | C | Max | Done |
| T-017 | 2026-02-17 14:00 | Implement and validate `BoardObject` + `CursorPresence` schemas | A | Max | Done |
| T-018 | 2026-02-17 16:00 | Implement LWW/versioned write and optimistic reconcile policy | A | Max | Done |
| T-019 | 2026-02-18 14:00 | Add AI idempotency records and per-board FIFO command ordering | B | Max | Done |
| T-020 | 2026-02-18 17:00 | Enable Firestore offline persistence + RTDB `onDisconnect()` | A | Max | Done |
| T-021 | 2026-02-19 12:00 | Add Playwright multi-context e2e for sync + concurrent AI commands | A | Max | Done |
| T-022 | 2026-02-19 16:00 | Add Konva stage manager optimization for high object count | A | Max | Done |
| T-023 | 2026-02-22 19:00 | Run manual OAuth browser throttle/reconnect demo and capture proof | A | Max | Done |
| T-024 | 2026-02-22 19:30 | Add demo video URL + social post URL to `SUBMISSION_PACKAGE.md` | C | Max | Done |
| T-025 | 2026-02-22 20:30 | Final QA sweep of all submission PDFs and links | C | Max | Done |
| T-026 | 2026-02-17 17:30 | Add OSS build-vs-buy scorecard and post-MVP roadmap to `PRESEARCH.md` | C | Max | Done |
| T-027 | 2026-02-23 12:00 | Run 1-2 day spike: Yjs + Hocuspocus + current object schema mapping | E | Max | Done |
| T-028 | 2026-02-23 18:00 | Implement connectors/arrows with snapping to object anchors | E | Max | Done |
| T-029 | 2026-02-24 14:00 | Implement frames with titled regions and drag-contained objects | E | Max | Done |
| T-030 | 2026-02-24 18:00 | Implement undo/redo command history for create/move/edit/delete | E | Max | Done |
| T-031 | 2026-02-25 14:00 | Add comments and @mentions on board objects | E | Max | Done |
| T-032 | 2026-02-25 18:00 | Add voting mode (dot voting) and facilitation timer | E | Max | Done |
| T-033 | 2026-02-26 14:00 | AI: smart layout analysis command (`organize this board`) | B | Max | Done |
| T-034 | 2026-02-26 18:00 | AI: synthesize sticky notes into grouped themes | B | Max | Done |
| T-035 | 2026-02-27 14:00 | Add screenshot-to-stickies (OCR ingest pipeline) | E | Max | Done |
| T-036 | 2026-02-27 18:00 | Add export to image/PDF (full board and selection) | E | Max | Done |
| T-037 | 2026-02-28 14:00 | Add voice command input (Web Speech API) to AI panel | E | Max | Done |
| T-038 | 2026-02-28 18:00 | Add activity timeline (event replay baseline) | E | Max | Done |
| T-039 | 2026-03-01 14:00 | Add mini-map navigation and keyboard shortcuts reference panel | E | Max | Done |
| T-040 | 2026-02-17 20:00 | Add Yjs pilot mirror scaffold behind env flag (`VITE_SYNC_BACKEND`) | E | Max | Done |
| T-041 | 2026-02-17 21:00 | Optimize laptop-height layout (compact chrome, non-scrolling board shell, tabbed side navigation) | E | Max | Done |
| T-042 | 2026-02-17 21:30 | Refresh Playwright assertions for modern login/header and add laptop viewport fit regression test | A | Max | Done |
| T-043 | 2026-02-17 22:00 | Add explicit icon tooltips and convert AI assistant into open/minimize chat widget | E | Max | Done |
| T-044 | 2026-02-17 22:20 | Fix presence status colors (green online/orange away) from heartbeat + add e2e regression | A | Max | Done |
| T-045 | 2026-02-17 22:45 | Make shapes editable (inline text + shape type switch for rectangle/circle/diamond/triangle) | E | Max | Done |
| T-046 | 2026-02-17 23:00 | Add UI AI-command e2e (chat widget submit -> board object created) | A | Max | Done |
| T-047 | 2026-02-17 23:20 | Add E2E coverage for delete flows (toolbar/Delete/Backspace + disabled state) | A | Max | Done |
| T-048 | 2026-02-17 23:35 | Add E2E coverage for sticky/shape color changes and palette visibility | A | Max | Done |
| T-049 | 2026-02-17 23:45 | Add AI error-path E2E coverage (unsupported/malformed/recovery) | A | Max | Done |
| T-050 | 2026-02-17 23:55 | Add voice-input UI E2E coverage (unsupported browser + runtime fallback) | A | Max | Done |
| T-051 | 2026-02-18 00:05 | Extract shared Firestore E2E helper and expand AI UI color-command coverage | A | Max | Done |
| T-052 | 2026-02-18 00:20 | Remove standalone shape-create toolbar actions; allow sticky note shape + color customization with AI tab defaulting on right sidebar | E | Max | Done |
| T-053 | 2026-02-18 00:35 | Route AI "add shape" commands to shaped sticky notes to match UI shape-removal decision | B | Max | Done |
| T-054 | 2026-02-18 00:55 | Add E2E sticky drag persistence test to guarantee sticky remains at released position after drag end | A | Max | Done |
| T-055 | 2026-02-18 01:10 | Add non-Playwright unit test suite for drag write ordering (single-user late packets + multi-user concurrent drags) | A | Max | Done |

## Current Evidence Snapshot
- Deployed app: `https://mvp-1-collab-board.web.app`
- Playwright run: `32 passed, 0 skipped` (`npx playwright test --list`, 2026-02-17)
- Targeted regression run: `14 passed` (`npx playwright test e2e/object-deletion.spec.ts e2e/color-changes.spec.ts e2e/ai-errors.spec.ts e2e/voice-input.spec.ts e2e/ai-command-ui.spec.ts`, 2026-02-17)
- Local validation run (post T-052): `5 passed` (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/color-changes.spec.ts e2e/shape-editing.spec.ts e2e/mvp-regression.spec.ts`, 2026-02-17)
- Functions validation run (post T-053): `10 passed` (`cd functions && npm test`, 2026-02-17)
- Sticky drag persistence validation (post T-054): `1 passed` (`npx playwright test e2e/sticky-drag-persistence.spec.ts`, 2026-02-17)
- Sticky drag persistence stress run (post T-054): `8 passed` (`npx playwright test e2e/sticky-drag-persistence.spec.ts --repeat-each=8`, 2026-02-17)
- Drag ordering unit validation (post T-055): `3 passed` (`cd app && npm run test:unit`, 2026-02-17)
- Auth strategy for automation: QA email/password flow via `/login?qaAuth=1`
- MVP regression spec: `1 passed` (`npx playwright test e2e/mvp-regression.spec.ts`, 2026-02-17)
- Critical backend checks: `scripts/run-critical-checks.sh`
- Latest artifact bundle:
  - `submission/test-artifacts/latest-critical-checks.json`
  - `submission/test-artifacts/latest-critical-checks.log`
- Submission QA bundle:
  - `submission/test-artifacts/latest-submission-qa.json`
  - `scripts/run-submission-qa.sh`
- Manual OAuth/reconnect proof:
  - `submission/test-artifacts/manual-oauth-throttle-reconnect-2026-02-17.md`
- Freeze record:
  - `submission/SUBMISSION_FREEZE_2026-02-17.md`
- Architecture spike notes: `docs/YJS_SPIKE.md`
- Yjs pilot scaffold: `app/src/collab/yjs/*` + sync mode pill (`[data-testid=\"sync-mode-pill\"]`)

## Tomorrow Review Backlog (Ordered)
Current implementation rating snapshot (review-only, no test execution in this pass):
- **PRD (41 FRs)**: `PASS 20 / PARTIAL 17 / FAIL 4` = 20/41 fully passing (49%)
- **G4 PDF (22 core reqs)**: `PASS 16 / PARTIAL 1 / FAIL 5` = 16/22 fully passing (73%)
- **Overall readiness**: `~75 / 100` when combining PRD + G4 PDF gaps; target is `95+`.
- **Critical missing**: multi-select UI (FR-7), visual resize handles, board management UI, command history, sticky color count (6 vs 5 required).

### 1) Requirements

#### PRD FR Gaps (41 Functional Requirements)
- [ ] `RQ-001` Close FR-7 gap: implement true multi-select behavior (not single `selectedId` replacement only). Includes: shift+click to extend selection, drag box select, bulk move/delete/duplicate.
- [ ] `RQ-002` Close FR-17 gap: expose required AI tools in registry (`resizeObject`, `updateText`, `getBoardState`). Tool registry at `functions/src/tool-registry.js` missing these 3 tools.
- [ ] `RQ-003` Close FR-32 gap: make `updatedAt` server-authoritative (remove client `Date.now()` ownership for LWW arbitration). Currently set by client at `BoardPage.tsx:926`.
- [ ] `RQ-004` Close FR-41 gap: add reconnect/syncing UX states that are visible during offline/online transitions. Header only shows sync backend mode.
- [ ] `RQ-005` Close FR-24 gap: add visible duplicate UI action in addition to keyboard shortcut (Cmd/Ctrl+D). Toolbar has delete but no duplicate button.
- [ ] `RQ-006` Close FR-25 gap: verify/guarantee copy-paste contract (style preserved + deterministic offset). Test exists but needs verification.
- [ ] `RQ-007` Close AC-2 collaboration gap: explicit two-browser simultaneous object edit coverage.
- [ ] `RQ-008` Close AC-2 refresh gap: explicit refresh-mid-edit consistency coverage.
- [ ] `RQ-009` Close FR-19 gap: explicit two-user proof that AI output is visible to collaborators.
- [ ] `RQ-010` Close FR-18 gap: ensure all declared AI tools are executable in `executeViaLLM` switch routing. `resizeObject`, `updateText`, `getBoardState` missing from switch at `functions/index.js:809`.

#### G4 PDF Additional Gaps
- [ ] `RQ-011` Close G4 Board Management gap: implement board create/delete UI with name/description. Currently boards are implicit (created on first access via URL).
- [ ] `RQ-012` Close G4 Board List gap: implement board list page/component for switching between boards.
- [ ] `RQ-013` Close G4 Color Picker gap: reduce sticky colors from 6 to 5 (G4 PDF specifies exactly 5). Currently: yellow, orange, red, green, blue, purple (6 colors) at `BoardPage.tsx:102`.
- [ ] `RQ-014` Close G4 Command History gap: implement command history storage and UI in AI panel. Listed as Post-MVP in TASKS.md:48 (T-030).

#### Multi-Select UX Specifics (FR-7 breakdown)
- [ ] `RQ-015` Implement shift+click to add/remove objects from selection (toggle individual items).
- [ ] `RQ-016` Implement drag-box selection (marquee select) for multiple objects.
- [ ] `RQ-017` Show visual selection indicator for all selected objects (not just primary selection).
- [ ] `RQ-018` Implement bulk move: dragging selected group moves all objects together.
- [ ] `RQ-019` Implement bulk delete: delete removes all selected objects.
- [ ] `RQ-020` Implement bulk duplicate: duplicate creates copies of all selected objects.
- [ ] `RQ-021` Implement bulk color change: color picker applies to all selected objects.
- [ ] `RQ-022` Change state model from `selectedId` (singular) to `selectedIds` (array/Set).

#### Resize/Edit Interaction Gaps
- [ ] `RQ-023` Close Visual Resize gap: no resize handles on objects. Size changes only via AI command or property panel (if exists).
- [ ] `RQ-024` Close Inline Text Edit gap: double-click works but single-click to edit text on sticky notes would be better UX.

### 2) Refactoring
- [ ] `RF-001` Centralize object patch write path so metadata (`updatedAt`, `updatedBy`, `version`) cannot drift across create/patch/delete.
- [ ] `RF-002` Introduce explicit selection model (`selectedIds`) to support multi-select/bulk ops cleanly.
- [ ] `RF-003` Separate realtime transport concerns (presence, object sync, reconnect state) from rendering concerns in `BoardPage`.
- [ ] `RF-004` Align AI tool registry and executor handlers so declared tools and executable handlers stay 1:1.

### 3) Tests

#### Existing Requirement Tests
- [ ] `TS-001` Keep `app/e2e/requirements-collab-parity.spec.ts` as FR-9 sync contract (create + move cross-browser).
- [ ] `TS-002` Keep `app/e2e/requirements-collab-parity.spec.ts` as FR-14 refresh consistency contract.
- [ ] `TS-003` Keep `app/e2e/requirements-collab-parity.spec.ts` as FR-19 collaborator AI visibility contract.
- [ ] `TS-004` Keep `app/e2e/requirements-object-ops-gap.spec.ts` as FR-24 visible duplicate action contract.
- [ ] `TS-005` Keep `app/e2e/requirements-object-ops-gap.spec.ts` as FR-25 copy/paste style+offset contract.
- [ ] `TS-006` Keep `app/e2e/requirements-object-ops-gap.spec.ts` as FR-7 multi-select bulk-delete contract.
- [ ] `TS-007` Keep `app/e2e/requirements-reconnect-ux.spec.ts` as FR-41 reconnect/sync UX contract.
- [ ] `TS-008` Keep `functions/test/requirements-tool-schema.test.js` as FR-17 tool-schema completeness contract.
- [ ] `TS-009` Keep `app/test/requirements-conflict-model.test.mjs` as FR-32 timestamp authority guardrail.
- [ ] `TS-010` Keep `functions/test/requirements-tool-execution-parity.test.js` as FR-18 tool execution parity contract.

#### Additional G4 PDF Gap Tests
- [ ] `TS-011` Add test for G4 board create UI (RQ-011) - board with name/description.
- [ ] `TS-012` Add test for G4 board list display (RQ-012) - switcher shows boards.
- [ ] `TS-013` Add test for G4 sticky color count (RQ-013) - exactly 5 colors, not 6.
- [ ] `TS-014` Add test for G4 command history (RQ-014) - panel shows past commands.

#### Multi-Select Interaction Tests (FR-7)
- [ ] `TS-015` Add test for shift+click multi-select (RQ-015) - toggle selection.
- [ ] `TS-016` Add test for drag-box selection (RQ-016) - marquee select multiple.
- [ ] `TS-017` Add test for visual selection indicators (RQ-017) - all selected show outline.
- [ ] `TS-018` Add test for bulk move (RQ-018) - drag selected group moves all.
- [ ] `TS-019` Add test for bulk duplicate (RQ-020) - duplicate copies all selected.
- [ ] `TS-020` Add test for bulk color change (RQ-021) - color applies to all selected.

#### Resize/Edit UX Tests
- [ ] `TS-021` Add test for visual resize handles (RQ-023) - drag corner to resize object.
- [ ] `TS-022` Add test for single-click text edit (RQ-024) - click sticky to edit text.

### 4) Lean Code
- [ ] `LN-001` Remove dead paths and duplicate command parsing branches once FR gaps are closed.
- [ ] `LN-002` Keep test helpers composable and minimal; avoid per-spec custom utilities when shared helpers exist.

### 5) No Overengineering
- [ ] `NG-001` Prefer smallest viable fixes for FR-7/FR-24/FR-41 before any architecture expansion.
- [ ] `NG-002` Do not introduce CRDT/full transport rewrite until current PRD gaps are green.

### 6) High Rating
- [ ] `HR-001` Require every PRD FR to be mapped to either a passing test or an explicit deferred decision in `DECISIONS.md`.
- [ ] `HR-002` Raise performance thresholds/tests to match PRD numbers where currently looser.

### 7) Beautiful Code
- [ ] `BC-001` Keep naming consistent (`sticky`, `shape`, `frame`, `connector`) across UI, types, and AI tool layers.
- [ ] `BC-002` Keep side-effect boundaries explicit: render code should not own transport mutation logic.

### 8) 1 Test for 1 Feature
- [ ] `OT-001` Maintain single-feature assertion scope per new requirement test (no bundled multi-requirement tests).
- [ ] `OT-002` Ensure each requirement test title includes FR/AC identifier for auditability.

### 9) No Redundancies
- [ ] `NR-001` Deduplicate overlapping E2E assertions between legacy regression specs and new requirement-gap specs.
- [ ] `NR-002` Consolidate repeated auth/bootstrap logic via helper usage instead of per-file duplication.

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
- T-023, T-024, and T-025 closed with hosted artifacts + QA sweep.
- T-027 informs long-term collaboration architecture path.
- T-028 through T-032 block post-MVP collaboration parity milestone.
- T-033 through T-038 block AI-first differentiation milestone.
- T-041 depends on T-039 baseline minimap/toolbar work.
- T-042 validates T-041 and updated login/header UX selectors.
- T-045 extends editable-object parity for non-sticky shapes.
- T-046 validates end-to-end AI command execution through the UI widget.

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
- Latest sync prep:
  - `LINEAR_T027_T039_IMPORT.md` contains copy-ready status updates and ticket payloads for T-027 through T-039.

## Required Artifacts Checklist
- [x] Public deployed URL
- [x] Demo video URL and capture artifact
- [x] Pre-Search checklist completion
- [x] AI Development Log (1 page)
- [x] AI Cost Analysis (dev spend + projections)
- [x] Architecture overview + setup guide in repo
- [x] Test evidence bundle (`submission/test-artifacts/*`)
- [x] Social post URL and screenshot assets package

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
- [x] Export session transcripts and keep in `Sessions/`.
- [x] Publish curriculum/transcript package to Notion (package prepared in `Sessions/notion-curriculum-package-2026-02-17.md`).
- [x] Confirm OpenClaw read/push access remains functional.
- [x] Keep `DECISIONS.md` updated whenever architecture changes.
- [x] Create/update Linear issues for T-027 through T-039 (batch update file prepared: `LINEAR_T027_T039_IMPORT.md`).
