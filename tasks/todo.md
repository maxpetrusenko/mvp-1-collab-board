# MAX-45 Execution TODO

## Scope
- Plan source: `thoughts/shared/plans/MAX-45-ai-bulk-operations.md` (restored 717-line version)
- Framework: Claude Code Execution Protocol

## Phase 0 — Baseline
- [x] Confirm implementation plan remains unchanged from revert baseline and re-opened with correct sections.
- [x] Create a one-row phase map for execution tracking with explicit pass/fail criteria.

## Phase 1 — Bulk Create
- [x] Add `functions/src/bulk-operations.js` with bulk create helpers and chunked commit (`functions/src/bulk-operations.js`).
- [x] Add `createObjects` schema to `functions/src/tool-registry.js`.
- [x] Add `createObjects` handler path in `functions/index.js`.
- [x] Add bulk command timeout handling in `functions/src/glm-client.js`.
- [x] Add/update tests in `functions/test/requirements-ai-command-capabilities.test.js` for:
  - create multiple stickies without overlap
  - >450 object chunk path

## Phase 2 — Bulk Color
- [x] Add `functions/src/bulk-color-operations.js`.
- [x] Add `changeColors` schema to `functions/src/tool-registry.js`.
- [x] Add `changeColors` handler path in `functions/index.js`.
- [x] Add tests for all-target color updates and empty input returns zero.
- [x] Add legacy `note` mutable object support in color mutation fallback path.
- [x] Fix bulk color regex capture ordering for singular object phrasing and add regression coverage:
  - command: `change yellow stickie to green`

## Phase 3 — Bulk Delete
- [x] Add `deleteObjects` handler in `functions/src/bulk-operations.js`.
- [x] Add `deleteObjects` schema to `functions/src/tool-registry.js`.
- [x] Add `deleteObjects` handler path in `functions/index.js`.
- [x] Add tests for valid + invalid ids behavior.

## Phase 4 — Shape Composition
- [x] Extend `app/src/types/board.ts` with `CompositeGroupObject` type.
- [x] Add `functions/src/shape-composition.js` module for group/ungroup and templates.
- [x] Add `groupObjects`, `ungroupObjects`, and `createShapeTemplate` schemas in `functions/src/tool-registry.js`.
- [x] Add handlers for group and composition tools in `functions/index.js`.
- [x] Add composition tests for grouping bounds, ungroup cleanup, and bus/house/tree template creation.

## Phase 5 — LLM Integration and Governance
- [x] Update `functions/src/glm-client.js` to include bulk operation tool-filter behavior.
- [x] Update `functions/src/tool-registry.js` prompt guidance for bulk-first usage.
- [x] Add/adjust full integration path test coverage.
- [x] Run review pass for file-size control and Firestore limit compliance.

## Completion Criteria
- `tasks/improvements.md` contains any deferred/non-scope items only.
- `tasks/lessons.md` includes one new lesson rule for any correction made during execution.
- No unrelated files touched outside plan execution scope.
