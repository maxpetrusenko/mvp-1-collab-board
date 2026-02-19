# 2026-02-18 Polish Follow-up Plan

## Scope Completed

- `T-060` Board rename:
  - inline rename on double-click in boards panel
  - owner-only rename enforcement
  - delayed board navigation to avoid double-click misfire
- `T-061` Command palette:
  - `/` opens palette
  - fuzzy filtering over command labels/descriptions/keywords
  - run actions for sticky/create popovers, zoom fit, boards panel, mode toggle, shortcuts
- `T-068` Hover feedback:
  - per-object hover tracking (`hoveredObjectId`)
  - pointer cursor on hover
  - glow/stroke emphasis for sticky/shape/frame/text/connector visuals
- `T-069` Board duplicate:
  - board-list duplicate action for owned/shared boards
  - deep-copy board metadata into owner-owned private copy
  - clone source board objects in write-batched chunks while preserving object IDs for connector/frame references
- `T-070` Minimap regression hardening:
  - explicit mini-map test IDs for container/canvas/viewport indicator
  - dedicated E2E coverage proving click-to-navigate updates viewport indicator position
- `T-062` Template chooser:
  - modal launcher in toolbar + command palette action
  - retro/mindmap/kanban template generation near viewport center
- `T-063` Dark mode:
  - persisted light/dark theme state (`localStorage`)
  - header toggle + command palette action + dark variable overrides
- `T-067` View/edit lock mode:
  - explicit edit/view segmented toggle in toolbar
  - keyboard toggle (`Shift + E`) + mode pill
  - mutation guards for drag/edit/create/delete/duplicate/undo/redo while in view mode

## Test Evidence

- E2E: `app/e2e/board-polish.spec.ts`
  - `T-060: board name supports inline rename from boards panel`
  - `T-061: slash command palette creates sticky notes`
- E2E: `app/e2e/board-duplicate.spec.ts`
  - `T-069: duplicate board creates owned copy with cloned objects`
- E2E: `app/e2e/minimap-navigation.spec.ts`
  - `T-070: clicking the mini-map moves the viewport indicator`
- E2E: `app/e2e/template-chooser.spec.ts`
  - `T-062: template chooser inserts retro layout objects`
- E2E: `app/e2e/dark-mode.spec.ts`
  - `T-063: theme toggle flips and persists board theme mode`
- E2E: `app/e2e/view-edit-mode.spec.ts`
  - `T-067: view mode blocks drag while edit mode allows movement`
- Static guardrails: `app/test/requirements-g4-feature-coverage.test.mjs`
  - `TS-033`, `TS-034`, `TS-035`, `TS-036`, `TS-037`, `TS-038`, `TS-039`, `TS-040`

## Remaining Polish Backlog
- none (current tracked polish set closed).
