import { expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type EnvConfig = {
  firebaseApiKey: string
  firebaseProjectId: string
}

type TempUser = {
  email: string
  password: string
  idToken: string
}

type TestUser = {
  email: string
  password: string
  idToken: string
  ephemeral: boolean
}

const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const [, payload] = token.split('.')
  if (!payload) {
    throw new Error('Invalid JWT payload')
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const decoded = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(decoded) as Record<string, unknown>
}

export const getUserIdFromIdToken = (idToken: string): string => {
  const payload = decodeJwtPayload(idToken)
  const userId =
    (typeof payload.user_id === 'string' && payload.user_id) ||
    (typeof payload.sub === 'string' && payload.sub) ||
    ''
  if (!userId) {
    throw new Error('Unable to resolve Firebase user id from token')
  }
  return userId
}

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

export const loadAuthTestConfig = (): EnvConfig => {
  const envPath = path.resolve(process.cwd(), '.env')
  const fileEnv = parseEnvFile(envPath)
  const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY ?? fileEnv.VITE_FIREBASE_API_KEY
  const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID ?? fileEnv.VITE_FIREBASE_PROJECT_ID

  if (!firebaseApiKey) {
    throw new Error('Missing VITE_FIREBASE_API_KEY in app/.env for authenticated Playwright tests')
  }
  if (!firebaseProjectId) {
    throw new Error('Missing VITE_FIREBASE_PROJECT_ID in app/.env for authenticated Playwright tests')
  }

  return { firebaseApiKey, firebaseProjectId }
}

const loadRawEnv = (): Record<string, string> => {
  const envPath = path.resolve(process.cwd(), '.env')
  const fileEnv = parseEnvFile(envPath)
  return {
    ...fileEnv,
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
  }
}

const getReusableCredentialPair = (): { email: string; password: string } | null => {
  const env = loadRawEnv()
  const email = [
    env.E2E_EMAIL,
    env.QA_EMAIL,
    env.EMAIL,
    env.EMAIL1,
    env.EMAIL2,
    env.EMAIL3,
    env.EMAIL4,
  ]
    .map((value) => String(value || '').trim())
    .find((value) => value.length > 0)
  const password = [env.E2E_PASSWORD, env.QA_PASSWORD, env.PW]
    .map((value) => String(value || '').trim())
    .find((value) => value.length > 0)

  if (!email || !password) {
    return null
  }

  return { email, password }
}

const signInWithEmailPassword = async (email: string, password: string): Promise<string | null> => {
  const { firebaseApiKey } = loadAuthTestConfig()
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const body = (await response.json()) as { idToken?: string }
  if (!response.ok || !body.idToken) {
    return null
  }
  return body.idToken
}

export const createTempUser = async (): Promise<TempUser> => {
  const { firebaseApiKey } = loadAuthTestConfig()
  const maxAttempts = 8
  let lastErrorMessage = 'unknown error'
  let lastEmail = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const email = `qa.ui.${suffix}@example.com`
    const password = `QATest!${suffix}Aa1`
    lastEmail = email

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    })

    const body = (await response.json()) as { idToken?: string; error?: { message?: string } }
    if (response.ok && body.idToken) {
      return { email, password, idToken: body.idToken }
    }

    lastErrorMessage = body.error?.message ?? `HTTP_${response.status}`
    const isRateLimited = lastErrorMessage === 'TOO_MANY_ATTEMPTS_TRY_LATER' || response.status === 429
    if (!isRateLimited || attempt === maxAttempts) {
      break
    }

    const backoffMs = Math.min(15_000, 1_000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 400)
    await new Promise((resolve) => setTimeout(resolve, backoffMs))
  }

  throw new Error(`Failed to create test user ${lastEmail}: ${lastErrorMessage}`)
}

export const deleteTempUser = async (idToken: string): Promise<void> => {
  const { firebaseApiKey } = loadAuthTestConfig()
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export const createOrReuseTestUser = async (): Promise<TestUser> => {
  const reusable = getReusableCredentialPair()
  if (reusable) {
    const idToken = await signInWithEmailPassword(reusable.email, reusable.password)
    if (idToken) {
      return {
        email: reusable.email,
        password: reusable.password,
        idToken,
        ephemeral: false,
      }
    }
  }

  const tempUser = await createTempUser()
  return {
    ...tempUser,
    ephemeral: true,
  }
}

export const cleanupTestUser = async (user: TestUser | null): Promise<void> => {
  if (!user || !user.ephemeral) {
    return
  }
  await deleteTempUser(user.idToken)
}

export const loginWithEmail = async (page: Page, appUrl: string, email: string, password: string): Promise<void> => {
  await page.goto(`${appUrl}/login?qaAuth=1`)
  await page.getByTestId('qa-email-input').fill(email)
  await page.getByTestId('qa-password-input').fill(password)
  await page.getByTestId('qa-email-submit').click()
  await expect(page).toHaveURL(/\/b\//, { timeout: 20_000 })
}
