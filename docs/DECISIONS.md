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

### D-026
- Date: 2026-02-17
- Status: Accepted
- Decision: Remove standalone toolbar shape-creation buttons and standardize visual shape customization on sticky notes (`shapeType`) for both manual and AI-driven create flows, while defaulting the right sidebar to the AI tab.
- Alternatives Considered: Keep separate shape objects as primary manual creation path; keep comments tab as default-open right panel.
- Rationale: User testing flagged shape drag interactions as laggy and asked for a simpler creation flow where notes can be shaped/styled directly; default AI visibility improves feature discoverability without adding new UI surfaces.
- Consequences: Manual create flow now centers on sticky notes + frame + connector; existing shape objects remain supported for compatibility but are no longer first-class toolbar creation actions.
- Revisit Trigger: If advanced non-sticky shape use cases become core and require dedicated creation/authoring controls again.

### D-027
- Date: 2026-02-20
- Status: Accepted
- Decision: Keep boards create/share controls in a dedicated, scrollable side column inside the boards modal so share actions remain visible at constrained viewport heights.
- Alternatives Considered: Keep share card as a separate grid row in the modal body; rely on outer modal resizing.
- Rationale: In the previous layout, the share form could render below the fold and hide the share submit action, blocking board-sharing completion.
- Consequences: Added a new `boards-side` layout container and modal-body overflow constraints to guarantee accessible create/share controls.
- Revisit Trigger: If modal usability testing shows the side-column scroll pattern causes discoverability issues on smaller devices.

### D-028
- Date: 2026-02-22
- Status: Accepted
- Decision: Split Firebase project aliases into `dev` and `prod`, with `dev` as local default and explicit guarded script for `prod` deploys.
- Alternatives Considered: Keep single default production project; rely on manual `--project` flags per command.
- Rationale: Prevents local iteration and ad hoc deploys from changing production behavior.
- Consequences: Team maintains two Firebase project ids and follows alias-based deploy scripts.
- Revisit Trigger: If infrastructure shifts to a separate environment promotion pipeline with automated release gating.

### D-028
- Date: 2026-02-20
- Status: Accepted
- Decision: Use a two-tier quality workflow: fast dev gate (lint + build, no tests) for day-to-day iteration, and a parallelized full gate (unit + functions + sharded Playwright) only before production pushes.
- Alternatives Considered: Run full test suite on every local change; disable pre-prod full gate entirely.
- Rationale: Full e2e runs were slowing iteration; splitting gates keeps development velocity high while preserving rigorous pre-prod verification.
- Consequences: Added `scripts/run-dev-gate.sh` and `scripts/run-full-gate.sh`; teams must consistently run full gate before deploy.
- Revisit Trigger: If defect escape rate increases or full gate runtime remains too slow even with sharding.

### D-029
- Date: 2026-02-20
- Status: Accepted
- Decision: Keep AI command success feedback in the status pill only, show inline AI messages only for warning/error states, and normalize out-of-scope prompts to a short warning response (`I can't help with that.`); also use board-access snapshot metadata as fallback for owner/share role gating when board list snapshots lag.
- Alternatives Considered: Keep verbose success banners for every command; allow conversational model replies of arbitrary length; rely only on board-list snapshots for role/owner UI gating.
- Rationale: Reduced AI panel noise while preserving actionable warnings, and eliminated transient UI regressions where owner share controls or edit/view role enforcement could momentarily mis-evaluate before board list hydration.
- Consequences: Added warning-level AI result plumbing (`level: 'warning'`) across functions/web, and introduced `boardAccessMeta` fallback in board permission/role derivation.
- Revisit Trigger: If users request richer conversational replies inside the panel or if access-role state can be made strictly server-authoritative in a single stream.

### D-030
- Date: 2026-02-20
- Status: Accepted
- Decision: Shift project operations to a lean sprint-control model: keep `TASKS.md` focused on active/backlog only, move historical ledger to `ARCHIVE.md`, enforce explicit E2E-first policy in `AGENTS.md`, and automate quality/deploy checks with GitHub Actions including Lighthouse budget checks on PRs.
- Alternatives Considered: Keep monolithic 500+ line `TASKS.md` and manual deploy/perf checks.
- Rationale: Reduces planning context-switch overhead, creates deterministic guardrails for test-first execution, and prevents silent performance/deployment regressions.
- Consequences: Added new CI/deploy workflows, a Lighthouse budget config + script, and introduced archive indirection for historical task evidence.
- Revisit Trigger: If workflow runtime or maintenance overhead materially slows delivery versus current manual flow.

