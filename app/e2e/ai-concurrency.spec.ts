import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type EnvConfig = {
  firebaseApiKey: string
  firebaseProjectId: string
  aiCommandUrl: string
}

type TempUser = {
  email: string
  idToken: string
}

type AiResponse = {
  status?: string
  commandId?: string
  queueSequence?: number | null
  idempotent?: boolean
  error?: string
}

type FirestoreDocFields = {
  status?: { stringValue?: string }
  queueSequence?: { integerValue?: string }
}

type FirestoreDocument = {
  fields?: FirestoreDocFields
}

type FirestoreListResponse = {
  documents?: FirestoreDocument[]
}

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) {
    return {}
  }

  const entries = readFileSync(filePath, 'utf8')
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
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(entries)
}

const loadConfig = (): EnvConfig | null => {
  const envPath = path.resolve(process.cwd(), '.env')
  const fileEnv = parseEnvFile(envPath)

  const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY ?? fileEnv.VITE_FIREBASE_API_KEY
  const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID ?? fileEnv.VITE_FIREBASE_PROJECT_ID
  const aiBaseUrl = process.env.VITE_AI_API_BASE_URL ?? fileEnv.VITE_AI_API_BASE_URL

  if (!firebaseApiKey || !firebaseProjectId || !aiBaseUrl) {
    return null
  }

  return {
    firebaseApiKey,
    firebaseProjectId,
    aiCommandUrl: `${aiBaseUrl.replace(/\/$/, '')}/api/ai/command`,
  }
}

const createTempUser = async (firebaseApiKey: string): Promise<TempUser> => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `qa.playwright.${suffix}@example.com`
  const password = `QATest!${suffix}Aa1`

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } }
  if (!response.ok || !body.idToken) {
    throw new Error(`Failed to create temp user ${email}: ${body.error?.message ?? 'unknown error'}`)
  }

  return { email, idToken: body.idToken }
}

const deleteTempUser = async (firebaseApiKey: string, idToken: string): Promise<void> => {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

const postAiCommand = async (
  aiCommandUrl: string,
  idToken: string,
  body: {
    boardId: string
    command: string
    clientCommandId: string
    userDisplayName: string
  },
): Promise<AiResponse> => {
  const response = await fetch(aiCommandUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  })

  return (await response.json()) as AiResponse
}

test.describe('AI command concurrency', () => {
  test.setTimeout(180_000)

  test('concurrent authenticated commands preserve queue + idempotency', async () => {
    const config = loadConfig()
    if (!config) {
      throw new Error('Missing VITE_FIREBASE_API_KEY/VITE_FIREBASE_PROJECT_ID/VITE_AI_API_BASE_URL in app/.env')
    }

    const users: TempUser[] = []
    try {
      users.push(await createTempUser(config.firebaseApiKey))
      users.push(await createTempUser(config.firebaseApiKey))

      const boardId = `pw-ai-concurrency-${Date.now()}`
      const firstCommandId = `cmd-a-${Date.now()}`
      const secondCommandId = `cmd-b-${Date.now()}`

      const [first, second] = await Promise.all([
        postAiCommand(config.aiCommandUrl, users[0].idToken, {
          boardId,
          command: 'add yellow sticky note saying from-playwright-a',
          clientCommandId: firstCommandId,
          userDisplayName: 'QA User A',
        }),
        postAiCommand(config.aiCommandUrl, users[1].idToken, {
          boardId,
          command: 'create a blue rectangle at position 320,220',
          clientCommandId: secondCommandId,
          userDisplayName: 'QA User B',
        }),
      ])

      expect(first.status).toBe('success')
      expect(second.status).toBe('success')

      const duplicate = await postAiCommand(config.aiCommandUrl, users[0].idToken, {
        boardId,
        command: 'add yellow sticky note saying from-playwright-a',
        clientCommandId: firstCommandId,
        userDisplayName: 'QA User A',
      })

      expect(duplicate.status).toBe('success')
      expect(duplicate.idempotent).toBeTruthy()

      const docsResponse = await fetch(
        `https://firestore.googleapis.com/v1/projects/${config.firebaseProjectId}/databases/(default)/documents/boards/${boardId}/aiCommands`,
        {
          headers: {
            Authorization: `Bearer ${users[0].idToken}`,
          },
        },
      )
      expect(docsResponse.ok).toBeTruthy()

      const docs = (await docsResponse.json()) as FirestoreListResponse
      const queueSequences = (docs.documents ?? [])
        .map((doc) => Number(doc.fields?.queueSequence?.integerValue ?? '0'))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right)

      expect(queueSequences.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < queueSequences.length; i += 1) {
        expect(queueSequences[i]).toBeGreaterThanOrEqual(queueSequences[i - 1])
      }

      const statuses = (docs.documents ?? []).map((doc) => doc.fields?.status?.stringValue ?? 'unknown')
      expect(statuses).toContain('success')
    } finally {
      await Promise.all(users.map((user) => deleteTempUser(config.firebaseApiKey, user.idToken)))
    }
  })

  test('five authenticated users can execute command burst', async () => {
    const config = loadConfig()
    if (!config) {
      throw new Error('Missing VITE_FIREBASE_API_KEY/VITE_FIREBASE_PROJECT_ID/VITE_AI_API_BASE_URL in app/.env')
    }

    const users: TempUser[] = []
    try {
      for (let i = 0; i < 5; i += 1) {
        users.push(await createTempUser(config.firebaseApiKey))
      }

      const boardId = `pw-ai-burst-${Date.now()}`
      const responses = await Promise.all(
        users.map((user, index) =>
          postAiCommand(config.aiCommandUrl, user.idToken, {
            boardId,
            command: `add green sticky note saying burst-${index + 1}`,
            clientCommandId: `cmd-burst-${Date.now()}-${index + 1}`,
            userDisplayName: `QA Burst User ${index + 1}`,
          }),
        ),
      )

      for (const response of responses) {
        expect(response.status).toBe('success')
      }
    } finally {
      await Promise.all(users.map((user) => deleteTempUser(config.firebaseApiKey, user.idToken)))
    }
  })
})
