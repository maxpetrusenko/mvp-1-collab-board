# DECISIONS.md

Date initialized: 2026-02-16
Purpose: log system decisions, alternatives, rationale, and change history.

## Decision Template
- ID:
- Date:
- Status: Proposed | Accepted | Superseded
- Decision:
- Alternatives Considered:
- Rationale:
- Consequences:
- Revisit Trigger:

## Active Decisions

### D-001
- Date: 2026-02-16
- Status: Accepted
- Decision: Use TypeScript across frontend and server functions.
- Alternatives Considered: Mixed stack (Python backend, TS frontend).
- Rationale: Fastest team velocity, shared types, easier refactors under deadline.
- Consequences: Team remains in one language ecosystem.
- Revisit Trigger: Need ML-heavy backend services that justify Python.

### D-002
- Date: 2026-02-16
- Status: Accepted
- Decision: Use React + Konva for whiteboard rendering.
- Alternatives Considered: Fabric.js, PixiJS, custom canvas.
- Rationale: Strong ecosystem and fast shipping path.
- Consequences: Must avoid naive full-tree rerenders.
- Revisit Trigger: FPS degradation at 500+ objects.

### D-003
- Date: 2026-02-16
- Status: Accepted
- Decision: Use Firebase stack for auth, realtime collaboration, and hosting.
- Alternatives Considered: Supabase, custom WebSocket infra.
- Rationale: Lowest infrastructure burden for 1-week sprint.
- Consequences: Vendor lock-in accepted for speed.
- Revisit Trigger: Cost or feature constraints beyond sprint scope.

### D-004
- Date: 2026-02-16
- Status: Accepted
- Decision: Presence and cursor data in RTDB; canonical board objects in Firestore.
- Alternatives Considered: Firestore-only, RTDB-only.
- Rationale: Better separation of ephemeral vs persistent state.
- Consequences: Two data systems to maintain.
- Revisit Trigger: Operational complexity outweighs benefit.

### D-005
- Date: 2026-02-16
- Status: Accepted
- Decision: Conflict strategy for MVP is LWW with documented behavior.
- Alternatives Considered: CRDT/OT in sprint scope.
- Rationale: Rubric allows LWW and timeline favors low-risk implementation.
- Consequences: Rare overwrites possible under simultaneous edits.
- Revisit Trigger: Product demands field-level conflict merging.

### D-006
- Date: 2026-02-16
- Status: Accepted
- Decision: AI commands execute server-side via validated tool-call dispatcher.
- Alternatives Considered: Direct client-to-LLM calls.
- Rationale: Better key security and deterministic command execution.
- Consequences: Extra backend logic and monitoring required.
- Revisit Trigger: Need edge/offline AI execution path.

### D-007
- Date: 2026-02-16
- Status: Accepted
- Decision: Every feature requires automated tests; prioritize integration/e2e for collaboration.
- Alternatives Considered: Manual testing only.
- Rationale: Realtime regressions are hard to detect manually.
- Consequences: Slightly slower implementation pace with lower delivery risk.
- Revisit Trigger: None during sprint.

### D-008
- Date: 2026-02-16
- Status: Accepted
- Decision: MVP authentication provider is Firebase Google OAuth.
- Alternatives Considered: Email/password, magic link as primary.
- Rationale: Fastest reliable setup for authenticated collaboration.
- Consequences: Google account required for default MVP flow.
- Revisit Trigger: Target users require broader auth methods.

### D-009
- Date: 2026-02-16
- Status: Accepted
- Decision: Deployment strategy uses one canonical production URL and optional preview URLs.
- Alternatives Considered: Multiple public environment URLs.
- Rationale: Reduces evaluator confusion.
- Consequences: Unfinished changes require feature flags or branch isolation.
- Revisit Trigger: Need parallel external QA environments.

### D-010
- Date: 2026-02-16
- Status: Accepted
- Decision: Error recovery UX must show reconnect/sync status and non-destructive conflict messaging.
- Alternatives Considered: Silent retries.
- Rationale: Realtime failures must be visible during demos.
- Consequences: Additional UX states and copy required.
- Revisit Trigger: If telemetry shows UX noise.

### D-011
- Date: 2026-02-16
- Status: Accepted
- Decision: Adopt explicit `BoardObject` and `CursorPresence` schemas before implementation.
- Alternatives Considered: schema-by-implementation.
- Rationale: Reduces mid-build ambiguity and regression risk.
- Consequences: Up-front schema work before coding features.
- Revisit Trigger: Need backward-compatible schema migration.