### D-031
- Date: 2026-02-20
- Status: Accepted
- Decision: Refactor `BoardPage.tsx` incrementally by extracting pure geometry/util helpers and page-local type declarations into dedicated modules (`app/src/lib/boardGeometry.ts`, `app/src/pages/boardPageTypes.ts`) while preserving behavior-critical inline guards in `BoardPage.tsx`.
- Alternatives Considered: Single large rewrite/split of `BoardPage.tsx` into multiple components/hooks in one pass.
- Rationale: Reduces file complexity and reuse friction with lower regression risk under strict source-string guardrail tests.
- Consequences: `BoardPage.tsx` line count decreases without UI/behavior changes; connector-boundary logic remains local to satisfy current guardrails.
- Revisit Trigger: After guardrail tests migrate away from strict source-string matching and permit deeper component extraction.

### D-032
- Date: 2026-02-20
- Status: Accepted
- Decision: Continue `BoardPage.tsx` reduction using guardrail-compatible helper modules for unguarded logic (`boardPageViewModels.ts`, `boardSharingHelpers.ts`, `boardActionHelpers.ts`) while keeping tested source markers in `BoardPage.tsx`.
- Alternatives Considered: Pause refactor until tests are rewritten; move all logic into hooks/components immediately and patch tests afterward.
- Rationale: Preserves momentum on file-size reduction and modularity without destabilizing the current source-string regression suite.
- Consequences: Business/view utility logic is more reusable and testable in isolated modules; `BoardPage.tsx` still retains guarded interaction/render paths until guardrail tests are modernized.
- Revisit Trigger: Once guardrails assert behavior via runtime tests instead of source matching, proceed with deeper component/hook extraction (selection/transforms/canvas split).

### D-033
- Date: 2026-02-21
- Status: Accepted
- Decision: Use Firestore batched writes for AI template object creation paths, with chunked commits capped below Firestore limits.
- Alternatives Considered: Sequential per-object writes with `await`; parallel per-object writes with `Promise.all`.
- Rationale: Template creation writes were queue-bound and I/O-bound; batching reduces command wall time and lock hold duration while keeping writes deterministic.
- Consequences: Template builders now stage object payloads before commit, with helper complexity for batch chunking and status accounting.
- Revisit Trigger: If per-object transactional semantics or per-write side effects become required for template generation paths.

### D-034
- Date: 2026-02-21
- Status: Accepted
- Decision: Renew board AI command lock TTL with a heartbeat while the command is in `running` state.
- Alternatives Considered: Static lock TTL only; larger one-shot lock TTL values.
- Rationale: Long-running commands under contention can outlive a fixed TTL and permit overlapping execution; heartbeat renewal preserves single-run ownership for the active command.
- Consequences: Queue execution now includes heartbeat start/stop lifecycle handling and lock cleanup on both success and error paths.
- Revisit Trigger: If queue throughput goals require lock partitioning or per-command scoped concurrency beyond board-level FIFO.

### D-035
- Date: 2026-02-21
- Status: Accepted
- Decision: Extend AI position parsing to support explicit coordinate extraction (`x=... y=...`, `at 640,360`) and propagate coordinates through sticky/shape/frame execution paths.
- Alternatives Considered: Phrase-only placement parsing (`top left`, `center`) and fallback defaults.
- Rationale: Closing position ambiguity increases command determinism and reduces retries for layout-centric prompts.
- Consequences: Parser and execution plumbing are broader, with new tests for coordinate variants and cleaned-text extraction.
- Revisit Trigger: If natural-language placement quality targets demand semantic scene understanding beyond explicit coordinates and phrase mapping.

### D-036
- Date: 2026-02-21
- Status: Accepted
- Decision: Tune cursor publish cadence to 33ms with movement duplicate suppression while preserving existing presence flush guardrails.
- Alternatives Considered: Keep 50ms publish cadence without dedupe; push to ultra-high frequency without suppression.
- Rationale: The target path needs lower end-to-end cursor delay with controlled write pressure; dedupe limits redundant emits during high-frequency input.
- Consequences: Presence hook now tracks last-published cursor state and avoids near-identical publishes, improving transport efficiency under motion bursts.
- Revisit Trigger: If strict runtime SLA still misses target under representative load, or if RTDB write volume rises beyond budget thresholds.

