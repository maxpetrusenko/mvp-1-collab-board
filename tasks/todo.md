# MAX-45 Execution TODO

## Scope
- Plan source: `thoughts/shared/plans/MAX-45-ai-bulk-operations.md` (restored 717-line version)
- Framework: Claude Code Execution Protocol

## Phase 0 — Baseline
- [ ] Confirm implementation plan remains unchanged from revert baseline and re-opened with correct sections.
- [ ] Create a one-row phase map for execution tracking with explicit pass/fail criteria.

## Phase 1 — Bulk Create
- [ ] Add `functions/src/bulk-operations.js` with bulk create helpers and chunked commit (`functions/src/bulk-operations.js`).
- [ ] Add `createObjects` schema to `functions/src/tool-registry.js`.
- [ ] Add `createObjects` handler path in `functions/index.js`.
- [ ] Add bulk command timeout handling in `functions/src/glm-client.js`.
- [ ] Add/update tests in `functions/test/requirements-ai-command-capabilities.test.js` for:
  - create multiple stickies without overlap
  - >450 object chunk path

## Phase 2 — Bulk Color
- [ ] Add `functions/src/bulk-color-operations.js`.
- [ ] Add `changeColors` schema to `functions/src/tool-registry.js`.
- [ ] Add `changeColors` handler path in `functions/index.js`.
- [ ] Add tests for all-target color updates and empty input returns zero.

## Phase 3 — Bulk Delete
- [ ] Add `deleteObjects` handler in `functions/src/bulk-operations.js`.
- [ ] Add `deleteObjects` schema to `functions/src/tool-registry.js`.
- [ ] Add `deleteObjects` handler path in `functions/index.js`.
- [ ] Add tests for valid + invalid ids behavior.

## Phase 4 — Shape Composition
- [ ] Extend `app/src/types/board.ts` with `CompositeGroupObject` type.
- [ ] Add `functions/src/shape-composition.js` module for group/ungroup and templates.
- [ ] Add `groupObjects`, `ungroupObjects`, and `createShapeTemplate` schemas in `functions/src/tool-registry.js`.
- [ ] Add handlers for group and composition tools in `functions/index.js`.
- [ ] Add composition tests for grouping bounds, ungroup cleanup, and bus/house/tree template creation.

## Phase 5 — LLM Integration and Governance
- [ ] Update `functions/src/glm-client.js` to include bulk operation tool-filter behavior.
- [ ] Update `functions/src/tool-registry.js` prompt guidance for bulk-first usage.
- [ ] Add/adjust full integration path test coverage.
- [ ] Run review pass for file-size control and Firestore limit compliance.

## Completion Criteria
- `tasks/improvements.md` contains any deferred/non-scope items only.
- `tasks/lessons.md` includes one new lesson rule for any correction made during execution.
- No unrelated files touched outside plan execution scope.
