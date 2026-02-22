# TASKS.md

Date initialized: 2026-02-16
Last updated: 2026-02-22 (LLM/runtime gap closure + BoardPageRuntime primitive/helper extraction)
Cadence: half-day sprint checkpoints
Source: `AGENTS.md` + `G4 Week 1 - CollabBoard-requirements.pdf`

## ACTIVE (Current Sprint, ~5 items)

| ID | Lane | Task | Status | Target |
|---|---|---|---|---|
| T-102 | B | Add AI command position understanding (top/bottom/left/right, center coordinates) | Done | 2026-02-22 |
| T-103 | B | Optimize AI command latency to <2s and capture updated evidence | Done | 2026-02-22 |
| T-136 | B | Implement Firestore batch writes for AI template creation paths (`createSwotTemplate`, `createRetrospectiveTemplate`, `createStickyGridTemplate`, `createJourneyMap`) | Done | 2026-02-21 |
| T-137 | C | Publish dated requirements compliance assessment with evidence matrix | Done | 2026-02-21 |
| T-138 | B | Harden AI queue lock lifecycle with heartbeat renewal while commands run | Done | 2026-02-21 |
| T-139 | A | Tune cursor publish loop (33ms interval + duplicate suppression) and remeasure strict SLA | Done | 2026-02-22 |
| T-140 | E | Extract shared runtime time helpers from `BoardPageRuntime.tsx` without breaking guardrail tests | Done | 2026-02-21 |
| T-141 | D | Stabilize gate/test execution with dynamic preview port selection and isolated Playwright output directories (`scripts/run-full-gate.sh` + `app/playwright.config.ts`) | Done | 2026-02-21 |
| T-142 | B | Shift AI command handling to LLM-first “board note creator agent” flow (full prompt/context to model, deterministic parser removed from primary path) | Done | 2026-02-22 |
| T-143 | E | Refactor board sharing helper module into focused request/actions and shared type modules (`boardSharingHelpers.ts`, `boardSharingRequests.ts`, `boardSharingTypes.ts`) | Done | 2026-02-21 |
| T-144 | E | Extract selection state/model into a dedicated hook (`useBoardSelection`) while preserving runtime guardrail markers and behavior | Done | 2026-02-21 |
| T-145 | E | Extract sticky/shape/text canvas renderers from `BoardPageRuntime.tsx` into dedicated renderer modules while preserving runtime behavior | Done | 2026-02-22 |
| T-146 | B | Close requirements-driven AI/runtime gaps: remove deterministic sticky fallback path, expose journey/2x3/space-evenly tools, enforce runtime latency budgets, and tighten presence publish cadence | Done | 2026-02-22 |
| T-147 | E | Extract runtime constants/pure helpers into `boardPageRuntimePrimitives.tsx` and keep guardrail tests refactor-safe via shared source aggregation helper | Done | 2026-02-22 |
| T-130 | D | Split task tracking into `TASKS.md` (active/backlog) + `ARCHIVE.md` (history) | Done | 2026-02-20 |
| T-131 | D | Add explicit Golden Rule: E2E-first (hot-fix exception documented) to `AGENTS.md` | Done | 2026-02-20 |
| T-132 | D | Add GitHub Actions deploy workflow for `main` and CI quality gate | Done | 2026-02-20 |
| T-133 | D | Add Lighthouse performance budget enforcement in PR CI checks | Done | 2026-02-20 |
| T-134 | E | Refactor `BoardPage.tsx` by extracting shared geometry helpers and page-local type declarations into dedicated modules | Done | 2026-02-20 |
| T-135 | E | Continue incremental `BoardPage.tsx` breakdown by extracting view-model and share/action helper logic into dedicated modules while preserving guardrail-tested source markers | Done | 2026-02-20 |

## BACKLOG (Prioritized)

| Priority | Epic | Task | Lane |
|---|---|---|---|
| P0 | [AI] Reliability | Validate queue heartbeat behavior under burst/concurrent load in CI artifacts | B |
| P0 | [AI] Reliability | Improve LLM prompt/context quality for open-ended board intent understanding and multi-intent execution | B |
| P0 | [MVP] Hard Gate | Stabilize full Playwright gate execution in clean process environment after FR-22 dedicated pass | A |
| P1 | [PERF] Cursor Optimization | Bring runtime cursor latency target (`50ms`) closer to target with measured improvements | A |
| P1 | [PERF] Budgets | Keep Lighthouse budget checks green on PRs | D |
| P1 | [Board Ops] Reliability | Harden multi-object copy/paste edge cases and add regression coverage | A |
| P1 | [POLISH] Refactor | Extract next BoardPage module (`useTransforms` or `Canvas`) after `useSelection` | E |
| P1 | [Submission] Evidence | Refresh submission artifacts after each major workflow/process change | C |
| P2 | [Ops] Linear Hygiene | Consolidate ticket taxonomy into epics + sub-issues to reduce context switching | D |
| P2 | [Docs] Hygiene | Introduce `docs/ACTIVE/CURRENT.md` sprint brief for single-file context | C |
| P2 | [AI] Capability | Add additional complex multi-step board templates with deterministic validation | B |
| P2 | [Perf] Scale | Continue 5k/20-user stress harness stabilization and artifact trend tracking | A |

