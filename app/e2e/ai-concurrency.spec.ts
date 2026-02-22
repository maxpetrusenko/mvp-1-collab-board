import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanupTestUser, createOrReuseTestUser, loadAuthTestConfig } from './helpers/auth'

type EnvConfig = {
  firebaseProjectId: string
  aiCommandUrl: string
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
  name?: string
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

  const firebaseProjectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? fileEnv.VITE_FIREBASE_PROJECT_ID ?? loadAuthTestConfig().firebaseProjectId
  const aiBaseUrl = process.env.VITE_AI_API_BASE_URL ?? fileEnv.VITE_AI_API_BASE_URL

  if (!firebaseProjectId || !aiBaseUrl) {
    return null
  }

  return {
    firebaseProjectId,
    aiCommandUrl: `${aiBaseUrl.replace(/\/$/, '')}/api/ai/command`,
  }
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

const listAiCommandDocs = async (config: EnvConfig, boardId: string, idToken: string): Promise<FirestoreDocument[]> => {
  const docsResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${config.firebaseProjectId}/databases/(default)/documents/boards/${boardId}/aiCommands`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  )
  expect(docsResponse.ok).toBeTruthy()
  const docs = (await docsResponse.json()) as FirestoreListResponse
  return docs.documents ?? []
}

const getDocumentId = (doc: FirestoreDocument): string => {
  const name = String(doc.name || '')
  if (!name.includes('/')) {
    return ''
  }
  return name.slice(name.lastIndexOf('/') + 1)
}

test.describe('AI command concurrency', () => {
  test.setTimeout(180_000)
  let primaryUser: Awaited<ReturnType<typeof createOrReuseTestUser>> | null = null

  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    primaryUser = await createOrReuseTestUser('primary')
  })

  test.afterAll(async () => {
    await cleanupTestUser(primaryUser)
  })

  test('concurrent authenticated commands preserve queue + idempotency', async () => {
    const config = loadConfig()
    if (!config) {
      throw new Error('Missing VITE_FIREBASE_PROJECT_ID/VITE_AI_API_BASE_URL in app/.env')
    }
    if (!primaryUser) {
      throw new Error('Expected shared authenticated user to be available')
    }

    const boardId = `pw-ai-concurrency-${Date.now()}`
    const firstCommandId = `cmd-a-${Date.now()}`
    const secondCommandId = `cmd-b-${Date.now()}`

    const [first, second] = await Promise.all([
      postAiCommand(config.aiCommandUrl, primaryUser.idToken, {
        boardId,
        command: 'add yellow sticky note saying from-playwright-a',
        clientCommandId: firstCommandId,
        userDisplayName: 'QA User A',
      }),
      postAiCommand(config.aiCommandUrl, primaryUser.idToken, {
        boardId,
        command: 'create a blue rectangle at position 320,220',
        clientCommandId: secondCommandId,
        userDisplayName: 'QA User B',
      }),
    ])

    expect(first.error || '').toBe('')
    expect(second.error || '').toBe('')
    if (first.status) {
      expect(['success', 'queued', 'running']).toContain(first.status)
    }
    if (second.status) {
      expect(['success', 'queued', 'running']).toContain(second.status)
    }

    await expect
      .poll(async () => {
        const docs = await listAiCommandDocs(config, boardId, primaryUser.idToken)
        const statusById = new Map(
          docs.map((doc) => [getDocumentId(doc), doc.fields?.status?.stringValue || 'unknown']),
        )
        return `${statusById.get(firstCommandId) || 'unknown'}|${statusById.get(secondCommandId) || 'unknown'}`
      })
      .toBe('success|success')

    const duplicate = await postAiCommand(config.aiCommandUrl, primaryUser.idToken, {
      boardId,
      command: 'add yellow sticky note saying from-playwright-a',
      clientCommandId: firstCommandId,
      userDisplayName: 'QA User A',
    })

    expect(duplicate.error || '').toBe('')
    if (duplicate.status) {
      expect(['success', 'queued', 'running']).toContain(duplicate.status)
    }
    if (typeof duplicate.idempotent !== 'undefined') {
      expect(duplicate.idempotent).toBeTruthy()
    }

    const docs = await listAiCommandDocs(config, boardId, primaryUser.idToken)
    const queueSequences = docs
      .map((doc) => Number(doc.fields?.queueSequence?.integerValue ?? '0'))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right)

    expect(queueSequences.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < queueSequences.length; i += 1) {
      expect(queueSequences[i]).toBeGreaterThanOrEqual(queueSequences[i - 1])
    }

    const statuses = docs.map((doc) => doc.fields?.status?.stringValue ?? 'unknown')
    expect(statuses).toContain('success')
  })

  test('five authenticated command requests can execute burst on one board', async () => {
    const config = loadConfig()
    if (!config) {
      throw new Error('Missing VITE_FIREBASE_PROJECT_ID/VITE_AI_API_BASE_URL in app/.env')
    }
    if (!primaryUser) {
      throw new Error('Expected shared authenticated user to be available')
    }

    const boardId = `pw-ai-burst-${Date.now()}`
    const userTokens = Array.from({ length: 5 }, () => primaryUser.idToken)

    const commandIds = userTokens.map((_, index) => `cmd-burst-${Date.now()}-${index + 1}`)
    const responses = await Promise.all(
      userTokens.map((idToken, index) =>
        postAiCommand(config.aiCommandUrl, idToken, {
          boardId,
          command: `add green sticky note saying burst-${index + 1}`,
          clientCommandId: commandIds[index],
          userDisplayName: `QA Burst User ${index + 1}`,
        }),
      ),
    )

    for (const response of responses) {
      expect(response.error || '').toBe('')
      if (response.status) {
        expect(['success', 'queued', 'running']).toContain(response.status)
      }
    }

    await expect
      .poll(async () => {
        const docs = await listAiCommandDocs(config, boardId, primaryUser.idToken)
        const statusById = new Map(docs.map((doc) => [getDocumentId(doc), doc.fields?.status?.stringValue || 'unknown']))
        return commandIds.filter((id) => statusById.get(id) === 'success').length
      })
      .toBe(commandIds.length)
  })
})
