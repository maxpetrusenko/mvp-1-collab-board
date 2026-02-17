import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

import { loadAuthTestConfig } from './auth'
import { countByType, fetchBoardObjects, type BoardObject } from './firestore'

type FirestoreEncodedValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields: Record<string, FirestoreEncodedValue> } }
  | { arrayValue: { values: FirestoreEncodedValue[] } }

export type NavigationMetrics = {
  domContentLoadedMs: number | null
  loadEventMs: number | null
  firstPaintMs: number | null
  firstContentfulPaintMs: number | null
  responseStartMs: number | null
}

export type BoardLoadMeasurement = {
  totalMs: number
  metrics: NavigationMetrics
}

export type DragFrameRateOptions = {
  durationMs?: number
  deltaX?: number
  deltaY?: number
}

export type SeedBoardObjectsOptions = {
  kind?: 'sticky' | 'shape' | 'mixed'
  columns?: number
  spacingX?: number
  spacingY?: number
  startX?: number
  startY?: number
}

export type CursorPresence = {
  boardId?: string
  userId?: string
  displayName?: string
  x?: number
  y?: number
  lastSeen?: number
  connectionId?: string
}

export type BoardPresenceMap = Record<string, CursorPresence>

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const splitIndex = line.indexOf('=')
        if (splitIndex < 1) {
          return null
        }
        const key = line.slice(0, splitIndex).trim()
        const value = line.slice(splitIndex + 1).trim().replace(/^['"]|['"]$/g, '')
        return [key, value] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )
}

const waitForCondition = async (condition: () => Promise<boolean>, timeoutMs: number, intervalMs: number) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`)
}

const toFirestoreEncodedValue = (value: unknown): FirestoreEncodedValue => {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }

  if (typeof value === 'string') {
    return { stringValue: value }
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreEncodedValue(item)) } }
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      toFirestoreEncodedValue(nested),
    ])
    return {
      mapValue: {
        fields: Object.fromEntries(entries),
      },
    }
  }

  return { stringValue: String(value) }
}

const toFirestoreFields = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toFirestoreEncodedValue(nested)]))

const decodeIdTokenPayload = (idToken: string): Record<string, unknown> => {
  const payloadPart = idToken.split('.')[1]
  if (!payloadPart) {
    throw new Error('Invalid Firebase ID token')
  }

  const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const raw = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

const getRealtimeDatabaseUrl = (): string => {
  const envPath = path.resolve(process.cwd(), '.env')
  const envFile = parseEnvFile(envPath)
  const fromProcess = process.env.VITE_FIREBASE_DATABASE_URL
  const fromFile = envFile.VITE_FIREBASE_DATABASE_URL

  const configured = fromProcess || fromFile
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  const { firebaseProjectId } = loadAuthTestConfig()
  return `https://${firebaseProjectId}-default-rtdb.firebaseio.com`
}

export const decodeUserIdFromIdToken = (idToken: string): string => {
  const payload = decodeIdTokenPayload(idToken)
  const userId = String(payload.user_id || payload.sub || payload.uid || '')
  if (!userId) {
    throw new Error('Unable to resolve uid from Firebase ID token')
  }
  return userId
}

export const capturePerformanceMetrics = async (page: Page): Promise<NavigationMetrics> =>
  page.evaluate(() => {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paintEntries = performance.getEntriesByType('paint')
    const firstPaint = paintEntries.find((entry) => entry.name === 'first-paint')
    const firstContentfulPaint = paintEntries.find((entry) => entry.name === 'first-contentful-paint')

    return {
      domContentLoadedMs: navEntry ? navEntry.domContentLoadedEventEnd : null,
      loadEventMs: navEntry ? navEntry.loadEventEnd : null,
      firstPaintMs: firstPaint ? firstPaint.startTime : null,
      firstContentfulPaintMs: firstContentfulPaint ? firstContentfulPaint.startTime : null,
      responseStartMs: navEntry ? navEntry.responseStart : null,
    }
  })