### D-037
- Date: 2026-02-21
- Status: Accepted
- Decision: Continue Board runtime modularization via guardrail-safe extractions only; extract shared timing helpers first while preserving source-marker-constrained logic in place.
- Alternatives Considered: Full runtime split in one pass; pause extraction entirely until guardrails change.
- Rationale: This path reduces module size and duplication while keeping current regression guardrails stable.
- Consequences: `app/src/lib/time.ts` now owns shared timing helpers, and high-risk guarded logic remains local until guardrail modernization lands.
- Revisit Trigger: When guardrails move from source-string assertions to behavior assertions, proceed with deeper runtime hook/component extraction.

### D-038
- Date: 2026-02-21
- Status: Accepted
- Decision: Harden gate/test execution to avoid local E2E collisions by adding dynamic preview port selection in `scripts/run-full-gate.sh` and run-scoped Playwright artifact directories (script-level and default config-level).
- Alternatives Considered: Keep fixed port `4173` with implicit Vite fallback behavior; keep shared default Playwright `test-results` output.
- Rationale: Fixed-port assumptions and shared artifact directories caused false negatives (`ERR_CONNECTION_REFUSED`, trace/archive `ENOENT`, cross-run worker conflicts) during parallel verification.
- Consequences: Full-gate runs now stay aligned on a resolved preview URL and avoid output collisions; ad-hoc Playwright runs also write to per-process directories by default.
- Revisit Trigger: If CI uses a dedicated isolated runner and these local-collision guards add unnecessary complexity.

### D-039
- Date: 2026-02-22
- Status: Accepted
- Decision: Run AI command interpretation through a fully LLM-first planning path for board intent, removing deterministic sticky-parser gating from runtime command execution.
- Alternatives Considered: Keep deterministic sticky/reason parser as primary shortcut with LLM fallback.
- Rationale: Open-ended user prompts vary widely and deterministic parsing created brittle behavior and repetitive outputs; LLM-first intent handling with full board/placement context provides broader command coverage.
- Consequences: Runtime now forwards normalized user prompts to the model for intent resolution, while server-side placement and batching guardrails remain enforced during tool execution.
- Revisit Trigger: If production telemetry shows reliability regressions that require selective deterministic safeties for specific high-volume intents.

### D-040
- Date: 2026-02-22
- Status: Accepted
- Decision: Expose layout/complex capabilities as explicit callable tools (`createStickyGridTemplate`, `spaceElementsEvenly`, `createJourneyMap`) and enforce runtime AI latency budgets through bounded lock wait and per-pass provider timeout budgeting.
- Alternatives Considered: Keep helper functions private to runtime internals and rely on implicit model behavior; keep long queue wait windows with provider default timeout only.
- Rationale: Requirements call out 2x3 layouts, space-evenly layout, and journey maps as first-class capabilities, and performance targets require concrete budget controls in execution code.
- Consequences: Tool schema breadth increased, dispatcher routing expanded, queue wait duration is bounded, and LLM requests receive budget-aware timeout overrides.
- Revisit Trigger: If command completion quality drops under heavy contention and requires adaptive per-board queue budgets or multi-tier latency classes.

### D-041
- Date: 2026-02-22
- Status: Accepted
- Decision: Extract `BoardPageRuntime` constants and pure utility helpers into `app/src/pages/boardPageRuntimePrimitives.tsx` while preserving runtime behavior and source-based requirement guardrails via shared source aggregation.
- Alternatives Considered: Keep all primitives inline in `BoardPageRuntime.tsx`; perform a larger runtime split in one pass.
- Rationale: The runtime file remains over-size and hard to maintain; extracting pure helpers cuts file surface safely with low behavior risk and keeps incremental refactor momentum.
- Consequences: `BoardPageRuntime.tsx` shrinks and dependency boundaries become clearer, while source-string tests now read both runtime and extracted helper modules through `app/test/helpers/boardPageSource.mjs`.
- Revisit Trigger: Once guardrails are fully behavior-based, continue deeper extraction (`useTransforms`, canvas command handlers, share panel composition) in larger chunks.

