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
- Decision: Implement post-MVP collaboration/facilitation features incrementally on current architecture (frames, local undo/redo history, comments, voting/timer, timeline replay, mini-map, OCR inputs) before any realtime backend migration.
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

### D-026
- Date: 2026-02-17
- Status: Superseded by D-037 (2026-02-18)
- Decision: Remove standalone toolbar shape-creation buttons and standardize visual shape customization on sticky notes (`shapeType`) for both manual and AI-driven create flows, while defaulting the right sidebar to the AI tab.
- Alternatives Considered: Keep separate shape objects as primary manual creation path; keep comments tab as default-open right panel.
- Rationale: User testing flagged shape drag interactions as laggy and asked for a simpler creation flow where notes can be shaped/styled directly; default AI visibility improves feature discoverability without adding new UI surfaces.
- Consequences: Manual create flow now centers on sticky notes + frame + connector; existing shape objects remain supported for compatibility but are no longer first-class toolbar creation actions.
- Revisit Trigger: If advanced non-sticky shape use cases become core and require dedicated creation/authoring controls again.

### D-027
- Date: 2026-02-18
- Status: Accepted
- Decision: Standardize selection state as `selectedIds` (multi-select first), and make object patch writes server-authoritative for `updatedAt` while preserving `updatedBy/version` updates.
- Alternatives Considered: Keep single `selectedId` and emulate multi-select ad hoc; keep client-side `Date.now()` timestamps for patches.
- Rationale: Closes FR-7 interaction gaps (shift multi-select + bulk actions) and FR-32 audit requirement that patch timestamps are not client-owned.
- Consequences: Selection-sensitive UI/shortcuts now operate on sets; some panels still use primary selection semantics; drag-box and bulk-move remain follow-up tasks.
- Revisit Trigger: If resize/transform tooling or command history work requires a richer selection model (e.g., ordered selection metadata).

### D-028
- Date: 2026-02-18
- Status: Accepted
- Decision: Close G4 board-management and transform gaps inside the existing `BoardPage` surface by adding an in-page boards modal (list/create/delete/switch), AI command history feed in the sidebar, marquee/multi-drag group movement, and visible resize handles on selected objects.
- Alternatives Considered: Build separate board routes/pages first; postpone command history/resize to post-MVP backlog.
- Rationale: Fastest path to requirement parity without destabilizing auth/routing and collaboration transport layers.
- Consequences: `BoardPage` remains large and still mixes rendering with some transport concerns; static requirement-contract tests were added to keep feature coverage auditable while broader refactor work remains.
- Revisit Trigger: If further feature growth or regressions make `BoardPage` maintainability unacceptable, split board shell into focused hooks/components (`useBoardTransport`, `useSelectionModel`, `BoardChrome`, `BoardCanvas`).

### D-029
- Date: 2026-02-18
- Status: Accepted
- Decision: Extract realtime transport concerns from `BoardPage` into dedicated hooks: `useConnectionStatus`, `usePresence`, and `useObjectSync`.
- Alternatives Considered: Keep all effects in `BoardPage`; full architecture rewrite into domain services.
- Rationale: Reduces coupling between rendering and transport logic while preserving behavior and minimizing migration risk.
- Consequences: Hook interfaces now own more state synchronization contracts and require targeted regression tests.
- Revisit Trigger: If additional transport modes (CRDT cutover, websocket transport) are added, promote hooks into a dedicated transport module.

### D-030
- Date: 2026-02-18
- Status: Accepted
- Decision: Add `docs/FR_TEST_MATRIX.md` as the canonical FR-to-evidence map for audit readiness.
- Alternatives Considered: Keep FR mapping implicit in `TASKS.md` and test filenames only.
- Rationale: Explicit FR mapping supports defendable review answers and closes the PRD traceability quality gate.
- Consequences: Matrix must be updated whenever FR behavior or test ownership changes.
- Revisit Trigger: If Linear/CI reporting fully auto-generates FR coverage, the static matrix can become generated output.

