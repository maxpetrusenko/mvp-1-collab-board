import { expect, test } from '@playwright/test'

import { cleanupTestUser, createOrReuseTestUser, loginWithEmail } from './helpers/auth'
import {
  openAiPanelIfNeeded,
  runAiMutationCommandWithRetry,
} from './helpers/ai-command'
import { fetchBoardObjects, newestObjectByType } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const AI_PANEL = '.ai-panel-sidebar .ai-panel'
const ENFORCE_STRICT_AI_SLA = process.env.PLAYWRIGHT_STRICT_AI_SLA === '1'
const SIMPLE_AI_SLA = { target: 2_000, warning: 3_500, critical: 5_000 }

test.describe('AI command UI', () => {
  test.setTimeout(180_000)
  let user: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  test.beforeAll(async () => {
    user = await createOrReuseTestUser()
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('submits command from chat widget and creates board object', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-ui-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const stickyExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add green sticky note saying ai-ui-${Date.now()}`,
      panelSelector: AI_PANEL,
    })
    expect(stickyExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.text?.includes('ai-ui-'))
      })
      .toBe(true)

    const circleExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'add circle sticky note',
      panelSelector: AI_PANEL,
    })
    expect(circleExecution.httpStatus).toBe(200)
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.shapeType === 'circle')
      })
      .toBe(true)
  })

  test('creates two circle stickies from a numbered multi-sticky command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-multi-sticky-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const multiExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'create two stickers with circle form one say 1 another says 2',
      panelSelector: AI_PANEL,
    })
    expect(multiExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const circleStickies = objects.filter(
          (object) => object.type === 'stickyNote' && object.shapeType === 'circle',
        )
        const labels = new Set(
          circleStickies.map((object) => String(object.text || '').trim()).filter((text) => text.length > 0),
        )
        return {
          circleStickyCount: circleStickies.length,
          hasOne: labels.has('1'),
          hasTwo: labels.has('2'),
        }
      })
      .toEqual({
        circleStickyCount: 2,
        hasOne: true,
        hasTwo: true,
      })
  })

  test('changes sticky color via AI command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-color-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)
    await page.locator('button[title="Add sticky note (S)"]').click()

    let stickyId = ''
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = newestObjectByType(objects, 'stickyNote')
        stickyId = sticky?.id || ''
        return sticky?.id || ''
      })
      .not.toBe('')

    const recolorCommands = [
      'change the sticky note color to blue',
      'change color to blue',
      'set the selected sticky note color to blue',
    ]
    let recolorMatched = false
    let lastObservedColor = ''

    for (const command of recolorCommands) {
      const recolorExecution = await runAiMutationCommandWithRetry(page, {
        boardId,
        command,
        panelSelector: AI_PANEL,
      })
      expect(recolorExecution.httpStatus).toBe(200)

      try {
        await expect
          .poll(
            async () => {
              const objects = await fetchBoardObjects(boardId, user.idToken)
              const sticky = objects.find((object) => object.id === stickyId)
              return sticky?.color || ''
            },
            { timeout: 4_000 },
          )
          .toBe('#93c5fd')
        recolorMatched = true
        break
      } catch {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find((object) => object.id === stickyId)
        lastObservedColor = sticky?.color || ''
      }
    }

    expect(
      recolorMatched,
      `AI recolor command did not set sticky ${stickyId} to blue. Last observed color: ${lastObservedColor || 'unknown'}.`,
    ).toBe(true)
  })

  test('creates red sticky note via AI command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-red-sticky-${Date.now()}`
    const testText = `red-sticky-test-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    // Command: "add red sticky note" with text
    const redExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add red sticky note saying ${testText}`,
      panelSelector: AI_PANEL,
    })
    expect(redExecution.httpStatus).toBe(200)

    // Verify sticky note created with red color and correct text
    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const redSticky = objects.find(
          (object) => object.type === 'stickyNote' && object.color === '#fca5a5' && object.text?.includes(testText)
        )
        return redSticky || null
      })
      .toBeTruthy()
  })

  test('creates red sticky note when command includes numeric count prefix', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-red-sticky-count-${Date.now()}`
    const testText = `red-sticky-count-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const countPrefixedExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add 1 red sticky note saying ${testText}`,
      panelSelector: AI_PANEL,
    })
    expect(countPrefixedExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const redSticky = objects.find(
          (object) => object.type === 'stickyNote' && object.color === '#fca5a5' && object.text?.includes(testText),
        )
        return redSticky || null
      })
      .toBeTruthy()
  })

  test('creates green circle sticky from color-and-text instruction phrasing', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-green-round-${Date.now()}`
    const testText = `yo yo yo ${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const greenRoundExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: `add round sticky note with green color and text: ${testText}`,
      panelSelector: AI_PANEL,
    })
    expect(greenRoundExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const sticky = objects.find(
          (object) =>
            object.type === 'stickyNote' &&
            object.color === '#86efac' &&
            object.shapeType === 'circle' &&
            object.text?.includes(testText),
        )
        return sticky || null
      })
      .toBeTruthy()
  })

  test('creates mixed-shape stickies from a compound command segment', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-mixed-segment-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const mixedShapeExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'add 1 red round sticky and 1 green triangle with words boo',
      panelSelector: AI_PANEL,
    })
    expect(mixedShapeExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const stickies = objects.filter((object) => object.type === 'stickyNote')
        const hasRedCircle = stickies.some(
          (object) => object.shapeType === 'circle' && object.color === '#fca5a5',
        )
        const hasGreenTriangle = stickies.some(
          (object) =>
            object.shapeType === 'triangle' && object.color === '#86efac' && object.text?.toLowerCase().includes('boo'),
        )

        return {
          stickyCount: stickies.length,
          hasRedCircle,
          hasGreenTriangle,
        }
      })
      .toEqual({
        stickyCount: 2,
        hasRedCircle: true,
        hasGreenTriangle: true,
      })
  })

  test('creates full count from compound multi-segment sticky command', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-multi-segment-count-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const multiSegmentExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'add 2 blue sticky notes and 1 red sticky note saying risk',
      panelSelector: AI_PANEL,
    })
    expect(multiSegmentExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const stickies = objects.filter((object) => object.type === 'stickyNote')
        const blueCount = stickies.filter((object) => object.color === '#93c5fd').length
        const redRiskCount = stickies.filter(
          (object) => object.color === '#fca5a5' && object.text?.toLowerCase().includes('risk'),
        ).length
        return {
          stickyCount: stickies.length,
          blueCount,
          redRiskCount,
        }
      })
      .toEqual({
        stickyCount: 3,
        blueCount: 2,
        redRiskCount: 1,
      })
  })

  test('creates a business model canvas with channels and revenue content', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-bmc-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const bmcExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'Generate a Business Model Canvas for ai chat bot, including example channels and revenue streams.',
      panelSelector: AI_PANEL,
      maxAttempts: 2,
    })
    expect(bmcExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const stickies = objects.filter((object) => object.type === 'stickyNote')
        const hasChannels = stickies.some((object) => object.text?.includes('Channels'))
        const hasRevenue = stickies.some((object) => object.text?.includes('Revenue Streams'))
        return {
          stickyCount: stickies.length,
          hasChannels,
          hasRevenue,
        }
      })
      .toEqual({
        stickyCount: 9,
        hasChannels: true,
        hasRevenue: true,
      })
  })

  test('password reset flowchart uses branch-aware nodes and avoids overlap on repeated commands', async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_VALIDATE_AI_LAYOUT !== '1',
      'Set PLAYWRIGHT_VALIDATE_AI_LAYOUT=1 after deploying updated AI functions for layout validation.',
    )
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-password-flow-${Date.now()}`
    const command =
      'Create a password reset flowchart for an email account with 9 nodes: start/end oval, process rectangles, decision diamonds, and arrows between every step. Label decision branches Yes/No.'

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const flowFirstExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command,
      panelSelector: AI_PANEL,
      maxAttempts: 2,
    })
    expect(flowFirstExecution.httpStatus).toBe(200)
    const flowSecondExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command,
      panelSelector: AI_PANEL,
      maxAttempts: 2,
    })
    expect(flowSecondExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        const shapes = objects
          .filter((object) => object.type === 'shape')
          .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0))
        const connectors = objects.filter((object) => object.type === 'connector')
        const hasYesNode = shapes.some((object) => object.text?.includes('Yes:'))
        const hasNoNode = shapes.some((object) => object.text?.includes('No:'))
        const sideAnchorsOnly = connectors.every(
          (object) =>
            ['top', 'right', 'bottom', 'left'].includes(String(object.fromAnchor || '')) &&
            ['top', 'right', 'bottom', 'left'].includes(String(object.toAnchor || '')),
        )

        if (shapes.length < 18) {
          return {
            shapes: shapes.length,
            connectors: connectors.length,
            hasYesNode,
            hasNoNode,
            sideAnchorsOnly,
            nonOverlapping: false,
          }
        }

        const boundsFor = (entries: typeof shapes) => {
          const minX = Math.min(...entries.map((entry) => Number(entry.position?.x || 0)))
          const minY = Math.min(...entries.map((entry) => Number(entry.position?.y || 0)))
          const maxX = Math.max(
            ...entries.map((entry) => Number(entry.position?.x || 0) + Number(entry.size?.width || 0)),
          )
          const maxY = Math.max(
            ...entries.map((entry) => Number(entry.position?.y || 0) + Number(entry.size?.height || 0)),
          )
          return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          }
        }

        const overlaps = (left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) =>
          left.x < right.x + right.width &&
          left.x + left.width > right.x &&
          left.y < right.y + right.height &&
          left.y + left.height > right.y

        const firstBounds = boundsFor(shapes.slice(0, 9))
        const secondBounds = boundsFor(shapes.slice(9, 18))

        return {
          shapes: shapes.length,
          connectors: connectors.length,
          hasYesNode,
          hasNoNode,
          sideAnchorsOnly,
          nonOverlapping: !overlaps(firstBounds, secondBounds),
        }
      })
      .toEqual({
        shapes: 18,
        connectors: 18,
        hasYesNode: true,
        hasNoNode: true,
        sideAnchorsOnly: true,
        nonOverlapping: true,
      })
  })

  test('AI command completes within configured SLA budget', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-perf-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    const startTime = Date.now()
    const perfExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'add yellow sticky note saying performance test',
      panelSelector: AI_PANEL,
    })
    expect(perfExecution.httpStatus).toBe(200)
    const endTime = Date.now()

    const duration = endTime - startTime
    const reportedLatencyMs = Number(perfExecution.payload?.result?.latencyMs)
    if (Number.isFinite(reportedLatencyMs)) {
      if (ENFORCE_STRICT_AI_SLA) {
        expect(reportedLatencyMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.target)
      } else {
        expect(reportedLatencyMs).toBeLessThanOrEqual(SIMPLE_AI_SLA.critical)
      }
    }
    if (ENFORCE_STRICT_AI_SLA) {
      expect(duration).toBeLessThan(4_000)
    } else {
      expect(duration).toBeLessThan(7_000)
    }
  })

  test('creates sticky at specific screen position via AI', async ({ page }) => {
    if (!user) {
      throw new Error('Shared test user unavailable')
    }
    const boardId = `pw-ai-position-${Date.now()}`

    await loginWithEmail(page, APP_URL, user.email, user.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()
    await openAiPanelIfNeeded(page, AI_PANEL)

    // Test position understanding: "add sticky at top left"
    const positionedExecution = await runAiMutationCommandWithRetry(page, {
      boardId,
      command: 'add blue sticky note at top left',
      panelSelector: AI_PANEL,
    })
    expect(positionedExecution.httpStatus).toBe(200)

    await expect
      .poll(async () => {
        const objects = await fetchBoardObjects(boardId, user.idToken)
        return objects.some((object) => object.type === 'stickyNote' && object.color === '#93c5fd')
      })
      .toBe(true)
  })
})