### D-012
- Date: 2026-02-16
- Status: Accepted
- Decision: Object writes must include `version`, `updatedAt`, and `updatedBy` with optimistic client updates.
- Alternatives Considered: timestamp-only updates without versions.
- Rationale: Adds traceability and deterministic reconcile behavior for LWW.
- Consequences: Slightly larger payload per write.
- Revisit Trigger: Payload overhead materially impacts performance.

### D-013
- Date: 2026-02-16
- Status: Accepted
- Decision: AI command execution requires idempotency keys (`clientCommandId`) and per-board FIFO ordering.
- Alternatives Considered: best-effort parallel AI execution.
- Rationale: Prevent duplicate writes and non-deterministic outcomes under concurrent commands.
- Consequences: Queue/command-state plumbing required.
- Revisit Trigger: Throughput needs require controlled parallelism.

### D-014
- Date: 2026-02-16
- Status: Accepted
- Decision: Enable Firestore offline persistence and RTDB `onDisconnect()` cleanup for presence.
- Alternatives Considered: online-only behavior.
- Rationale: Rubric explicitly tests disconnect/reconnect recovery.
- Consequences: Must test replay/reconcile paths explicitly.
- Revisit Trigger: Offline cache constraints on target devices.

### D-015
- Date: 2026-02-16
- Status: Accepted
- Decision: Standardize testing stack as Vitest + Firebase Emulator Suite + Playwright multi-context.
- Alternatives Considered: manual browser-only verification.
- Rationale: Fastest credible path to repeatable rubric scenarios.
- Consequences: Initial setup overhead.
- Revisit Trigger: Need broader load-testing harness.

### D-016
- Date: 2026-02-16
- Status: Accepted
- Decision: Decouple high-frequency Konva interaction state from full React rerender loop.
- Alternatives Considered: React state updates for all object movement.
- Rationale: Protect 60 FPS target at higher object counts.
- Consequences: Adds imperative stage-management layer.
- Revisit Trigger: If simpler model meets performance targets in production.

### D-017
- Date: 2026-02-17
- Status: Accepted
- Decision: Keep collaboration infrastructure in-house for MVP (Firebase + custom sync) instead of adopting Liveblocks during sprint.
- Alternatives Considered: Liveblocks managed collaboration SDK, Supabase Realtime + Yjs, PartyKit/Socket.IO custom server.
- Rationale: Team learning goal is to demonstrate end-to-end understanding of multiplayer sync, conflict behavior, and failure recovery; managed SDKs would reduce learning surface and hide key tradeoffs.
- Consequences: More engineering/testing effort is required for presence, conflict handling, and realtime reliability.
- Revisit Trigger: Timeline risk, reliability gaps, or enterprise requirements (threads/comments/CRDT-grade guarantees) exceed team capacity.

### D-018
- Date: 2026-02-17
- Status: Accepted
- Decision: Use AI as a coding copilot with human-owned architecture and test verification, rather than copy-pasting full starter projects.
- Alternatives Considered: Clone-ready boilerplates with minimal edits, low-test copy/paste workflow.
- Rationale: Produces defensible technical decisions for demo/review and validates whether AI can help build features from scratch under constraints.
- Consequences: Slightly slower initial velocity, stronger system comprehension, and clearer audit trail of why decisions changed.
- Revisit Trigger: Hard deadline pressure requires selective use of prebuilt modules to ship critical scope.

### D-019
- Date: 2026-02-17
- Status: Accepted
- Decision: Maintain an OSS-first collaboration strategy; paid collaboration SaaS is fallback, not default.
- Alternatives Considered: Immediate migration to Liveblocks or equivalent managed collaboration platform.
- Rationale: Controls recurring cost, preserves architecture ownership, and aligns with learning objective to implement collaboration primitives directly.
- Consequences: Team must absorb more implementation and reliability testing work for advanced collaboration features.
- Revisit Trigger: If OSS/custom path cannot meet reliability or delivery targets for required concurrency and feature scope.

### D-020
- Date: 2026-02-17
- Status: Accepted
- Decision: Model connectors as first-class board objects with absolute `start/end` points plus optional anchor bindings to sticky/shape objects.
- Alternatives Considered: Treat connectors as purely visual overlays or store only object-to-object references without explicit coordinates.
- Rationale: Explicit coordinates keep rendering deterministic and support drag interactions; anchor bindings enable snap behavior while preserving graceful fallback to free endpoints.
- Consequences: Connector updates write more fields (`start/end/position/size` and bindings), requiring additional reconcile logic.
- Revisit Trigger: If connector-heavy boards show write amplification or require CRDT-grade edge editing semantics.