### D-031
- Date: 2026-02-18
- Status: Accepted
- Decision: Align performance test enforcement with PRD latency targets where thresholds were previously looser, specifically FR-16 (`<2s` simple AI command) and NFR-3 (`<50ms` cursor sync target with `<=100ms` max guard).
- Alternatives Considered: Keep relaxed "critical-only" thresholds and track PRD targets as informational notes.
- Rationale: Closes HR-002 and makes performance expectations test-enforced rather than documentation-only.
- Consequences: Performance test failures now more directly indicate PRD non-compliance under noisy networks.
- Revisit Trigger: If production telemetry suggests PRD target updates or environment-segmented thresholds are required.

### D-032
- Date: 2026-02-18
- Status: Accepted
- Decision: Reduce overlap between legacy regression tests and requirement-gap specs by narrowing `mvp-regression.spec.ts` to local create/style/undo-redo smoke behavior while keeping FR-specific collaboration contracts in `requirements-*.spec.ts`.
- Alternatives Considered: Keep overlapping assertions across both suites; delete legacy regression coverage entirely.
- Rationale: Closes NR-001 and preserves fast smoke coverage without duplicating requirement ownership.
- Consequences: Requirement-gap specs are now the authoritative source for FR-7/9/14/19/24/25/41 behavior checks.
- Revisit Trigger: If future regressions indicate coverage holes after de-duplication.

### D-033
- Date: 2026-02-18
- Status: Accepted
- Decision: Deliver demo-polish micro-interactions directly in `BoardPage` using Konva-native animation primitives: sticky drop-in bounce on local create, vote confetti bursts on sticky vote add, animated marquee scan feedback during selection drag, and damped zoom momentum interpolation for wheel/zoom controls.
- Alternatives Considered: Defer all motion polish until after component extraction; use CSS/DOM overlays instead of canvas-space Konva animations.
- Rationale: Fastest path to improve perceived product quality before demo while keeping interactions in world coordinates and avoiding separate overlay sync complexity.
- Consequences: `BoardPage` gets additional animation state/RAF lifecycle handling and should be monitored for future extraction into focused hooks/components; a hidden confetti-count test hook is exposed for deterministic e2e assertions.
- Revisit Trigger: If animation logic expands beyond these effects or begins to impact maintainability/perf under higher object counts.

### D-034
- Date: 2026-02-18
- Status: Accepted
- Decision: Introduce an accessibility-evidence lane centered on keyboard access, focus visibility, contrast checks, and clear audit artifacts (`ACCESSIBILITY_AUDIT.md`, optional `VPAT_DRAFT.md`).
- Alternatives Considered: Keep demo narrative focused on novelty/polish only; defer accessibility artifacts until post-submission.
- Rationale: Accessibility and reliability evidence improves defensibility in technical evaluations without expanding scope into formal certification claims.
- Consequences: Additional artifact maintenance is required and demo messaging now includes concise accessibility/auditability proof points.
- Revisit Trigger: If quality gates are fully generated by CI and static docs become redundant.

### D-035
- Date: 2026-02-18
- Status: Accepted
- Decision: Enforce an accessibility baseline in code and tests by adding explicit ARIA labels for icon-only controls, a keyboard-visible focus ring, and automated contrast guardrails (`A11Y-CONTRAST-001..003`), including darker primary button colors to satisfy 4.5:1 text contrast.
- Alternatives Considered: Keep accessibility checks manual-only; defer contrast remediation and ARIA naming until after submission.
- Rationale: Converts accessibility claims into verifiable artifacts and prevents regressions in core keyboard/form/contrast behavior.
- Consequences: Minor visual palette shift and additional e2e/unit test maintenance.
- Revisit Trigger: If final visual design refresh requires re-tuning colors while preserving WCAG thresholds.

### D-036
- Date: 2026-02-18
- Status: Accepted
- Decision: Add an app-root React error boundary (`AppErrorBoundary`) with explicit recovery actions (reload/login) and close keyboard-selection parity by adding `Escape` deselect-all and `Cmd/Ctrl + A` select-all shortcuts.
- Alternatives Considered: Rely on browser crash overlays only; keep selection shortcuts mouse-only.
- Rationale: Improves runtime resilience for demo and production sessions while closing remaining interaction/polish gaps with minimal scope risk.
- Consequences: Adds one root wrapper component, fallback UI surface, and guardrail assertions in unit tests.
- Revisit Trigger: If App shell is split into feature routes with route-level boundaries and central shortcut manager.