export const measureBoardLoadTime = async (
  page: Page,
  url: string,
  readySelector = '.board-stage',
): Promise<BoardLoadMeasurement> => {
  const startedAt = Date.now()
  await page.goto(url)
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 30_000 })
  const totalMs = Date.now() - startedAt
  const metrics = await capturePerformanceMetrics(page)
  return { totalMs, metrics }
}

export const measureTimeToFirstSticky = async (
  page: Page,
  boardId?: string,
  idToken?: string,
): Promise<{ elapsedMs: number; stickyCount: number | null }> => {
  const startedAt = Date.now()
  await page.locator('button[title="Add sticky note (S)"]').click()
  await page.locator('.swatch-button').first().waitFor({ state: 'visible', timeout: 8_000 })

  let stickyCount: number | null = null
  if (boardId && idToken) {
    stickyCount = countByType(await fetchBoardObjects(boardId, idToken), 'stickyNote')
  }
  const elapsedMs = Date.now() - startedAt
  return { elapsedMs, stickyCount }
}

export const measureDragFrameRate = async (
  page: Page,
  boardObject: BoardObject,
  options: DragFrameRateOptions = {},
): Promise<number> => {
  const durationMs = options.durationMs ?? 1_200
  const deltaX = options.deltaX ?? 220
  const deltaY = options.deltaY ?? 140

  const canvasBox = await page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox || !boardObject.position || !boardObject.size) {
    throw new Error('Cannot resolve drag target bounds')
  }

  const startX = canvasBox.x + (boardObject.position.x ?? 0) + ((boardObject.size.width ?? 180) / 2)
  const startY = canvasBox.y + (boardObject.position.y ?? 0) + ((boardObject.size.height ?? 110) / 2)
  const endX = startX + deltaX
  const endY = startY + deltaY
  const steps = 24
  const stepDelay = Math.max(8, Math.floor(durationMs / steps))

  const frameRatePromise = page.evaluate(async (measureMs) => {
    const start = performance.now()
    let frames = 0
    return new Promise<number>((resolve) => {
      const tick = (now: number) => {
        frames += 1
        const elapsed = now - start
        if (elapsed >= measureMs) {
          resolve((frames * 1000) / elapsed)
          return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, durationMs)

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) {
    const progress = i / steps
    await page.mouse.move(startX + (endX - startX) * progress, startY + (endY - startY) * progress)
    await page.waitForTimeout(stepDelay)
  }
  await page.mouse.up()

  return frameRatePromise
}

export const seedBoardObjects = async (
  boardId: string,
  idToken: string,
  count: number,
  options: SeedBoardObjectsOptions = {},
): Promise<BoardObject[]> => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const createdBy = decodeUserIdFromIdToken(idToken)
  const kind = options.kind ?? 'mixed'
  const columns = options.columns ?? 10
  const spacingX = options.spacingX ?? 210
  const spacingY = options.spacingY ?? 130
  const startX = options.startX ?? 60
  const startY = options.startY ?? 60
  const now = Date.now()

  const objects: BoardObject[] = Array.from({ length: count }, (_, index) => {
    const id = `seed-${now}-${index}-${Math.floor(Math.random() * 1000)}`
    const row = Math.floor(index / columns)
    const column = index % columns
    const position = { x: startX + column * spacingX, y: startY + row * spacingY }
    const base = {
      id,
      boardId,
      position,
      zIndex: index + 1,
      createdBy,
      createdAt: now + index,
      updatedBy: createdBy,
      updatedAt: now + index,
      version: 1,
    }

    const asShape = kind === 'shape' || (kind === 'mixed' && index % 3 === 0)
    if (asShape) {
      return {
        ...base,
        type: 'shape',
        shapeType: 'rectangle',
        size: { width: 180, height: 110 },
        color: '#93c5fd',
        text: `Seed shape ${index + 1}`,
      }
    }

    return {
      ...base,
      type: 'stickyNote',
      size: { width: 180, height: 110 },
      color: '#fde68a',
      text: `Seed sticky ${index + 1}`,
    }
  })

  const writeObject = async (boardObject: BoardObject) => {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}/objects?documentId=${encodeURIComponent(boardObject.id)}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: toFirestoreFields(boardObject as Record<string, unknown>),
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Failed to seed object ${boardObject.id} (${response.status}): ${body.slice(0, 200)}`)
    }
  }

  const batchSize = 20
  for (let i = 0; i < objects.length; i += batchSize) {
    await Promise.all(objects.slice(i, i + batchSize).map((boardObject) => writeObject(boardObject)))
  }

  return objects
}

export const fetchCursorPresence = async (
  boardId: string,
  userId: string,
  idToken: string,
): Promise<CursorPresence | null> => {
  const databaseUrl = getRealtimeDatabaseUrl()
  const endpoint = `${databaseUrl}/presence/${encodeURIComponent(boardId)}/${encodeURIComponent(userId)}.json?auth=${encodeURIComponent(idToken)}`
  const response = await fetch(endpoint, { method: 'GET' })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to read presence (${response.status}): ${body.slice(0, 200)}`)
  }

  const payload = (await response.json()) as CursorPresence | null
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return payload
}

