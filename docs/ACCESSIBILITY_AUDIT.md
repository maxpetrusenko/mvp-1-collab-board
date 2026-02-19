# ACCESSIBILITY_AUDIT.md

Date: 2026-02-18
Standard Target: Section 508 + WCAG 2.1 AA (web)
Scope: Login + Board core flows (create/select/move/edit, AI panel, board switcher)

## 1) Audit Method
- Manual keyboard traversal (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`, `Cmd/Ctrl+A`).
- Screen-reader spot checks (NVDA/JAWS planned).
- Contrast checks for text, icons, focus states, and status badges.
- ARIA and semantic-role review on all interactive controls.

## 2) Checklist

| Area | Requirement | Evidence | Status | Notes |
|---|---|---|---|---|
| Keyboard access | All actions usable without mouse (2.1.1) | `app/e2e/accessibility-baseline.spec.ts` (`A11Y-001`) | Pass (core flow) | Keyboard-only board create flow validated |
| Focus visibility | Every interactive element has visible focus (2.4.7) | `app/e2e/accessibility-baseline.spec.ts` (`A11Y-002`) + `app/src/styles.css` focus-ring rules | Pass (core controls) | Explicit focus ring added for interactive controls |
| Focus order | Logical traversal order across header/toolbar/sidebar/canvas controls (2.4.3) | `A11Y-001` tab sequence checks | Pass (core flow) | Full-screen-reader traversal still follow-up |
| Contrast | Text and controls meet 4.5:1 where applicable (1.4.3) | `app/test/accessibility-contrast.test.mjs` | Pass (token baseline) | Token-level guardrail added; full visual sweep remains follow-up |
| Form labels | Inputs/buttons have accessible names (3.3.2, 4.1.2) | `A11Y-002`, `A11Y-003`, plus ARIA labels in `BoardPage.tsx`/`AICommandPanel.tsx` | Pass (core controls) | Icon-only controls now have explicit `aria-label` |
| Status messaging | Reconnect/sync/error states announced clearly | `app/e2e/requirements-reconnect-ux.spec.ts` + `ai-status-pill` live region | Pass (tested) | Reconnect indicator and AI status region validated |

## 3) Contrast Table

| Token/Element | Foreground | Background | Ratio | Pass/Fail |
|---|---|---|---:|---|
| Primary button text | `#FFFFFF` | `#D14343` | `4.57` | Pass |
| Toolbar icon text | `#1A1A1A` | `#FFFFFF` | `17.40` | Pass |
| Focus ring | `#0F766E` | `#FFFFFF` | `5.47` | Pass |
| Presence status label (worst-case estimate) | `#FFFFFF` | `#000000` | `21.00` | Pass |
| AI panel success status text | `#065F46` | `#D1FAE5` | `6.78` | Pass |

## 4) Evidence Log
- 2026-02-18: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/accessibility-baseline.spec.ts e2e/requirements-reconnect-ux.spec.ts --reporter=line` -> `4 passed`.
- 2026-02-18: `cd app && npm run test:unit` -> `23 passed` (includes `A11Y-CONTRAST-001..003`).
- 2026-02-18: `cd app && npm run lint` -> pass.

## 5) Known Gaps (Remaining)
- Formal NVDA/JAWS screen-reader walkthrough is still pending.
- No axe-core/Lighthouse automated accessibility crawl is integrated yet.
- VPAT remains draft-level until full assistive-tech checks are attached.

## 6) Signoff
- Auditor: TBD
- Date: TBD
- Result: In progress (core baseline complete, advanced checks pending)
