import { expect, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

type ReusableCredentialSlot = 'primary' | 'secondary' | 'tertiary' | 'quaternary'
type CredentialPair = { email: string; password: string }

const AUTH_CACHE_PATH = path.resolve(process.cwd(), '.e2e-auth-cache.json')
const runtimeCredentialCache = new Map<ReusableCredentialSlot, CredentialPair>()

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

const loadCachedCredential = (): CredentialPair | null => {
  if (!existsSync(AUTH_CACHE_PATH)) {
    return null
  }
  try {
    const raw = JSON.parse(readFileSync(AUTH_CACHE_PATH, 'utf8')) as { email?: unknown; password?: unknown }
    const email = typeof raw.email === 'string' ? raw.email.trim() : ''
    const password = typeof raw.password === 'string' ? raw.password.trim() : ''
    if (!email || !password) {
      return null
    }
    return { email, password }
  } catch {
    return null
  }
}

const saveCachedCredential = (credential: CredentialPair): void => {
  try {
    const payload = JSON.stringify({ email: credential.email, password: credential.password }, null, 2)
    writeFileSync(AUTH_CACHE_PATH, payload, 'utf8')
  } catch {
    // Best-effort cache persistence only.
  }
}

const getReusableCredentialPair = (slot: ReusableCredentialSlot = 'primary'): { email: string; password: string } | null => {
  const env = loadRawEnv()
  const slotCandidates: Record<
    ReusableCredentialSlot,
    { emails: Array<string | undefined>; passwords: Array<string | undefined> }
  > = {
    primary: {
      emails: [env.E2E_EMAIL, env.QA_EMAIL, env.EMAIL, env.EMAIL1],
      passwords: [env.E2E_PASSWORD, env.QA_PASSWORD, env.PW, env.PASSWORD],
    },
    secondary: {
      emails: [env.E2E_EMAIL_2, env.QA_EMAIL_2, env.EMAIL2],
      passwords: [env.E2E_PASSWORD_2, env.QA_PASSWORD_2, env.PW2, env.PASSWORD2, env.PW, env.PASSWORD],
    },
    tertiary: {
      emails: [env.E2E_EMAIL_3, env.QA_EMAIL_3, env.EMAIL3],
      passwords: [env.E2E_PASSWORD_3, env.QA_PASSWORD_3, env.PW3, env.PASSWORD3, env.PW, env.PASSWORD],
    },
    quaternary: {
      emails: [env.E2E_EMAIL_4, env.QA_EMAIL_4, env.EMAIL4],
      passwords: [env.E2E_PASSWORD_4, env.QA_PASSWORD_4, env.PW4, env.PASSWORD4, env.PW, env.PASSWORD],
    },
  }
  const candidateSet = slotCandidates[slot]
  const email = candidateSet.emails.map((value) => String(value || '').trim()).find((value) => value.length > 0)
  const password = candidateSet.passwords
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
    const isRateLimited =
      lastErrorMessage === 'TOO_MANY_ATTEMPTS_TRY_LATER' ||
      /visibility check was unavailable/i.test(lastErrorMessage) ||
      response.status === 429
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

export const createOrReuseTestUser = async (slot: ReusableCredentialSlot = 'primary'): Promise<TestUser> => {
  const envCredential = getReusableCredentialPair(slot)
  if (envCredential) {
    const idToken = await signInWithEmailPassword(envCredential.email, envCredential.password)
    if (idToken) {
      return {
        email: envCredential.email,
        password: envCredential.password,
        idToken,
        ephemeral: false,
      }
    }
  }

  const runtimeCredential = runtimeCredentialCache.get(slot)
  if (runtimeCredential) {
    const idToken = await signInWithEmailPassword(runtimeCredential.email, runtimeCredential.password)
    if (idToken) {
      return {
        email: runtimeCredential.email,
        password: runtimeCredential.password,
        idToken,
        ephemeral: false,
      }
    }
  }

  if (slot === 'primary') {
    const cachedCredential = loadCachedCredential()
    if (cachedCredential) {
      const idToken = await signInWithEmailPassword(cachedCredential.email, cachedCredential.password)
      if (idToken) {
        runtimeCredentialCache.set(slot, cachedCredential)
        return {
          email: cachedCredential.email,
          password: cachedCredential.password,
          idToken,
          ephemeral: false,
        }
      }
    }
  }

  const tempUser = await createTempUser()
  const credential = { email: tempUser.email, password: tempUser.password }
  runtimeCredentialCache.set(slot, credential)
  if (slot === 'primary') {
    saveCachedCredential(credential)
  }
  return {
    ...tempUser,
    ephemeral: false,
  }
}

export const cleanupTestUser = async (user: TestUser | null): Promise<void> => {
  if (!user || !user.ephemeral) {
    return
  }
  await deleteTempUser(user.idToken)
}

export const loginWithEmail = async (page: Page, appUrl: string, email: string, password: string): Promise<void> => {
  const maxAttempts = 2
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(`${appUrl}/login?qaAuth=1`)
      await page.getByTestId('qa-email-input').fill(email)
      await page.getByTestId('qa-password-input').fill(password)
      await page.getByTestId('qa-email-submit').click()
      await expect(page).toHaveURL(/\/b\//, { timeout: 40_000 })
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxAttempts) {
        await page.waitForTimeout(1_000)
      }
    }
  }

  throw lastError || new Error('Login did not reach board route.')
}