export const fetchBoardPresenceMap = async (boardId: string, idToken: string): Promise<BoardPresenceMap> => {
  const databaseUrl = getRealtimeDatabaseUrl()
  const endpoint = `${databaseUrl}/presence/${encodeURIComponent(boardId)}.json?auth=${encodeURIComponent(idToken)}`
  const response = await fetch(endpoint, { method: 'GET' })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to read board presence map (${response.status}): ${body.slice(0, 200)}`)
  }

  const payload = (await response.json()) as BoardPresenceMap | null
  if (!payload || typeof payload !== 'object') {
    return {}
  }
  return payload
}

export const writeCursorPresence = async (args: {
  boardId: string
  userId: string
  idToken: string
  displayName: string
  x: number
  y: number
  connectionId?: string
}): Promise<void> => {
  const databaseUrl = getRealtimeDatabaseUrl()
  const endpoint = `${databaseUrl}/presence/${encodeURIComponent(args.boardId)}/${encodeURIComponent(args.userId)}.json?auth=${encodeURIComponent(args.idToken)}`
  const now = Date.now()
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boardId: args.boardId,
      userId: args.userId,
      displayName: args.displayName,
      x: args.x,
      y: args.y,
      lastSeen: now,
      connectionId: args.connectionId || `perf-${now}`,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to write cursor presence (${response.status}): ${body.slice(0, 200)}`)
  }
}

export const measureCursorPublishLatency = async (args: {
  page: Page
  boardId: string
  userId: string
  idToken: string
  iterations?: number
}): Promise<number[]> => {
  await args.page.bringToFront()
  const iterations = args.iterations ?? 8
  const canvasBox = await args.page.locator('.board-stage canvas').first().boundingBox()
  if (!canvasBox) {
    throw new Error('Canvas bounds unavailable for cursor latency test')
  }

  await waitForCondition(
    async () => {
      const presence = await fetchCursorPresence(args.boardId, args.userId, args.idToken)
      return Boolean(presence)
    },
    10_000,
    100,
  )

  const latencies: number[] = []
  for (let i = 0; i < iterations; i += 1) {
    const baseline = await fetchCursorPresence(args.boardId, args.userId, args.idToken)
    const targetX = canvasBox.x + 80 + ((i * 67) % Math.max(120, canvasBox.width - 100))
    const targetY = canvasBox.y + 70 + ((i * 53) % Math.max(120, canvasBox.height - 90))

    const startedAt = Date.now()
    await args.page.mouse.move(targetX, targetY, { steps: 3 })

    await waitForCondition(
      async () => {
        const latest = await fetchCursorPresence(args.boardId, args.userId, args.idToken)
        if (!latest || typeof latest.x !== 'number' || typeof latest.y !== 'number') {
          return false
        }

        if (baseline && typeof baseline.x === 'number' && typeof baseline.y === 'number') {
          const movedFromBaseline = Math.abs(latest.x - baseline.x) >= 6 || Math.abs(latest.y - baseline.y) >= 6
          return movedFromBaseline
        }

        return true
      },
      5_000,
      50,
    )

    latencies.push(Date.now() - startedAt)
    await args.page.waitForTimeout(80)
  }

  return latencies
}