## Requirement Triage (2026-02-22)

Rule: implement only tasks that map to `docs/requirements.md` (MVP hard gate, board ops, collaboration, AI capabilities, performance targets) or explicit repo operating constraints in `AGENTS.md` (max ~500 LOC per file).

| Task | Requirement Mapping | Decision | Note |
|---|---|---|---|
| Validate queue heartbeat behavior under burst/concurrent load in CI artifacts | AI command reliability, concurrent editing resilience | Keep | Required for trustworthy multi-user AI command execution under load. |
| Improve LLM prompt/context quality for open-ended board intent understanding and multi-intent execution | AI Board Agent required capabilities (creation/manipulation/layout/complex) | Keep | Directly improves command correctness and coverage. |
| Stabilize full Playwright gate execution in clean process environment after FR-22 pass | Testing scenarios and MVP reliability gate | Keep | Needed to prove requirements consistently pass. |
| Bring runtime cursor latency target (`50ms`) closer to target with measured improvements | Performance Targets: cursor latency `<50ms` | Keep | Direct performance requirement. |
| Keep Lighthouse budget checks green on PRs | No direct requirement section | Skip (for now) | Useful hygiene, not a hard requirement deliverable. |
| Harden multi-object copy/paste edge cases and add regression coverage | Board operations include copy/paste | Keep | Functional requirement and regression risk area. |
| Extract next BoardPage module (`useTransforms` or `Canvas`) after `useSelection` | `AGENTS.md` max ~500 LOC per file + maintainability expectations | Keep | Required to close oversized runtime file gap. |
| Refresh submission artifacts after each major workflow/process change | Submission package completeness | Keep | Required for deliverables accuracy. |
| Consolidate ticket taxonomy into epics + sub-issues | No direct requirement section | Skip (for now) | Process optimization, not product requirement. |
| Introduce `docs/ACTIVE/CURRENT.md` sprint brief for single-file context | No direct requirement section | Skip (for now) | Documentation preference, not requirement-gated. |
| Add additional complex multi-step board templates with deterministic validation | Requirement asks 6+ commands and named templates, not extra templates | Skip (for now) | Revisit only if command coverage evidence drops below requirement. |
| Continue 5k/20-user stress harness stabilization and artifact trend tracking | Requirement target is 5+ users and 500+ objects | Skip (for now) | Beyond current requirement thresholds. |

## ARCHIVE

- Historical task ledger, evidence snapshots, and completed one-hour cadence tasks moved to `ARCHIVE.md`.
- Legacy IDs `T-001` through `T-129` remain preserved in the archive for auditability.

## Latest Evidence

- `T-102` + `T-142`: `functions/test/requirements-ai-command-capabilities.test.js` (`AI-CMDS-001`, `AI-CMDS-002`, `AI-CMDS-006`, `AI-CMDS-007`, `AI-CMDS-009`)
- `T-103`: `functions/test/requirements-ai-command-capabilities.test.js` (`AI-CMDS-001`, `AI-CMDS-005`, `AI-CMDS-008`)
- `T-139`: `app/test/cursor-publish-policy.test.mjs`
- `T-146`: `functions/test/requirements-ai-command-capabilities.test.js` (`AI-CMDS-014`, `AI-CMDS-015`, `AI-CMDS-016`, `AI-CMDS-018`, `AI-CMDS-019`), `functions/test/requirements-tool-schema.test.js` (FR-16 layout/complex tools), `functions/test/glm-provider-fallback.test.js` (timeout override), `app/test/requirements-performance-thresholds.test.mjs` + `app/test/cursor-publish-policy.test.mjs` (cursor/presence cadence)
- `T-147`: `app/test/requirements-g4-feature-coverage.test.mjs`, `app/test/requirements-transforms-and-text.test.mjs`, `app/test/helpers/boardPageSource.mjs`
