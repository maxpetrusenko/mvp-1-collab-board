# mvp-1-collab-board

Realtime collaborative whiteboard MVP built for the Gauntlet Cohort challenge.

Live deployment: https://mvp-1-collab-board.web.app/b/mvp-demo-board

## What This Project Includes

- Multi-user collaborative board with cursor/object sync.
- Frontend app built with React + Vite + TypeScript.
- Firebase backend for Hosting, Auth, Firestore, Realtime Database, and Cloud Functions.
- E2E testing flow with Playwright.

## Repository Structure

- `app/` - React client (Vite, TypeScript, Konva canvas).
- `functions/` - Firebase Cloud Functions API.
- `scripts/` - helper scripts used during delivery/testing.
- `submission/` - deliverable artifacts.
- Root `*.md` files - product, architecture, planning, cost, and delivery documentation.

## Local Development

### 1) Install dependencies

```bash
cd app && npm install
cd ../functions && npm install
```

### 2) Configure Firebase project

```bash
cp .firebaserc.example .firebaserc
# then replace with your actual Firebase project id
```

### 3) Run frontend locally

```bash
cd app
npm run dev
```

### 4) Build and deploy

```bash
cd app && npm run build
cd ..
firebase deploy
```

## Quality Gates

- Lint: `cd app && npm run lint`
- E2E tests: `cd app && npm run test:e2e`
- MVP regression test: `cd app && npx playwright test e2e/mvp-regression.spec.ts`
- Critical backend checks: `bash scripts/run-critical-checks.sh`
- Submission QA: `bash scripts/run-submission-qa.sh`

## Documentation

See `DOCUMENTATION.md` for a complete map of architecture and project docs.
