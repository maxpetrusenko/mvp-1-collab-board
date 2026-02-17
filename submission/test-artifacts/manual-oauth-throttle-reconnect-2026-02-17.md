# Manual OAuth + Throttle/Reconnect Proof

Date: 2026-02-17
Board QA run ID: `qa-critical-1771343520`

## Scope
- OAuth route protection behavior in browser
- Throttled/disconnect command path
- Reconnect/retry without duplicate corruption

## Captured Proof
- Browser auth-route behavior (Playwright):
  - `cd app && npm run test:e2e`
  - Result: login route visible when unauthenticated, board URL redirects to login.
- Throttle/reconnect behavior (critical checks):
  - `submission/test-artifacts/critical-checks-1771343520.log`
  - `submission/test-artifacts/critical-checks-1771343520.json`
  - Evidence details:
    - First throttled request timed out (`curl exit 28`).
    - Retry succeeded with `status: success`.
    - Command queue sequence remained valid and monotonic.

## Outcome
- PASS: auth route gating, retry success after throttled disconnect, no duplicate corruption.
- Note: OAuth popup click-through itself remains interactive/manual by design and is covered by the demo script flow in `DEMO_SCRIPT.md`.
