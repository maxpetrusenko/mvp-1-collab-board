import { expect, type Page } from '@playwright/test'

export type AiCommandExecution = {
  httpStatus: number
  payload: {
    status?: string
    commandId?: string
    result?: {
      executedTools?: Array<unknown>
      objectCount?: number
      latencyMs?: number
      message?: string
      aiResponse?: string
      level?: string
    }
    error?: string
  } | null
}

const DEFAULT_AI_PANEL = '.ai-panel-sidebar .ai-panel'

export const openAiPanelIfNeeded = async (page: Page, panelSelector = DEFAULT_AI_PANEL) => {
  const aiTab = page.getByRole('button', { name: 'AI' })
  await expect(aiTab).toBeVisible()
  if ((await aiTab.getAttribute('aria-pressed')) !== 'true') {
    await aiTab.click()
  }
  await expect(page.locator(panelSelector)).toBeVisible()
}

export const submitAiCommandAndWaitForResponse = async (
  page: Page,
  args: {
    boardId: string
    command: string
    panelSelector?: string
    timeoutMs?: number
  },
): Promise<AiCommandExecution> => {
  const panelSelector = args.panelSelector || DEFAULT_AI_PANEL
  const timeoutMs = args.timeoutMs ?? 45_000
  const command = String(args.command || '')

  const responsePromise = page.waitForResponse(
    async (response) => {
      if (!response.url().includes('/api/ai/command')) return false
      if (response.request().method() !== 'POST') return false
      const postData = response.request().postData()
      if (!postData) return false
      try {
        const body = JSON.parse(postData) as { boardId?: string; command?: string }
        return body.boardId === args.boardId && String(body.command || '') === command
      } catch {
        return false
      }
    },
    { timeout: timeoutMs },
  )

  const aiInput = page.locator(`${panelSelector} .ai-input`).first()
  await expect(aiInput).toBeVisible()
  await aiInput.fill(command)
  await page.locator(panelSelector).getByRole('button', { name: 'Send Command' }).click()

  const response = await responsePromise
  const payload = (await response.json().catch(() => null)) as AiCommandExecution['payload']
  return {
    httpStatus: response.status(),
    payload,
  }
}

const isMutationExecutionSuccessful = (execution: AiCommandExecution) => {
  if (execution.httpStatus !== 200) return false
  const status = String(execution.payload?.status || '').toLowerCase()
  if (status !== 'success' && status !== 'warning') return false
  const executedTools = execution.payload?.result?.executedTools
  return Array.isArray(executedTools) && executedTools.length > 0
}

export const runAiMutationCommandWithRetry = async (
  page: Page,
  args: {
    boardId: string
    command: string
    panelSelector?: string
    timeoutMs?: number
    maxAttempts?: number
    retryDelayMs?: number
  },
): Promise<AiCommandExecution> => {
  const maxAttempts = Math.max(1, args.maxAttempts ?? 3)
  const retryDelayMs = Math.max(0, args.retryDelayMs ?? 600)
  let lastExecution: AiCommandExecution | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastExecution = await submitAiCommandAndWaitForResponse(page, args)
    if (isMutationExecutionSuccessful(lastExecution)) {
      return lastExecution
    }
    if (attempt < maxAttempts) {
      await page.waitForTimeout(retryDelayMs)
    }
  }

  throw new Error(
    `AI mutation command did not reach a successful execution after ${maxAttempts} attempt(s). Last HTTP=${lastExecution?.httpStatus}, status=${lastExecution?.payload?.status || 'unknown'}.`,
  )
}