### D-037
- Date: 2026-02-18
- Status: Accepted
- Decision: Reintroduce explicit manual shape creation and convert bottom-toolbar create actions into feature-specific popovers (`Shape`, `Connector`, `Text`) while moving selected-object edit controls to the on-canvas context menu.
- Alternatives Considered: Keep sticky-shape-only creation and mixed bottom-toolbar edit controls; keep connector creation as one-click with inline style mini-picker.
- Rationale: Current UX feedback favored Miro-style per-feature create options and object-local editing controls over mixed global toolbar state.
- Consequences: Toolbar now focuses on creation + global actions, selected-object style/rotate operations live in context menu, and new create paths expose connector style/color + arbitrary text creation.
- Revisit Trigger: If compact-screen usability regresses due popover density or if discoverability metrics worsen.

### D-038
- Date: 2026-02-18
- Status: Accepted
- Decision: Extend reconnect indicator to explicit tri-state (`Reconnecting…`, `Syncing…`, `Connected`) with a short syncing window after returning online.
- Alternatives Considered: Keep binary connected/reconnecting indicator only; infer syncing silently without user-visible state.
- Rationale: Closes FR-41 UX gap by signaling post-reconnect synchronization progress instead of jumping directly to connected.
- Consequences: Adds one status variant in connection hook + UI styling and tighter reconnect E2E assertion flow.
- Revisit Trigger: If we can reliably expose actual Firestore pending-write completion events and replace fixed sync window with true sync state.

### D-039
- Date: 2026-02-18
- Status: Accepted
- Decision: Implement FR-22 board permissions with explicit ownership/share model (`ownerId`, `sharedWith`) enforced at three layers: Firestore rules, frontend board-access gate, and backend AI/share API board-access checks; retain a client-side share fallback (email -> `users` directory lookup) for local/dev parity when share API route is unavailable.
- Alternatives Considered: Keep auth-only access rules; frontend-only deny checks without rules/API enforcement; backend-only sharing with no local fallback.
- Rationale: FR-22 is the only remaining security blocker; layered enforcement prevents direct API bypass (including server-side AI mutations) while preserving local testability.
- Consequences: Added board/share UX states, collaborator management UI, `users` profile sync on login, migration script for legacy board ownership backfill, and new FR-22 tests/guardrails.
- Revisit Trigger: If sharing model expands to role-based permissions (`viewer`/`editor`) or org-scoped access.

### D-040
- Date: 2026-02-18
- Status: Accepted
- Decision: Prioritize three lightweight polish features from the hiring-demo gap list (inline board rename, slash command palette, and object hover feedback) and pair each with direct test evidence.
- Alternatives Considered: Defer all polish in favor of only scale tasks (`T-089/T-090`); implement full Miro parity set (templates, dark mode, view/edit lock, board duplicate) in one batch.
- Rationale: These three close the highest-friction interaction gaps with minimal risk and clear auditability while keeping focus on reliability/security wins.
- Consequences: Added delayed board navigation to preserve double-click rename intent, a command palette overlay with fuzzy filtering and command execution actions, hover-state cursor/glow rendering, and dedicated polish tests (`app/e2e/board-polish.spec.ts`, `TS-033..TS-035`).
- Revisit Trigger: If usage feedback shows discoverability issues or if command palette actions need expansion into template and board-level workflows.

### D-041
- Date: 2026-02-18
- Status: Accepted
- Decision: Implement board duplication as an owner-owned private copy flow (new board metadata + cloned objects) and preserve object IDs during duplication to keep connector/frame relationships intact; add explicit minimap click-navigation regression coverage with stable test IDs.
- Alternatives Considered: Duplicate metadata only and ignore board objects; regenerate object IDs with remapping logic; keep minimap behavior untested and rely on manual QA.
- Rationale: Preserving object IDs avoids relationship remap complexity while keeping duplicate behavior deterministic; explicit minimap tests close a known coverage gap (`T-070`) without changing runtime behavior.
- Consequences: Added batched object-copy writes for duplicate boards, new board-list duplicate action and command-palette board duplicate command, timeout protection in Firestore E2E helper requests, and dedicated E2E/guardrail tests (`TS-039`, `TS-040`).
- Revisit Trigger: If duplication expands to role-preserving shared copies or board templates with selective content cloning.