### D-021
- Date: 2026-02-17
- Status: Accepted
- Decision: Implement post-MVP collaboration/facilitation features incrementally on current architecture (frames, local undo/redo history, comments, voting/timer, timeline replay, mini-map, OCR/voice inputs) before any realtime backend migration.
- Alternatives Considered: Pause feature delivery and migrate to Yjs/CRDT stack first.
- Rationale: Preserves delivery momentum and validates product value quickly while migration risk is evaluated in parallel via dedicated spike work.
- Consequences: Some advanced semantics remain LWW-based and may need rework if migrating to CRDT later.
- Revisit Trigger: If multi-user conflict quality or scale targets fail under test scenarios.

### D-022
- Date: 2026-02-17
- Status: Accepted
- Decision: Publish submission-only demo/social artifacts as static files under Firebase Hosting and enforce a scripted submission QA gate.
- Alternatives Considered: Keep links as local/private-repo-only references; rely on manual checklist verification.
- Rationale: Public URLs are required for evaluator access, and scripted QA reduces last-minute misses across PDFs, links, and artifact presence.
- Consequences: Hosting deployment now includes submission assets and periodic QA script execution.
- Revisit Trigger: If submission assets need to move to a dedicated public docs bucket/CDN.

### D-023
- Date: 2026-02-17
- Status: Accepted
- Decision: Add an automated QA auth path (`/login?qaAuth=1`) using Firebase email/password for Playwright, while keeping Google OAuth as primary user-facing sign-in.
- Alternatives Considered: Continue manual OAuth-only e2e checks with skipped tests.
- Rationale: Eliminates skipped core authenticated UI tests and enforces MVP regression checks in CI-style automation.
- Consequences: Additional login UI branch exists for test automation and requires secure handling of test accounts.
- Revisit Trigger: If service-account/custom-token auth setup replaces UI-based QA login automation.

### D-024
- Date: 2026-02-17
- Status: Accepted
- Decision: Introduce a staged Yjs pilot mirror behind `VITE_SYNC_BACKEND` while keeping Firebase LWW as canonical production sync.
- Alternatives Considered: Immediate hard cutover to Yjs/Hocuspocus; defer all Yjs code until after full migration plan.
- Rationale: Reduces migration risk by validating object-model compatibility and state size behavior before transport/backend cutover.
- Consequences: Additional pilot-only codepath to maintain; no production conflict-semantics change yet.
- Revisit Trigger: Pilot metrics and staged dual-write tests consistently pass migration exit criteria.

### D-025
- Date: 2026-02-17
- Status: Accepted
- Decision: Optimize board chrome for 15"/16" laptop screens with compact-height responsive rules and tabbed right-panel navigation while preserving icon-first controls with tooltip hints.
- Alternatives Considered: Keep full stacked panels with page-level scrolling; hide minimap/comments/timeline by default behind separate routes.
- Rationale: Ensures minimap and panel navigation stay reachable without vertical page scrolling on common laptop resolutions and keeps interaction discoverable through button tooltips.
- Consequences: Slightly denser controls on short displays and more responsive CSS states to maintain.
- Revisit Trigger: If usability tests show compact mode hurts discoverability or accessibility.

## Change Log
- 2026-02-16: Initial decision set created.
- 2026-02-16: Added auth provider, deployment URL strategy, and error recovery UX decisions.
- 2026-02-16: Added schema contracts, LWW write semantics, AI idempotency/queueing, offline strategy, testing tooling, and Konva performance decision.
- 2026-02-17: Added build-vs-buy decision for Liveblocks alternatives and AI-first-from-scratch workflow policy.
- 2026-02-17: Added OSS-first policy for collaboration infrastructure and paid SaaS fallback trigger.
- 2026-02-17: Added connector object modeling and anchor snap decision.
- 2026-02-17: Added incremental post-MVP feature delivery decision ahead of CRDT migration.
- 2026-02-17: Added hosted submission artifact and scripted submission QA decision.
- 2026-02-17: Added automated QA auth decision to remove skipped authenticated e2e tests.
- 2026-02-17: Added staged Yjs pilot mirror decision behind feature flag.
- 2026-02-17: Added compact laptop layout decision (responsive toolbar/panel/minimap fit without page scroll).