### D-042
- Date: 2026-02-22
- Status: Accepted
- Decision: Extract boards-side UI slices from `BoardPageRuntime` into reusable view components (`BoardCreateForm`, `BoardSharingCard`) in `app/src/pages/boardPanels.tsx`.
- Alternatives Considered: Keep inline boards-side JSX in runtime; split all boards panel logic in one step.
- Rationale: This gives immediate file-size reduction with low behavior risk and produces reusable, testable view components with controlled props.
- Consequences: `BoardPageRuntime.tsx` keeps orchestration state/actions while form/share rendering lives in dedicated components; guardrail source aggregation now includes `boardPanels.tsx`.
- Revisit Trigger: Continue with command-palette, shortcuts modal, and right-sidebar panel extraction until runtime stays under the LOC target.

### D-043
- Date: 2026-02-22
- Status: Accepted
- Decision: Keep AI object creation on the LLM execution path and harden failure handling with explicit, human-readable provider error messages plus bounded provider timeout/retry controls.
- Alternatives Considered: Add deterministic sticky fallback creation when the provider fails; keep generic “temporarily unavailable” warnings with no provider diagnostics.
- Rationale: LLM-first intent execution stays consistent with runtime architecture while clearer error messages and bounded provider call controls improve operator debugging and user trust when provider failures occur.
- Consequences: Runtime now passes explicit provider timeout/retry overrides to the LLM client, warning responses include actionable failure context, and warning responses keep clean messaging without appending latency-budget text.
- Revisit Trigger: If telemetry shows persistent provider failures that require queue-tiered retry policy or dynamic provider timeout classes by command type.

### D-044
- Date: 2026-02-22
- Status: Accepted
- Decision: Increase AI board lock wait budget to `90s` and return a clear board-busy response when the queue wait exceeds the budget.
- Alternatives Considered: Keep sub-2s lock wait budget with frequent timeout failures; remove board lock queueing altogether.
- Rationale: Real provider latency regularly exceeds the prior lock wait budget, causing user-visible queue timeout failures on normal sequential commands.
- Consequences: Sequential commands now wait long enough for in-flight command completion, timeout responses are explicit (`Another AI command is still running...`), and timeout HTTP status uses `429`.
- Revisit Trigger: If queue depth or tail latency grows materially, requiring queue-drain workers or per-board parallelism controls.

### D-045
- Date: 2026-02-22
- Status: Accepted
- Decision: Raise provider timeout default to `12s` for LLM tool-plan calls and prioritize aggregated provider-chain diagnostics over single-provider auth heuristics.
- Alternatives Considered: Keep `6s` timeout budget and generic auth-first error messaging; add deterministic fallback object creation.
- Rationale: Multi-object prompts can exceed a 6-second deepseek response window, and mixed provider failures were surfacing misleading auth-only messaging.
- Consequences: Complex create commands complete reliably through the working provider path, and warning responses now report provider-chain context (`quota`, `invalid credentials`, `timeout`) in human-readable form.
- Revisit Trigger: If median command latency remains above target under healthy providers, add provider-priority controls or circuit-breaker suppression for known-bad providers.

### D-046
- Date: 2026-02-22
- Status: Accepted
- Decision: Support explicit AI backend endpoint split by runtime mode (`VITE_AI_API_BASE_URL_DEV` for local/dev, `VITE_AI_API_BASE_URL_PROD` for production) with shared fallback.
- Alternatives Considered: Keep a single `VITE_AI_API_BASE_URL` for all environments.
- Rationale: Shared endpoint configuration couples local and production behavior, making debugging and rollout isolation difficult.
- Consequences: Local Vite sessions can target a separate dev/staging backend without changing production URL settings.
- Revisit Trigger: If endpoint routing moves to reverse-proxy or environment-specific build pipelines that make client-side endpoint branching unnecessary.

### D-047
- Date: 2026-02-22
- Status: Accepted
- Decision: Add provider-priority routing and provider cooldown suppression in the LLM client, and reduce default max token budget for command planning responses.
- Alternatives Considered: Keep static provider order with no health memory and high token ceiling per request.
- Rationale: Repeated attempts to known-bad providers increased latency and made command UX feel slower under partial provider outages.
- Consequences: Providers with auth/quota/timeout failures are skipped for a cooldown window, provider order can be configured via `AI_PROVIDER_PRIORITY`, and default token budget is lowered to reduce response latency.
- Revisit Trigger: If command quality degrades due token limits or if provider health stabilizes and cooldown tuning needs adjustment.