### D-042
- Date: 2026-02-18
- Status: Accepted
- Decision: Close the remaining polish/perf backlog with an integrated UX/performance pass: template chooser (`retro/mindmap/kanban`), persisted dark mode, explicit view/edit lock mode, viewport culling for large boards, and scaling E2E coverage at 500/1000 objects.
- Alternatives Considered: Defer all remaining polish/perf tasks and focus only on documentation; implement only visual polish without performance-scale evidence.
- Rationale: The remaining backlog items were tightly coupled to perceived production quality and demo reliability; shipping them together reduced context switching and aligned feature delivery with explicit test mapping.
- Consequences: Added new UI states (`themeMode`, `interactionMode`, template modal), keyboard + command palette affordances, large-board render culling in `renderObjects`, and expanded E2E/performance guardrails (`TS-036..TS-042`).
- Revisit Trigger: If dark theme requires full object-level palette adaptation or culling threshold should become dynamic by measured device capability.

### D-043
- Date: 2026-02-18
- Status: Accepted
- Decision: Harden FR-22 denied-route recovery by routing users with zero accessible boards to a fresh board ID (instead of potentially looping to an inaccessible default board), and close accessibility artifact submission by generating `ACCESSIBILITY_AUDIT.pdf` + `VPAT_DRAFT.pdf` with explicit submission links.
- Alternatives Considered: Keep denied-page CTA fixed to `defaultBoardId`; leave accessibility evidence only in markdown without PDF artifacts.
- Rationale: A denied-route loop can strand authenticated users when `defaultBoardId` is owned by someone else; artifact completeness is a submission requirement and should be machine-checkable.
- Consequences: Updated denied-access CTA behavior and added guardrail `TS-043`; added `docs/VPAT_DRAFT.md`, generated submission PDFs, and expanded `scripts/run-submission-qa.sh` file checks.
- Revisit Trigger: If app introduces a dedicated `/boards` home route or role-based sharing flows that require different denied-state recovery behavior.

### D-044
- Date: 2026-02-19
- Status: Accepted
- Decision: Replace fixed post-login/default-board routing with a workspace entry resolver that opens the last accessible board when possible, otherwise the most recently updated accessible board, and auto-creates a new board when the user has none; also split boards UI into explicit "My boards" and "Shared with me" sections.
- Alternatives Considered: Keep redirecting all sessions to `defaultBoardId`; keep mixed board list without ownership grouping.
- Rationale: Miro-style onboarding should never drop users into access-denied on login, and board discovery needs clearer ownership/shared separation.
- Consequences: Added `BoardEntryPage` route flow, updated app/login route behavior, persisted per-user last board key, and added guardrails `TS-044` and `TS-045`.
- Revisit Trigger: If we add a full dashboard route with recents/favorites/templates and need to turn auto-open behavior into user preference.

### D-045
- Date: 2026-02-19
- Status: Accepted
- Decision: Treat legacy board docs with `ownerId` but missing `createdBy` as valid owner-accessible boards, and backfill `createdBy` on owner open to prevent false access-denied states.
- Alternatives Considered: Keep strict `createdBy` requirement in client parsing and deny old boards; one-off manual migration only.
- Rationale: Existing user reports showed login-to-denied flows on historical board docs even when owner was authenticated; this breaks core workflow and diverges from expected Miro-like continuity.
- Consequences: Updated board metadata normalization in entry + board views to use `ownerId || createdBy`, added runtime backfill of missing `createdBy`, aligned backend normalization fallback, and added guardrails `TS-046` and `functions/test/requirements-board-access.test.js` owner-only case.
- Revisit Trigger: If a formal migration pipeline guarantees all boards carry both fields and client fallback can be simplified.

