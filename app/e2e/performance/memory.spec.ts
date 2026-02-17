import { expect, test, type TestInfo } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from '../helpers/auth'
import { fetchBoardObjects } from '../helpers/firestore'
import { getUsedHeapSizeMb, requestBestEffortGc } from '../helpers/performance'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const MEMORY_GROWTH_SLA_MB = { target: 8, warning: 14, critical: 20 }

const annotateSla = (
  testInfo: TestInfo,
  metric: string,
  value: number,
  bounds: { target: number; warning: number; critical: number },
) => {
  testInfo.annotations.push({
    type: 'performance',
    description: `${metric}: ${value.toFixed(2)}MB (target ${bounds.target}MB, warning ${bounds.warning}MB, critical ${bounds.critical}MB)`,
  })
}

test.describe('Performance: Memory', () => {
  test.setTimeout(240_000)

  test('heap growth stays under critical threshold over 50 create/delete cycles', async ({ page }, testInfo) => {
    const user = await createOrReuseTestUser()
    const boardId = `pw-perf-memory-${Date.now()}`
    const cycles = 50

    try {
      await loginWithEmail(page, APP_URL, user.email, user.password)
      await page.goto(`${APP_URL}/b/${boardId}`)
      await expect(page.locator('.board-stage')).toBeVisible()

      const supportsHeapMetrics = (await getUsedHeapSizeMb(page)) !== null
      test.skip(!supportsHeapMetrics, 'Browser does not expose JS heap metrics')

      await requestBestEffortGc(page)
      const baselineMb = (await getUsedHeapSizeMb(page)) ?? 0

      for (let i = 0; i < cycles; i += 1) {
        const beforeCount = (await fetchBoardObjects(boardId, user.idToken)).length
        await page.locator('button[title="Add sticky note (S)"]').click()

        await expect
          .poll(async () => {
            const objects = await fetchBoardObjects(boardId, user.idToken)
            return objects.length
          })
          .toBe(beforeCount + 1)

        const deleteButton = page.locator('button[aria-label="Delete selected object"]')
        await expect(deleteButton).toBeEnabled()
        await deleteButton.click()

        await expect
          .poll(async () => {
            const objects = await fetchBoardObjects(boardId, user.idToken)
            return objects.length
          })
          .toBe(beforeCount)
      }

      await expect
        .poll(async () => {
          const objects = await fetchBoardObjects(boardId, user.idToken)
          return objects.length
        })
        .toBe(0)

      await page.waitForTimeout(500)
      await requestBestEffortGc(page)
      await page.waitForTimeout(200)
      const finalMb = (await getUsedHeapSizeMb(page)) ?? baselineMb
      const growthMb = finalMb - baselineMb

      console.log(`[PERF] Heap growth over ${cycles} cycles: ${growthMb.toFixed(2)}MB (baseline: ${baselineMb.toFixed(2)}MB, final: ${finalMb.toFixed(2)}MB)`)

      annotateSla(testInfo, 'heap-growth-after-50-cycles', growthMb, MEMORY_GROWTH_SLA_MB)
      expect(growthMb).toBeLessThan(MEMORY_GROWTH_SLA_MB.critical)
    } finally {
      await cleanupTestUser(user)
    }
  })
})
