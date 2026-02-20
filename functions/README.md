# CollabBoard Functions

HTTP function endpoint:
- `POST /api/ai/command`

Provided by Firebase function export:
- `api`

## What it does
- Accepts AI command requests with Firebase bearer auth + `boardId`, `command`, `clientCommandId`.
- Stores command status in `boards/{boardId}/aiCommands/{clientCommandId}`.
- Applies per-board FIFO sequencing + lock for deterministic command execution.
- Enforces idempotency via `clientCommandId`.
- Executes dispatcher tools:
  - `createStickyNote`
  - `createShape`
  - `createFrame`
  - `createConnector` (acknowledged in MVP; render not implemented)
  - `moveObject`
  - `resizeObject`
  - `updateText`
  - `changeColor`
  - `getBoardState`

## Local install
```bash
npm install
```

## AI Provider Configuration
The backend now supports provider fallback in this order:
1. `Z_AI_GLM_API_KEY` (or `z_ai_glm_api_key`) -> Z.ai GLM
2. `MINIMAX_API_KEY` (or `minimax_api_key`) -> MiniMax
3. `DEEPSEEK_API_KEY` (or `deepseek_api_key`) -> DeepSeek

Optional overrides:
- `Z_AI_GLM_MODEL`, `Z_AI_GLM_API_URL`
- `MINIMAX_MODEL`, `MINIMAX_API_BASE_URL`
- `DEEPSEEK_MODEL`, `DEEPSEEK_API_BASE_URL`
- `AI_PROVIDER_TIMEOUT_MS`
- `AI_PROVIDER_MAX_RETRIES`

Notes:
- Do not commit API keys into git or share them in plaintext.
- If the primary provider fails (timeout/5xx/429), the function automatically tries the next configured provider.

## Deploy with Firebase
From `mvp-1-collab-board/` root:
```bash
firebase deploy --only functions
```
