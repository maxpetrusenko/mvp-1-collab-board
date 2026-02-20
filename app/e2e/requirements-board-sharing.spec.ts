import { expect, test, type Page } from '@playwright/test'

import { createTempUser, deleteTempUser, getUserIdFromIdToken, loginWithEmail } from './helpers/auth'
import { fetchBoardMeta } from './helpers/firestore'

const APP_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://mvp-1-collab-board.web.app'
const randomSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

const openBoardsPanel = async (page: Page) => {
  await page.getByTestId('open-boards-panel').click()
  await expect(page.getByTestId('boards-panel')).toBeVisible()
}

const shareBoardWithEmail = async (page: Page, email: string, role: 'edit' | 'view' = 'edit') => {
  await page.getByTestId('share-current-board-button').click()
  await expect(page.getByTestId('boards-panel')).toBeVisible()
  await expect(page.getByTestId('share-dialog')).toBeVisible()
  await expect(page.getByTestId('share-role-select')).toHaveValue('edit')
  await page.getByTestId('share-email-input').fill(email)
  await page.getByTestId('share-role-select').selectOption(role)
  await page.getByTestId('share-submit-button').click()
  await expect(page.getByTestId('share-status')).toBeVisible()
}

test.describe('Requirements: board permission sharing', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(240_000)

  let owner: Awaited<ReturnType<typeof createTempUser>> | null = null
  let collaborator: Awaited<ReturnType<typeof createTempUser>> | null = null
  let ownerId = ''
  let collaboratorId = ''

  test.beforeAll(async () => {
    ;[owner, collaborator] = await Promise.all([createTempUser(), createTempUser()])
    ownerId = getUserIdFromIdToken(owner.idToken)
    collaboratorId = getUserIdFromIdToken(collaborator.idToken)
  })

  test.afterAll(async () => {
    await Promise.all([
      owner ? deleteTempUser(owner.idToken).catch(() => undefined) : Promise.resolve(),
      collaborator ? deleteTempUser(collaborator.idToken).catch(() => undefined) : Promise.resolve(),
    ])
  })

  test('FR-22: owner can open share dialog from main board header', async ({ page }) => {
    const boardId = `pw-req-board-share-header-${randomSuffix()}`
    if (!owner) {
      throw new Error('Expected owner test user to be created in beforeAll')
    }

    await loginWithEmail(page, APP_URL, owner.email, owner.password)
    await page.goto(`${APP_URL}/b/${boardId}`)
    await expect(page.locator('.board-stage')).toBeVisible()

    const shareButton = page.getByTestId('share-current-board-button')
    await expect(shareButton).toBeVisible()
    await shareButton.click()

    await expect(page.getByTestId('boards-panel')).toBeVisible()
    await expect(page.getByTestId('share-dialog')).toBeVisible()
    await expect(page.getByTestId('share-role-select')).toHaveValue('edit')
  })

  test('FR-22: denies board access to authenticated user when board is not shared', async ({ browser }) => {
    const boardId = `pw-req-board-denied-${randomSuffix()}`
    if (!owner || !collaborator) {
      throw new Error('Expected test users to be created in beforeAll')
    }
    const ownerContext = await browser.newContext()
    const collaboratorContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const collaboratorPage = await collaboratorContext.newPage()

    try {
      await loginWithEmail(ownerPage, APP_URL, owner.email, owner.password)
      await ownerPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(ownerPage.locator('.board-stage')).toBeVisible()
      await ownerPage.locator('button[title="Add sticky note (S)"]').click()
      await expect
        .poll(async () => {
          const meta = await fetchBoardMeta(boardId, owner.idToken)
          if (!meta) {
            return false
          }
          const sharedWith = Array.isArray(meta.sharedWith) ? meta.sharedWith : []
          return meta.ownerId === ownerId && !sharedWith.includes(collaboratorId)
        })
        .toBe(true)

      await loginWithEmail(collaboratorPage, APP_URL, collaborator.email, collaborator.password)
      await collaboratorPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(collaboratorPage.getByTestId('board-access-denied')).toBeVisible()
    } finally {
      await Promise.all([
        ownerContext.close().catch(() => undefined),
        collaboratorContext.close().catch(() => undefined),
      ])
    }
  })

  test('FR-22: grants board access after owner shares board with collaborator email', async ({ browser }) => {
    const boardId = `pw-req-board-share-${randomSuffix()}`
    if (!owner || !collaborator) {
      throw new Error('Expected test users to be created in beforeAll')
    }
    const ownerContext = await browser.newContext()
    const collaboratorContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const collaboratorPage = await collaboratorContext.newPage()

    try {
      await loginWithEmail(collaboratorPage, APP_URL, collaborator.email, collaborator.password)
      await loginWithEmail(ownerPage, APP_URL, owner.email, owner.password)
      await ownerPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(ownerPage.locator('.board-stage')).toBeVisible()

      await shareBoardWithEmail(ownerPage, collaborator.email)
      await expect(ownerPage.getByTestId(`share-collaborator-${collaboratorId}`)).toBeVisible()

      await collaboratorPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(collaboratorPage.locator('.board-stage')).toBeVisible()
      await expect(collaboratorPage.locator('button[title="Add sticky note (S)"]')).toBeEnabled()
      await openBoardsPanel(collaboratorPage)
      await expect(
        collaboratorPage.getByTestId('board-list-shared').getByTestId(`board-list-item-${boardId}`),
      ).toBeVisible()
    } finally {
      await Promise.all([
        ownerContext.close().catch(() => undefined),
        collaboratorContext.close().catch(() => undefined),
      ])
    }
  })

  test('FR-22: owner can share read-only access and collaborator cannot edit', async ({ browser }) => {
    const boardId = `pw-req-board-view-${randomSuffix()}`
    if (!owner || !collaborator) {
      throw new Error('Expected test users to be created in beforeAll')
    }
    const ownerContext = await browser.newContext()
    const collaboratorContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const collaboratorPage = await collaboratorContext.newPage()

    try {
      await loginWithEmail(collaboratorPage, APP_URL, collaborator.email, collaborator.password)
      await loginWithEmail(ownerPage, APP_URL, owner.email, owner.password)
      await ownerPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(ownerPage.locator('.board-stage')).toBeVisible()

      await shareBoardWithEmail(ownerPage, collaborator.email, 'view')
      await expect(ownerPage.getByTestId(`share-collaborator-${collaboratorId}`)).toBeVisible()
      await expect(ownerPage.getByTestId(`share-collaborator-role-${collaboratorId}`)).toContainText('Read only')

      await collaboratorPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(collaboratorPage.locator('.board-stage')).toBeVisible()
      await expect(collaboratorPage.getByTestId('interaction-mode-pill')).toContainText('View mode')
      await expect(collaboratorPage.getByTestId('interaction-mode-edit')).toBeDisabled()
      await expect(collaboratorPage.locator('button[title="Add sticky note (S)"]')).toBeDisabled()
      await expect(collaboratorPage.getByRole('button', { name: 'Send Command' })).toBeDisabled()
    } finally {
      await Promise.all([
        ownerContext.close().catch(() => undefined),
        collaboratorContext.close().catch(() => undefined),
      ])
    }
  })

  test('FR-22: revokes collaborator access after owner removes share', async ({ browser }) => {
    const boardId = `pw-req-board-revoke-${randomSuffix()}`
    if (!owner || !collaborator) {
      throw new Error('Expected test users to be created in beforeAll')
    }
    const ownerContext = await browser.newContext()
    const collaboratorContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const collaboratorPage = await collaboratorContext.newPage()

    try {
      await loginWithEmail(collaboratorPage, APP_URL, collaborator.email, collaborator.password)
      await loginWithEmail(ownerPage, APP_URL, owner.email, owner.password)
      await ownerPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(ownerPage.locator('.board-stage')).toBeVisible()

      await shareBoardWithEmail(ownerPage, collaborator.email)
      await expect(ownerPage.getByTestId(`share-collaborator-${collaboratorId}`)).toBeVisible()

      await collaboratorPage.goto(`${APP_URL}/b/${boardId}`)
      await expect(collaboratorPage.locator('.board-stage')).toBeVisible()

      await ownerPage.getByTestId(`revoke-collaborator-${collaboratorId}`).click()
      await expect(ownerPage.getByTestId(`share-collaborator-${collaboratorId}`)).toHaveCount(0)

      await collaboratorPage.reload()
      await expect(collaboratorPage.getByTestId('board-access-denied')).toBeVisible()
    } finally {
      await Promise.all([
        ownerContext.close().catch(() => undefined),
        collaboratorContext.close().catch(() => undefined),
      ])
    }
  })
})
