# mvp-1-collab-board

Realtime collaborative whiteboard MVP built for the Gauntlet Cohort challenge.

Live deployment: https://mvp-1-collab-board.web.app/b/mvp-demo-board

## What This Project Includes

- Multi-user collaborative board with cursor/object sync.
- Frontend app built with React + Vite + TypeScript.
- Firebase backend for Hosting, Auth, Firestore, Realtime Database, and Cloud Functions.
- E2E testing flow with Playwright.

## Repository Structure

```
mvp-1-collab-board/
├── app/              # React client (Vite, TypeScript, Konva)
├── functions/        # Firebase Cloud Functions API
├── scripts/          # QA and deployment helper scripts
├── docs/             # All project documentation
├── tests/            # Test evidence and outputs
├── submission/       # Deliverable artifacts (PDFs, videos)
├── Sessions/         # Transcript archives
└── thoughts/         # Research notes and spikes
```

**Root files**:
- `README.md` — this file
- `AGENTS.md` — Agent protocol and workflow instructions
- `TASKS.md` — Active task tracking

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

| Doc | Purpose |
|-----|---------|
| `docs/PRESEARCH.md` | Phase 1-3 research checklist |
| `docs/PRD.md` | Product requirements |
| `docs/MVP.md` | Minimum viable feature set |
| `docs/DECISIONS.md` | Defendable technical decisions |
| `docs/DEMO_SCRIPT.md` | 3-5 min demo walkthrough |
| `docs/AI_DEVELOPMENT_LOG.md` | 1-page AI tool usage log |
| `docs/AI_COST_ANALYSIS.md` | Dev spend + user projections |
| `docs/TEST_EVIDENCE.md` | E2E test results |
| `docs/DOCUMENTATION.md` | Architecture overview |
