# VPAT Draft (Accessibility Conformance Snapshot)

Date: 2026-02-18
Product: CollabBoard (Web)
Standard baseline: WCAG 2.1 AA (Section 508-oriented review)

## Scope
- Auth flow (`/login`)
- Board canvas shell and toolbar
- Boards panel (create/rename/share)
- AI command panel and command history
- Keyboard shortcut modal and command palette

## Conformance Summary
- Supports keyboard navigation for primary actions and dialogs.
- Uses visible focus styles for interactive controls.
- Provides semantic labels/test IDs for critical controls in automation.
- Includes contrast audit guardrails and reconnect/access-denied status UX.

## Known Limitations (Draft)
- Canvas object semantics are still graphics-first; assistive tech descriptions are limited for dense board content.
- Some advanced interactions (multi-drag, resize handles) rely on pointer input and need expanded keyboard parity.
- Live cursor movement announcements are visual; no screen-reader live region stream yet.

## Evidence Sources
- `docs/ACCESSIBILITY_AUDIT.md`
- `app/e2e/accessibility-baseline.spec.ts`
- `app/test/accessibility-contrast.test.mjs`
- `app/e2e/requirements-reconnect-ux.spec.ts`

## Draft Status
This is a delivery snapshot, not a certified third-party VPAT. It is intended for submission traceability and follow-up hardening.