export const getUsedHeapSizeMb = async (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const value = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
    if (typeof value !== 'number') {
      return null
    }
    return value / (1024 * 1024)
  })

export const requestBestEffortGc = async (page: Page) => {
  const gcPage = page as unknown as { requestGC?: () => Promise<void> }
  if (gcPage.requestGC) {
    await gcPage.requestGC()
  }
}

export const measureAiCommandLatency = async (page: Page, command: string): Promise<{ elapsedMs: number; success: boolean }> => {
  const aiInput = page.locator('.ai-input textarea, .ai-input').first()
  const submitButton = page.locator('button[title*="Send"], button[aria-label*="Send"], .ai-submit-button').first()
  const messagesContainer = page.locator('.ai-messages, .chat-messages').first()

  const initialMessageCount = await messagesContainer.locator('.message, .chat-message').count()

  const startedAt = Date.now()
  await aiInput.fill(command)
  await submitButton.click()

  await page.waitForTimeout(600)

  await waitForCondition(
    async () => {
      const currentCount = await messagesContainer.locator('.message, .chat-message').count()
      return currentCount > initialMessageCount
    },
    25_000,
    150,
  )

  const elapsedMs = Date.now() - startedAt

  const hasErrorMessage = await page.locator('.error-message, .ai-error').count().then((c) => c > 0)
  const success = !hasErrorMessage

  return { elapsedMs, success }
}

export const deleteAllBoardObjects = async (boardId: string, idToken: string): Promise<void> => {
  const objects = await fetchBoardObjects(boardId, idToken)
  const { firebaseProjectId } = loadAuthTestConfig()

  const deleteObject = async (objectId: string) => {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}/objects/${encodeURIComponent(objectId)}?updateMask.fieldPaths=deleted`
    await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: {
          deleted: { booleanValue: true },
          updatedAt: { integerValue: String(Date.now()) },
        },
      }),
    })
  }

  const batchSize = 20
  for (let i = 0; i < objects.length; i += batchSize) {
    await Promise.all(objects.slice(i, i + batchSize).map((obj) => deleteObject(obj.id)))
  }
}

export const calculateMemoryGrowthOverCycles = async (args: {
  page: Page
  boardId: string
  idToken: string
  cycles: number
}): Promise<{ growthMb: number; samples: number[] }> => {
  const { page, boardId, idToken, cycles } = args
  const samples: number[] = []

  await requestBestEffortGc(page)
  const baseline = await getUsedHeapSizeMb(page)
  if (baseline === null) {
    throw new Error('Memory API unavailable; run Chrome with --enable-precise-memory-info')
  }
  samples.push(baseline)

  for (let i = 0; i < cycles; i += 1) {
    await page.locator('button[title="Add sticky note (S)"]').click()

    await waitForCondition(
      async () => {
        const objects = await fetchBoardObjects(boardId, idToken)
        const stickyCount = countByType(objects, 'stickyNote')
        return stickyCount > 0
      },
      8_000,
      100,
    )

    await page.waitForTimeout(200)
  }

  await requestBestEffortGc(page)
  const afterCreates = await getUsedHeapSizeMb(page)
  if (afterCreates === null) {
    throw new Error('Memory API unavailable after creates')
  }
  samples.push(afterCreates)

  const objects = await fetchBoardObjects(boardId, idToken)
  for (const obj of objects.slice(0, cycles)) {
    await page.evaluate((objectId) => {
      window.dispatchEvent(new CustomEvent('playwright-delete-object', { detail: { objectId } }))
    }, obj.id)
  }

  await page.waitForTimeout(500)
  await requestBestEffortGc(page)
  const final = await getUsedHeapSizeMb(page)
  if (final === null) {
    throw new Error('Memory API unavailable after deletes')
  }
  samples.push(final)

  return { growthMb: final - baseline, samples }
}

export const waitForAiPanelReady = async (page: Page): Promise<void> => {
  const launcher = page.getByTestId('ai-chat-widget-launcher')
  if (await launcher.count()) {
    await launcher.click()
  }
  await expect(page.getByTestId('ai-chat-widget')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.ai-input textarea, .ai-input')).first().toBeVisible({ timeout: 8000 })
}