### D-046
- Date: 2026-02-19
- Status: Accepted
- Decision: Align connectors and sharing UX with Miro-style expectations by (1) making template-generated mindmap connectors object-attached (`fromObjectId`/`toObjectId` + anchors) so they track node movement, and (2) expanding sharing lookup to accept email or handle (uid/display-name/email-prefix) while explicitly messaging that invite emails are not yet sent.
- Alternatives Considered: Keep connector creation as free-floating lines in templates; keep share lookup email-only and rely on exact auth email entry.
- Rationale: User reports showed connector drift during node movement and sharing friction when collaborators entered handles instead of full emails.
- Consequences: Connector create path now supports explicit endpoint/binding options, mindmap template persists connector bindings, connector render geometry resolves bound anchor points during object movement, users directory records `displayNameLower`, and share resolver supports handle fallbacks on both client and backend.
- Revisit Trigger: If we add true email invitation delivery and role-based collaborator objects (`viewer`/`editor`) requiring richer invite state.

### D-047
- Date: 2026-02-19
- Status: Accepted
- Decision: Expand board sharing to explicit collaborator roles (`edit`/`view`) using `sharedRoles` alongside `sharedWith`, enforce edit-only writes in Firestore/backend AI route, and harden AI UX by disabling submit outside edit mode while adding deterministic `"note"` command parsing to avoid slow/failing LLM fallback for basic sticky creation.
- Alternatives Considered: Keep role-less sharing (`sharedWith` only) and rely on manual user discipline for view-only; keep AI submit active in view mode and show runtime error; leave `"note"` phrasing to LLM fallback.
- Rationale: Reported collaboration and AI regressions showed ambiguity around permission level, confusing AI submit behavior in view mode, and latency/failure for simple note commands.
- Consequences: Added `sharedRoles` normalization/backfill across frontend/backend/rules, updated share dialog with role selector and collaborator role labels, enforced owner/editor-only mutation paths, disabled AI submit when board is not editable, and extended sticky parser aliases for `note(s)`.
- Revisit Trigger: If invitation workflows require pending/accepted states, per-object ACL, or if AI command authorization moves to a dedicated policy service.

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
- 2026-02-17: Added sticky-shape-first creation decision and AI-right-panel default behavior decision.
- 2026-02-18: Added multi-select state model and server-authoritative patch timestamp decision.
- 2026-02-18: Added board management/history + marquee/multi-drag + visible resize handle implementation decision.
- 2026-02-18: Added realtime transport hook extraction decision (`useConnectionStatus`, `usePresence`, `useObjectSync`).
- 2026-02-18: Added FR-to-test evidence matrix decision.
- 2026-02-18: Added PRD-aligned performance enforcement decision for FR-16/NFR-3 and reduced legacy-vs-requirement E2E overlap decision.
- 2026-02-18: Expanded demo-polish motion decision with selection marquee scan and deterministic confetti e2e hook coverage.
- 2026-02-18: Added accessibility-evidence documentation policy and concise external positioning guardrails.
- 2026-02-18: Added accessibility baseline enforcement decision (ARIA labels, focus ring, contrast guardrails, and primary color adjustment for WCAG 2.1 AA text contrast).
- 2026-02-18: Added app-root error boundary recovery decision and keyboard selection parity shortcuts (`Escape` deselect-all, `Cmd/Ctrl + A` select-all).
- 2026-02-18: Added bottom-toolbar creation popover + context-menu editing decision and reconnect tri-state syncing indicator decision.
- 2026-02-18: Added FR-22 layered permission/share enforcement decision with migration + local fallback strategy.
- 2026-02-18: Added targeted polish decision for board rename, slash command palette, and hover feedback with explicit tests.
- 2026-02-18: Added board-duplicate strategy and minimap regression coverage decision with explicit tests/guardrails.
- 2026-02-18: Added integrated polish/performance backlog closeout decision (templates, dark mode, view/edit lock, viewport culling, scaling E2E).
- 2026-02-18: Added denied-route recovery + accessibility artifact PDF closeout decision (`D-043`).
- 2026-02-19: Added workspace entry resolver and owned/shared board discovery workflow decision (`D-044`).
- 2026-02-19: Added legacy board metadata fallback/backfill decision to eliminate false access-denied on owner boards (`D-045`).
- 2026-02-19: Added connector attachment parity + share-by-handle decision (`D-046`).
- 2026-02-19: Added role-aware sharing + AI submit gating + note-alias latency hardening decision (`D-047`).