### D-048
- Date: 2026-02-22
- Status: Accepted
- Decision: Route AI planning through command profiles with compact system prompts + reduced tool schemas for repetitive and structured creation commands, and force tool-call mode (`tool_choice=required`) for board-mutation intent.
- Alternatives Considered: Keep one full system prompt and broad tool schema for every command; add deterministic non-LLM command handlers for high-volume prompts.
- Rationale: Full-context prompt + broad schema added measurable latency for compound create commands while LLM-first execution remained mandatory.
- Consequences: Added dedicated LLM-exposed artifact tools (`createBusinessModelCanvas`, `createWorkflowFlowchart`), introduced grid/artifact prompt+tool fast paths, and moved live prod compound commands into low-3-second runtime range with stable tool-call execution.
- Revisit Trigger: If strict sub-3s runtime on every compound command is mandatory, evaluate lower-latency model tier or asynchronous multi-object write acknowledgement strategy.

### D-049
- Date: 2026-02-22
- Status: Accepted
- Decision: Treat user-authored placement phrases/coordinates as the only source that may preserve direct `x/y` or named `position` from model tool arguments; otherwise apply the client viewport anchor for create operations.
- Alternatives Considered: Trust model-provided `x/y` or named positions on every create call; always force anchor placement and ignore explicit user placement text.
- Rationale: Users reported AI-created objects appearing outside their active view when model-inferred coordinates drifted; explicit user placement still needs deterministic support.
- Consequences: Default create behavior stays in-view for sticky/shape/frame generation, while commands such as `at top right` and `at 640,360` preserve explicit intent.
- Revisit Trigger: If advanced layout prompts require autonomous model coordinate planning without explicit user placement language.

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
- 2026-02-20: Added boards modal side-column scroll decision to prevent hidden share actions.
- 2026-02-20: Added two-tier gate policy (fast dev gate + parallel pre-prod full gate).
- 2026-02-20: Added AI warning-only inline messaging + board access metadata fallback gating decision.
- 2026-02-20: Added lean sprint-control process decision (TASKS split, E2E-first rule, CI deploy + Lighthouse PR budgets).
- 2026-02-20: Added incremental BoardPage extraction decision for geometry/helpers + types modules.
- 2026-02-20: Added guardrail-compatible BoardPage helper-module extraction decision for view-models, sharing flows, and action utilities.
- 2026-02-21: Added batched template-write decision for AI object generation paths.
- 2026-02-21: Added queue lock heartbeat decision for long-running AI command ownership.
- 2026-02-21: Added AI coordinate parsing and execution propagation decision.
- 2026-02-21: Added cursor publish cadence + duplicate suppression decision.
- 2026-02-21: Added guardrail-safe runtime timing-helper extraction decision.
- 2026-02-21: Added full-gate stabilization decision for dynamic preview ports and isolated Playwright outputs.
- 2026-02-22: Added LLM-first runtime planning decision for board intent handling.
- 2026-02-22: Added explicit advanced layout/journey tool exposure and runtime latency-budget enforcement decision.
- 2026-02-22: Added BoardPageRuntime primitive-helper extraction decision with refactor-safe source guardrail aggregation.
- 2026-02-22: Added boards-side reusable component extraction decision for board create/share UI.
- 2026-02-22: Added LLM-only create-path reliability decision with human-readable provider failure messaging and bounded provider retry controls.
- 2026-02-22: Added AI queue wait-budget decision with explicit board-busy timeout response semantics.
- 2026-02-22: Added provider-timeout and provider-chain diagnostic decision for multi-object command reliability.
- 2026-02-22: Added runtime AI endpoint split decision for local/dev and production isolation.
- 2026-02-22: Added provider-priority and cooldown suppression decision to reduce degraded-provider latency impact.
- 2026-02-22: Added command-profiled compact prompt/tool-routing decision with required tool-call mode for fast compound AI execution.
- 2026-02-22: Added explicit-user-placement-only preservation decision to keep AI-created objects anchored in active viewport by default.
