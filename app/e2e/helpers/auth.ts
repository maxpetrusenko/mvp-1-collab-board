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

export const createTempUser = async (): Promise<TempUser> => {
  const { firebaseApiKey } = loadAuthTestConfig()
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `qa.ui.${suffix}@example.com`
  const password = `QATest!${suffix}Aa1`

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } }
  if (!response.ok || !body.idToken) {
    throw new Error(`Failed to create test user ${email}: ${body.error?.message ?? 'unknown error'}`)
  }

  return { email, password, idToken: body.idToken }
}

export const deleteTempUser = async (idToken: string): Promise<void> => {
  const { firebaseApiKey } = loadAuthTestConfig()
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export const loginWithEmail = async (page: Page, appUrl: string, email: string, password: string): Promise<void> => {
  await page.goto(`${appUrl}/login?qaAuth=1`)
  await page.getByTestId('qa-email-input').fill(email)
  await page.getByTestId('qa-password-input').fill(password)
  await page.getByTestId('qa-email-submit').click()
  await expect(page).toHaveURL(/\/b\//)
}
