# TASKS.md

Date initialized: 2026-02-16
Last updated: 2026-02-20 (process + BoardPage refactor slices from `Refactoring - Process Inefficiencies: O2 to Long-Term.ini`)
Cadence: half-day sprint checkpoints
Source: `AGENTS.md` + `G4 Week 1 - CollabBoard-requirements.pdf`

## ACTIVE (Current Sprint, ~5 items)

| ID | Lane | Task | Status | Target |
|---|---|---|---|---|
| T-102 | B | Add AI command position understanding (top/bottom/left/right, center coordinates) | Pending | 2026-02-21 |
| T-103 | B | Optimize AI command latency to <2s and capture updated evidence | Pending | 2026-02-21 |
| T-130 | D | Split task tracking into `TASKS.md` (active/backlog) + `ARCHIVE.md` (history) | Done | 2026-02-20 |
| T-131 | D | Add explicit Golden Rule: E2E-first (hot-fix exception documented) to `AGENTS.md` | Done | 2026-02-20 |
| T-132 | D | Add GitHub Actions deploy workflow for `main` and CI quality gate | Done | 2026-02-20 |
| T-133 | D | Add Lighthouse performance budget enforcement in PR CI checks | Done | 2026-02-20 |
| T-134 | E | Refactor `BoardPage.tsx` by extracting shared geometry helpers and page-local type declarations into dedicated modules | Done | 2026-02-20 |
| T-135 | E | Continue incremental `BoardPage.tsx` breakdown by extracting view-model and share/action helper logic into dedicated modules while preserving guardrail-tested source markers | Done | 2026-02-20 |

## BACKLOG (Prioritized)

| Priority | Epic | Task | Lane |
|---|---|---|---|
| P0 | [AI] Reliability | Harden AI command SLA under concurrent usage and queue contention | B |
| P0 | [AI] Reliability | Expand AI command parser coverage for conversational + board hybrids | B |
| P0 | [MVP] Hard Gate | Re-run FR-22 sharing/access suite in unrestricted CI environment | A |
| P1 | [PERF] Cursor Optimization | Bring runtime cursor latency target (`50ms`) closer to target with measured improvements | A |
| P1 | [PERF] Budgets | Keep Lighthouse budget checks green on PRs | D |
| P1 | [POLISH] Refactor | Extract `useSelection` from `app/src/pages/BoardPage.tsx` (no rewrite) | E |
| P1 | [POLISH] Refactor | Extract next BoardPage module (`useTransforms` or `Canvas`) after `useSelection` | E |
| P1 | [Submission] Evidence | Refresh submission artifacts after each major workflow/process change | C |
| P2 | [Ops] Linear Hygiene | Consolidate ticket taxonomy into epics + sub-issues to reduce context switching | D |
| P2 | [Docs] Hygiene | Introduce `docs/ACTIVE/CURRENT.md` sprint brief for single-file context | C |
| P2 | [AI] Capability | Add additional complex multi-step board templates with deterministic validation | B |
| P2 | [Perf] Scale | Continue 5k/20-user stress harness stabilization and artifact trend tracking | A |

## ARCHIVE

- Historical task ledger, evidence snapshots, and completed one-hour cadence tasks moved to `ARCHIVE.md`.
- Legacy IDs `T-001` through `T-129` remain preserved in the archive for auditability.
