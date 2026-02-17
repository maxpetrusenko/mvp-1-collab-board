# YJS_SPIKE.md

Date: 2026-02-17
Owner: Max
Task: T-027 (Yjs + Hocuspocus architecture spike)

## Goal
Evaluate whether we should migrate from Firebase LWW sync to an OSS CRDT path (`Yjs + Hocuspocus`) after submission.

## Scope Completed
- Mapped current `BoardObject` schema to Yjs document model.
- Defined transport/deployment plan for Hocuspocus.
- Designed migration bridge from Firestore snapshots to Yjs updates.
- Assessed engineering cost, risk, and rollback path.

## Proposed Yjs Document Shape
- `doc.getMap('objects')`: key = `objectId`, value = Y.Map with object fields.
- `doc.getMap('presence')`: ephemeral cursor/presence state.
- `doc.getArray('events')`: bounded activity timeline stream.

Object field mapping:
- `stickyNote`, `shape`, `frame`, `connector` map 1:1 to current object types.
- `position`, `size`, `zIndex`, `color`, `text`, `comments`, `votesByUser` remain first-class fields.
- Connector bindings (`start/end`, `fromObjectId`, `toObjectId`, anchors) preserved.

## Migration Strategy
1. Keep current Firebase path as canonical in production.
2. Add an adapter module that can:
   - import Firestore objects into a Yjs doc,
   - emit Yjs updates back into Firestore-compatible payloads.
3. Run dual-write in a staging environment only.
4. Compare:
   - conflict behavior under simultaneous edits,
   - reconnect/replay correctness,
   - write amplification and infra cost.
5. Promote Yjs path only if staging metrics beat current path.

## Tradeoff Summary
- Pros:
  - Better conflict semantics (CRDT-native merges).
  - OSS/self-hostable and no per-seat collaboration vendor cost.
  - Strong offline/local-first future path.
- Cons:
  - Added infra + operational burden (Hocuspocus server, persistence, scaling).
  - Migration complexity from current write model.
  - Harder observability/debugging than current Firebase-only stack.

## Recommendation
- Do not migrate before submission deadline.
- Continue current implementation for near-term delivery.
- Start a controlled Yjs staging track immediately after submission with dual-write testing.

## Exit Criteria for Future Migration
- No critical data-loss or divergence in 500+ staged interaction runs.
- P95 sync latency at or below current baseline.
- Operational cost projection equal or lower at 10k monthly users.
- Rollback verified in under 10 minutes.
