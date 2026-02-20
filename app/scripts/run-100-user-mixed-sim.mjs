#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_TOTAL_USERS = 100
const DEFAULT_STICKIES_PER_USER = 1
const DEFAULT_CONFLICT_OBJECTS = 24
const DEFAULT_CONFLICT_WRITERS = 4
const DEFAULT_USER_CREATE_CONCURRENCY = 4
const DEFAULT_SHARE_CONCURRENCY = 12
const DEFAULT_PRESENCE_CONCURRENCY = 20
const DEFAULT_CREATE_CONCURRENCY = 24
const DEFAULT_CONFLICT_CONCURRENCY = 28
const DEFAULT_AI_CONCURRENCY = 2
const DEFAULT_AI_RETRIES = 2
const DEFAULT_CONFLICT_SETTLE_MS = 1_500
const DEFAULT_ALLOW_VIRTUAL_USERS = 1
const DEFAULT_REAL_AUTH_USERS = 1
const DEFAULT_USER_CREATE_MAX_ATTEMPTS = 20

const parseEnvFile = (filePath) => {
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
        return [key, value]
      })
      .filter((entry) => entry !== null),
  )
}

const envPath = path.resolve(process.cwd(), '.env')
const fileEnv = parseEnvFile(envPath)
const env = {
  ...fileEnv,
  ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
}

const readRequired = (key) => {
  const value = String(env[key] || '').trim()
  if (!value) {
    throw new Error(`Missing ${key} in app/.env or process environment`)
  }
  return value
}

const readInt = (key, fallback) => {
  const raw = String(env[key] || '').trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const toFirestoreEncodedValue = (value) => {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }
  if (typeof value === 'string') {
    return { stringValue: value }
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) }
    }
    return { doubleValue: value }
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreEncodedValue(item)) } }
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nested]) => [key, toFirestoreEncodedValue(nested)]),
        ),
      },
    }
  }
  return { stringValue: String(value) }
}

const toFirestoreFields = (value) =>
  Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toFirestoreEncodedValue(nested)]))

const decodeUserIdFromIdToken = (idToken) => {
  const payloadPart = idToken.split('.')[1]
  if (!payloadPart) {
    throw new Error('Invalid Firebase ID token payload')
  }
  const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  const userId = String(payload.user_id || payload.sub || payload.uid || '')
  if (!userId) {
    throw new Error('Failed to resolve uid from Firebase ID token')
  }
  return userId
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const mapWithConcurrency = async (items, concurrency, worker) => {
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency))
  const results = new Array(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(normalizedConcurrency, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) {
        return
      }
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  })

  await Promise.all(runners)
  return results
}

const loadReusableCredentialFile = () => {
  const configuredPath = String(env.SIM_REUSABLE_USERS_FILE || 'test-users-credentials.txt').trim()
  if (!configuredPath) {
    return []
  }

  const resolvedPath = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath)
  if (!existsSync(resolvedPath)) {
    return []
  }

  const lines = readFileSync(resolvedPath, 'utf8').split(/\r?\n/)
  /** @type {Array<{email: string, password: string}>} */
  const credentials = []
  lines.forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('index,')) {
      return
    }

    const [index, email, password, _uid, status] = line.split(',')
    if (!index || !email || !password) {
      return
    }
    const normalizedStatus = String(status || '').trim().toLowerCase()
    if (normalizedStatus && normalizedStatus !== 'created' && normalizedStatus !== 'exists') {
      return
    }

    credentials.push({
      email: String(email).trim(),
      password: String(password).trim(),
    })
  })

  return credentials
}

const getReusableCredentialPool = () => {
  const emailCandidates = [
    env.E2E_EMAIL,
    env.QA_EMAIL,
    env.EMAIL,
    env.EMAIL1,
    env.EMAIL2,
    env.EMAIL3,
    env.EMAIL4,
    env.EMAIL5,
    env.EMAIL6,
    env.EMAIL7,
    env.EMAIL8,
    env.EMAIL9,
    env.EMAIL10,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const password = [env.E2E_PASSWORD, env.QA_PASSWORD, env.PW]
    .map((value) => String(value || '').trim())
    .find(Boolean)

  if (!emailCandidates.length || !password) {
    const fromFileOnly = loadReusableCredentialFile()
    return [...new Map(fromFileOnly.map((credential) => [credential.email.toLowerCase(), credential])).values()]
  }

  const fromFile = loadReusableCredentialFile()
  const fromEnv = [...new Set(emailCandidates)].map((email) => ({ email, password }))
  const merged = [...fromFile, ...fromEnv]
  return [...new Map(merged.map((credential) => [credential.email.toLowerCase(), credential])).values()]
}

const signInWithEmailPassword = async (firebaseApiKey, email, password) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.idToken) {
    return { ok: false, error: payload?.error?.message || `HTTP_${response.status}` }
  }
  return {
    ok: true,
    email,
    password,
    idToken: payload.idToken,
    uid: decodeUserIdFromIdToken(payload.idToken),
    ephemeral: false,
    virtual: false,
  }
}

const loadReusableUsers = async (firebaseApiKey) => {
  const credentials = getReusableCredentialPool()
  if (!credentials.length) {
    return []
  }

  const signedUsers = await mapWithConcurrency(credentials, 2, async (credential) =>
    signInWithEmailPassword(firebaseApiKey, credential.email, credential.password),
  )
  return signedUsers.filter((candidate) => candidate?.ok)
}

const createTempUser = async (firebaseApiKey, label, maxAttempts = DEFAULT_USER_CREATE_MAX_ATTEMPTS) => {
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}-${label}`
    const email = `qa.load.${suffix}@example.com`
    const password = `QATest!${suffix}Aa1`
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok && payload.idToken) {
      return {
        ok: true,
        email,
        password,
        idToken: payload.idToken,
        uid: decodeUserIdFromIdToken(payload.idToken),
        ephemeral: true,
        virtual: false,
      }
    }

    lastError = payload?.error?.message || `HTTP_${response.status}`
    const shouldRetry = lastError === 'TOO_MANY_ATTEMPTS_TRY_LATER' || response.status === 429
    if (!shouldRetry) {
      break
    }
    // Fallback to anonymous user when email/password signup is rate limited.
    const anonResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    })
    const anonPayload = await anonResponse.json().catch(() => ({}))
    if (anonResponse.ok && anonPayload.idToken) {
      const uid = decodeUserIdFromIdToken(anonPayload.idToken)
      return {
        ok: true,
        email: `anon.${uid.slice(0, 12)}@example.com`,
        password: '',
        idToken: anonPayload.idToken,
        uid,
        ephemeral: true,
        virtual: false,
      }
    }

    const anonError = anonPayload?.error?.message || `HTTP_${anonResponse.status}`
    lastError = `${lastError}; anon: ${anonError}`
    if (attempt >= maxAttempts) {
      break
    }

    const backoffMs = Math.min(45_000, 1_200 * 2 ** Math.min(attempt - 1, 5)) + Math.floor(Math.random() * 600)
    await sleep(backoffMs)
  }

  return { ok: false, error: `Failed to create temp user (${label}): ${lastError}` }
}

const deleteTempUser = async (firebaseApiKey, idToken) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  return { ok: response.ok, status: response.status }
}

const ensureBoardMeta = async ({ firebaseProjectId, boardId, ownerId, ownerToken }) => {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards` +
    `?documentId=${encodeURIComponent(boardId)}`
  const now = Date.now()

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      fields: toFirestoreFields({
        id: boardId,
        name: `Load board ${boardId.slice(-8)}`,
        description: '100-user mixed create/edit/AI simulation',
        ownerId,
        sharedWith: [],
        sharedRoles: {},
        createdBy: ownerId,
        updatedBy: ownerId,
        createdAt: now,
        updatedAt: now,
      }),
    }),
  })

  if (response.ok || response.status === 409) {
    return { ok: true }
  }
  const body = await response.text().catch(() => '')
  return {
    ok: false,
    error: `Failed creating board metadata (${response.status}): ${body.slice(0, 200)}`,
  }
}

const shareBoardWithUser = async ({ aiApiBaseUrl, ownerToken, boardId, collaboratorId }) => {
  const response = await fetch(`${aiApiBaseUrl}/api/boards/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      boardId,
      userId: collaboratorId,
      role: 'edit',
      action: 'share',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: body.slice(0, 200) }
  }

  return { ok: true, status: response.status }
}

const writePresence = async ({ databaseUrl, boardId, userId, idToken, displayName, x, y, connectionId }) => {
  const endpoint =
    `${databaseUrl.replace(/\/$/, '')}/presence/${encodeURIComponent(boardId)}/${encodeURIComponent(userId)}.json` +
    `?auth=${encodeURIComponent(idToken)}`
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boardId,
      userId,
      displayName,
      x,
      y,
      lastSeen: Date.now(),
      connectionId,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: body.slice(0, 200) }
  }
  return { ok: true, status: response.status }
}

const createSticky = async ({
  firebaseProjectId,
  boardId,
  idToken,
  userId,
  text,
  color,
  x,
  y,
  zIndex,
}) => {
  const objectId = `load-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/` +
    `${encodeURIComponent(boardId)}/objects?documentId=${encodeURIComponent(objectId)}`
  const now = Date.now()
  const body = {
    id: objectId,
    boardId,
    type: 'stickyNote',
    text,
    color,
    position: { x, y },
    size: { width: 180, height: 110 },
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
    zIndex,
    version: 1,
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields: toFirestoreFields(body) }),
  })

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: responseBody.slice(0, 200) }
  }

  return { ok: true, objectId, status: response.status }
}

const patchStickyConflict = async ({
  firebaseProjectId,
  boardId,
  objectId,
  idToken,
  userId,
  text,
  x,
  y,
}) => {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/` +
    `${encodeURIComponent(boardId)}/objects/${encodeURIComponent(objectId)}` +
    '?updateMask.fieldPaths=text&updateMask.fieldPaths=position.x&updateMask.fieldPaths=position.y&updateMask.fieldPaths=updatedAt&updateMask.fieldPaths=updatedBy'

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fields: {
        text: { stringValue: text.slice(0, 250) },
        position: {
          mapValue: {
            fields: {
              x: { integerValue: String(Math.trunc(x)) },
              y: { integerValue: String(Math.trunc(y)) },
            },
          },
        },
        updatedAt: { integerValue: String(Date.now()) },
        updatedBy: { stringValue: userId },
      },
    }),
  })

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: responseBody.slice(0, 200) }
  }

  return { ok: true, status: response.status }
}

const postAiCommand = async ({ aiApiBaseUrl, boardId, idToken, userDisplayName, clientCommandId, command }) => {
  const startedAt = Date.now()
  const response = await fetch(`${aiApiBaseUrl}/api/ai/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      boardId,
      command,
      clientCommandId,
      userDisplayName,
    }),
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  const elapsedMs = Date.now() - startedAt

  if (!response.ok || payload?.status !== 'success') {
    return {
      ok: false,
      elapsedMs,
      statusCode: response.status,
      status: payload?.status || 'error',
      error: payload?.error || payload?.message || `HTTP_${response.status}`,
    }
  }

  return {
    ok: true,
    elapsedMs,
    statusCode: response.status,
    status: payload.status,
    commandId: payload.commandId,
  }
}

const shouldRetryAiResult = (result) => {
  if (result?.ok) return false
  const statusCode = Number(result?.statusCode || 0)
  const error = String(result?.error || '').toLowerCase()
  if (statusCode === 429 || statusCode >= 500) {
    return true
  }
  return error.includes('timeout') || error.includes('rate') || error.includes('temporar')
}

const postAiCommandWithRetry = async ({
  aiApiBaseUrl,
  boardId,
  idToken,
  userDisplayName,
  command,
  commandKey,
  maxRetries,
}) => {
  const attempts = Math.max(1, maxRetries + 1)
  let lastResult = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const clientCommandId = `${commandKey}-try-${attempt}`
    const result = await postAiCommand({
      aiApiBaseUrl,
      boardId,
      idToken,
      userDisplayName,
      clientCommandId,
      command,
    })

    if (result.ok || attempt === attempts || !shouldRetryAiResult(result)) {
      return {
        ...result,
        attempts: attempt,
      }
    }

    lastResult = result
    const backoffMs = Math.min(6_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 220)
    await sleep(backoffMs)
  }

  return {
    ...(lastResult || { ok: false, error: 'AI command failed after retries' }),
    attempts,
  }
}

const fetchBoardObjects = async ({ firebaseProjectId, boardId, idToken }) => {
  const baseEndpoint =
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/` +
    `${encodeURIComponent(boardId)}/objects`
  /** @type {Array<{id: string, updatedBy: string, updatedAt: number}>} */
  const objects = []
  let pageToken = ''

  while (true) {
    const endpoint =
      `${baseEndpoint}?pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return { ok: false, error: `Failed to fetch board objects (${response.status}): ${body.slice(0, 200)}` }
    }

    const payload = await response.json().catch(() => ({}))
    const documents = Array.isArray(payload?.documents) ? payload.documents : []
    for (const doc of documents) {
      const fields = doc?.fields || {}
      const id = String(fields?.id?.stringValue || String(doc?.name || '').split('/').pop() || '')
      const updatedBy = String(fields?.updatedBy?.stringValue || '')
      const updatedAt = Number(fields?.updatedAt?.integerValue || fields?.updatedAt?.doubleValue || '0')
      objects.push({ id, updatedBy, updatedAt })
    }

    const nextToken = String(payload?.nextPageToken || '').trim()
    if (!nextToken) {
      break
    }
    pageToken = nextToken
  }

  return { ok: true, objects }
}

const percentile = (values, q) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)))
  return sorted[idx]
}

const pickAiCommand = (index) => {
  switch (index % 5) {
    case 0:
      return `add a yellow sticky note that says "sim-ai-${index + 1}"`
    case 1:
      return `create a blue rectangle at position ${160 + index * 7}, ${120 + index * 5}`
    case 2:
      return `add a frame called "Load Frame ${index + 1}"`
    case 3:
      return 'create a SWOT template'
    default:
      return "set up a retrospective board with What Went Well, What Didn't, and Action Items columns"
  }
}

const main = async () => {
  const firebaseApiKey = readRequired('VITE_FIREBASE_API_KEY')
  const firebaseProjectId = readRequired('VITE_FIREBASE_PROJECT_ID')
  const aiApiBaseUrl = readRequired('VITE_AI_API_BASE_URL').replace(/\/$/, '')
  const databaseUrl =
    String(env.VITE_FIREBASE_DATABASE_URL || '').trim().replace(/\/$/, '') ||
    `https://${firebaseProjectId}-default-rtdb.firebaseio.com`

  const totalUsers = Math.max(10, readInt('SIM_TOTAL_USERS', DEFAULT_TOTAL_USERS))
  const stickiesPerUser = Math.max(1, readInt('SIM_STICKIES_PER_USER', DEFAULT_STICKIES_PER_USER))
  const conflictObjectCount = Math.max(5, readInt('SIM_CONFLICT_OBJECTS', DEFAULT_CONFLICT_OBJECTS))
  const conflictWriters = Math.max(2, readInt('SIM_CONFLICT_WRITERS', DEFAULT_CONFLICT_WRITERS))
  const aiCommandUsers = Math.max(1, Math.min(totalUsers, readInt('SIM_AI_COMMAND_USERS', totalUsers)))
  const userCreateConcurrency = Math.max(1, readInt('SIM_USER_CREATE_CONCURRENCY', DEFAULT_USER_CREATE_CONCURRENCY))
  const shareConcurrency = Math.max(1, readInt('SIM_SHARE_CONCURRENCY', DEFAULT_SHARE_CONCURRENCY))
  const presenceConcurrency = Math.max(1, readInt('SIM_PRESENCE_CONCURRENCY', DEFAULT_PRESENCE_CONCURRENCY))
  const createConcurrency = Math.max(1, readInt('SIM_CREATE_CONCURRENCY', DEFAULT_CREATE_CONCURRENCY))
  const conflictConcurrency = Math.max(1, readInt('SIM_CONFLICT_CONCURRENCY', DEFAULT_CONFLICT_CONCURRENCY))
  const aiConcurrency = Math.max(1, readInt('SIM_AI_CONCURRENCY', DEFAULT_AI_CONCURRENCY))
  const aiRetries = Math.max(0, readInt('SIM_AI_RETRIES', DEFAULT_AI_RETRIES))
  const conflictSettleMs = Math.max(0, readInt('SIM_CONFLICT_SETTLE_MS', DEFAULT_CONFLICT_SETTLE_MS))
  const allowVirtualUsers = readInt('SIM_ALLOW_VIRTUAL_USERS', DEFAULT_ALLOW_VIRTUAL_USERS) !== 0
  const realAuthUsersTarget = Math.max(1, Math.min(totalUsers, readInt('SIM_REAL_AUTH_USERS', DEFAULT_REAL_AUTH_USERS)))
  const userCreateMaxAttempts = Math.max(1, readInt('SIM_USER_CREATE_MAX_ATTEMPTS', DEFAULT_USER_CREATE_MAX_ATTEMPTS))

  const boardId = `pw-load-100-ai-${Date.now()}`
  const startedAt = Date.now()

  console.log(`[sim] Starting mixed load simulation on board ${boardId}`)
  console.log(
    `[sim] users=${totalUsers}, stickiesPerUser=${stickiesPerUser}, conflictObjects=${conflictObjectCount}, conflictWriters=${conflictWriters}, aiUsers=${aiCommandUsers}, aiConcurrency=${aiConcurrency}, aiRetries=${aiRetries}`,
  )

  /** @type {Array<{ok: true, email: string, password: string, idToken: string, uid: string}>} */
  const users = []
  /** @type {Array<string>} */
  const fatalErrors = []
  /** @type {Array<string>} */
  const warnings = []

  const reusableUsers = await loadReusableUsers(firebaseApiKey)
  let owner = null

  if (reusableUsers.length > 0) {
    owner = reusableUsers.shift()
    users.push(owner)
    console.log(`[sim] Reused owner account: ${owner.email}`)
  } else {
    const ownerResult = await createTempUser(firebaseApiKey, 'owner', userCreateMaxAttempts)
    if (!ownerResult.ok) {
      throw new Error(ownerResult.error || 'Failed to create owner test user')
    }
    owner = ownerResult
    users.push(owner)
  }

  const reusableCollaborators = reusableUsers.slice(0, Math.max(0, totalUsers - 1))
  users.push(...reusableCollaborators)

  const collaboratorsToCreate = Array.from(
    { length: Math.max(0, realAuthUsersTarget - users.length) },
    (_, index) => index + 1,
  )
  const collaboratorResults = await mapWithConcurrency(collaboratorsToCreate, userCreateConcurrency, async (label) =>
    createTempUser(firebaseApiKey, `u${label}`, userCreateMaxAttempts),
  )
  collaboratorResults.forEach((result) => {
    if (result?.ok) {
      users.push(result)
    }
  })

  const usersCreated = users.length
  const usersFailed = totalUsers - usersCreated
  const virtualUsers = []
  const realAuthCoverageRate = totalUsers > 0 ? usersCreated / totalUsers : 1
  if (usersCreated < totalUsers && allowVirtualUsers) {
    const neededVirtual = totalUsers - usersCreated
    for (let index = 0; index < neededVirtual; index += 1) {
      virtualUsers.push({
        ok: true,
        email: `virtual-user-${index + 1}@example.com`,
        password: '',
        idToken: owner.idToken,
        uid: `virtual-${boardId}-${index + 1}`,
        ephemeral: false,
        virtual: true,
      })
    }
    warnings.push(`Filled ${neededVirtual} virtual users due Auth signup throttling`)
  } else if (usersCreated < totalUsers) {
    fatalErrors.push(`User creation shortfall: ${usersFailed} users failed to provision`)
  }
  if (realAuthCoverageRate < 0.9) {
    warnings.push(
      `Authenticated user coverage below target (${Math.round(realAuthCoverageRate * 100)}%). Score penalized for virtual-user fallback.`,
    )
  }
  console.log(`[sim] Created ${usersCreated}/${totalUsers} authenticated users (target real users: ${realAuthUsersTarget})`)
  if (virtualUsers.length) {
    console.log(`[sim] Added ${virtualUsers.length} virtual users to reach requested participant count`)
  }

  const boardMetaResult = await ensureBoardMeta({
    firebaseProjectId,
    boardId,
    ownerId: owner.uid,
    ownerToken: owner.idToken,
  })
  if (!boardMetaResult.ok) {
    throw new Error(boardMetaResult.error || 'Failed to create board metadata')
  }

  const collaborators = users.slice(1).filter((candidate) => !candidate.virtual)
  if (!collaborators.length) {
    warnings.push('Share reliability was not exercised with distinct authenticated collaborators.')
  }
  const shareResults = await mapWithConcurrency(collaborators, shareConcurrency, async (collaborator) =>
    shareBoardWithUser({
      aiApiBaseUrl,
      ownerToken: owner.idToken,
      boardId,
      collaboratorId: collaborator.uid,
    }),
  )
  const sharedSuccess = shareResults.filter((result) => result?.ok).length
  const sharedFailures = shareResults.length - sharedSuccess
  console.log(`[sim] Shared board with ${sharedSuccess}/${shareResults.length} collaborators`)

  const participants = [owner, ...collaborators.filter((_, index) => shareResults[index]?.ok), ...virtualUsers]
  const presenceResults = await mapWithConcurrency(participants, presenceConcurrency, async (participant, index) =>
    writePresence({
      databaseUrl,
      boardId,
      userId: participant.uid,
      idToken: participant.idToken,
      displayName: participant.email,
      x: 120 + (index % 12) * 45,
      y: 150 + Math.floor(index / 12) * 35,
      connectionId: `load-${index}`,
    }),
  )
  const presenceSuccess = presenceResults.filter((result) => result?.ok).length
  console.log(`[sim] Presence writes: ${presenceSuccess}/${participants.length}`)

  const createTasks = participants.flatMap((participant, participantIndex) =>
    Array.from({ length: stickiesPerUser }, (_, stickyIndex) => ({
      participant,
      participantIndex,
      stickyIndex,
    })),
  )
  const createResults = await mapWithConcurrency(createTasks, createConcurrency, async ({ participant, participantIndex, stickyIndex }) =>
    createSticky({
      firebaseProjectId,
      boardId,
      idToken: participant.idToken,
      userId: participant.uid,
      text: `user-${participantIndex + 1}-note-${stickyIndex + 1}`,
      color: '#fde68a',
      x: 80 + (participantIndex % 15) * 210 + stickyIndex * 18,
      y: 120 + Math.floor(participantIndex / 15) * 135 + stickyIndex * 16,
      zIndex: participantIndex * 10 + stickyIndex + 1,
    }),
  )
  const createSuccess = createResults.filter((result) => result?.ok).length
  const createdObjectIds = createResults.filter((result) => result?.ok).map((result) => result.objectId)
  console.log(`[sim] Sticky create operations: ${createSuccess}/${createResults.length}`)

  const usableConflictObjectCount = Math.min(conflictObjectCount, createdObjectIds.length)
  const conflictTargetIds = createdObjectIds.slice(0, usableConflictObjectCount)
  const conflictWritersByObject = new Map()
  if (!conflictTargetIds.length) {
    warnings.push('Conflict convergence coverage was not exercised because no conflict targets were created.')
  }

  const conflictTasks = conflictTargetIds.flatMap((objectId, objectIndex) => {
    const writers = Array.from({ length: conflictWriters }, (_, writerOffset) => {
      const userIndex = (objectIndex * conflictWriters + writerOffset) % participants.length
      return participants[userIndex]
    })
    conflictWritersByObject.set(
      objectId,
      new Set(writers.map((writer) => writer.uid)),
    )
    return writers.map((writer, writerIndex) => ({
      objectId,
      writer,
      writerIndex,
      objectIndex,
    }))
  })

  const conflictResults = await mapWithConcurrency(conflictTasks, conflictConcurrency, async ({ objectId, writer, writerIndex, objectIndex }) =>
    patchStickyConflict({
      firebaseProjectId,
      boardId,
      objectId,
      idToken: writer.idToken,
      userId: writer.uid,
      text: `conflict-o${objectIndex + 1}-w${writerIndex + 1}`,
      x: 900 + objectIndex * 13 + writerIndex * 4,
      y: 560 + objectIndex * 9 + writerIndex * 5,
    }),
  )
  const conflictSuccess = conflictResults.filter((result) => result?.ok).length
  console.log(`[sim] Conflict edit operations: ${conflictSuccess}/${conflictResults.length}`)

  const aiParticipants = participants.slice(0, aiCommandUsers)
  const aiResults = await mapWithConcurrency(aiParticipants, aiConcurrency, async (participant, index) =>
    postAiCommandWithRetry({
      aiApiBaseUrl,
      boardId,
      idToken: participant.idToken,
      userDisplayName: participant.email,
      command: pickAiCommand(index),
      commandKey: `sim-ai-${Date.now()}-${index + 1}-${Math.floor(Math.random() * 100_000)}`,
      maxRetries: aiRetries,
    }),
  )
  const aiSuccess = aiResults.filter((result) => result?.ok).length
  const aiFailures = aiResults.filter((result) => !result?.ok)
  const aiLatencies = aiResults.map((result) => Number(result?.elapsedMs || 0)).filter((value) => Number.isFinite(value) && value > 0)
  const aiP50Ms = percentile(aiLatencies, 0.5)
  const aiP95Ms = percentile(aiLatencies, 0.95)
  const aiAverageAttempts = aiResults.length
    ? aiResults.reduce((sum, result) => sum + Number(result?.attempts || 1), 0) / aiResults.length
    : 1
  const aiFailuresByStatus = {}
  const aiFailuresByError = {}
  aiFailures.forEach((failure) => {
    const statusCode = String(Number(failure?.statusCode || 0) || 'unknown')
    aiFailuresByStatus[statusCode] = (aiFailuresByStatus[statusCode] || 0) + 1
    const errorKey = String(failure?.error || failure?.status || 'unknown').slice(0, 120)
    aiFailuresByError[errorKey] = (aiFailuresByError[errorKey] || 0) + 1
  })
  console.log(`[sim] AI commands: ${aiSuccess}/${aiResults.length} succeeded (p50=${Math.round(aiP50Ms)}ms, p95=${Math.round(aiP95Ms)}ms)`)
  if (aiFailures.length) {
    console.log('[sim] AI failure status distribution:', JSON.stringify(aiFailuresByStatus))
    console.log('[sim] AI failure error distribution:', JSON.stringify(aiFailuresByError))
  }

  if (conflictSettleMs > 0) {
    await sleep(conflictSettleMs)
  }

  const fetchObjectsResult = await fetchBoardObjects({
    firebaseProjectId,
    boardId,
    idToken: owner.idToken,
  })
  let boardObjectCount = 0
  let conflictConvergence = 0
  if (fetchObjectsResult.ok) {
    boardObjectCount = fetchObjectsResult.objects.length
    const byObjectId = new Map(fetchObjectsResult.objects.map((object) => [object.id, object]))
    conflictConvergence = conflictTargetIds.filter((objectId) => {
      const object = byObjectId.get(objectId)
      if (!object) return false
      const allowedWriters = conflictWritersByObject.get(objectId)
      return Boolean(object.updatedBy && allowedWriters?.has(object.updatedBy))
    }).length
  } else {
    fatalErrors.push(fetchObjectsResult.error || 'Failed to fetch final board objects')
  }

  const shareRate = collaborators.length ? sharedSuccess / collaborators.length : 0
  const presenceRate = participants.length ? presenceSuccess / participants.length : 1
  const createRate = createResults.length ? createSuccess / createResults.length : 1
  const editRate = conflictResults.length ? conflictSuccess / conflictResults.length : 1
  const aiRate = aiResults.length ? aiSuccess / aiResults.length : 1
  const conflictConvergenceRate = conflictTargetIds.length ? conflictConvergence / conflictTargetIds.length : 0
  const virtualUserRate = totalUsers > 0 ? virtualUsers.length / totalUsers : 0

  const aiLatencyScore = clamp01(1 - Math.max(0, aiP95Ms - 2_000) / 8_000)
  const aiLatencyMultiplier = 0.4 + 0.6 * aiLatencyScore
  const fatalPenalty = Math.min(0.6, fatalErrors.length * 0.2)
  const virtualPenalty = Math.min(0.75, virtualUserRate * 0.9)
  const realAuthCoverageMultiplier = 0.2 + 0.8 * clamp01(realAuthCoverageRate)
  const reliabilityGate = Math.min(shareRate, presenceRate, createRate, editRate, aiRate, conflictConvergenceRate)
  const reliabilityMultiplier = 0.35 + 0.65 * reliabilityGate

  const weightedScore =
    10 *
    (0.14 * shareRate +
      0.12 * presenceRate +
      0.22 * createRate +
      0.22 * editRate +
      0.22 * aiRate +
      0.08 * conflictConvergenceRate)
  const scoreAfterPenalties =
    weightedScore *
    (1 - fatalPenalty) *
    aiLatencyMultiplier *
    reliabilityMultiplier *
    realAuthCoverageMultiplier *
    (1 - virtualPenalty)
  const finalScore = Math.max(1, Math.min(10, Number(scoreAfterPenalties.toFixed(1))))

  const durationMs = Date.now() - startedAt
  const summary = {
    boardId,
    totals: {
      requestedUsers: totalUsers,
      provisionedUsers: usersCreated,
      virtualUsers: virtualUsers.length,
      participantsOnBoard: participants.length,
      durationMs,
      finalBoardObjectCount: boardObjectCount,
    },
    operations: {
      boardShare: {
        attempted: collaborators.length,
        success: sharedSuccess,
        failure: sharedFailures,
        successRate: Number((shareRate * 100).toFixed(1)),
      },
      presencePublish: {
        attempted: participants.length,
        success: presenceSuccess,
        failure: participants.length - presenceSuccess,
        successRate: Number((presenceRate * 100).toFixed(1)),
      },
      stickyCreate: {
        attempted: createResults.length,
        success: createSuccess,
        failure: createResults.length - createSuccess,
        successRate: Number((createRate * 100).toFixed(1)),
      },
      conflictEdits: {
        attempted: conflictResults.length,
        success: conflictSuccess,
        failure: conflictResults.length - conflictSuccess,
        successRate: Number((editRate * 100).toFixed(1)),
        sameItemConvergence: {
          checkedObjects: conflictTargetIds.length,
          convergedObjects: conflictConvergence,
          convergenceRate: Number((conflictConvergenceRate * 100).toFixed(1)),
        },
      },
      aiCommands: {
        attempted: aiResults.length,
        success: aiSuccess,
        failure: aiResults.length - aiSuccess,
        successRate: Number((aiRate * 100).toFixed(1)),
        averageAttempts: Number(aiAverageAttempts.toFixed(2)),
        failureBreakdown: {
          byStatusCode: aiFailuresByStatus,
          byError: aiFailuresByError,
        },
        latencyMs: {
          p50: Math.round(aiP50Ms),
          p95: Math.round(aiP95Ms),
          avg: Math.round(aiLatencies.length ? aiLatencies.reduce((sum, value) => sum + value, 0) / aiLatencies.length : 0),
        },
      },
    },
    score: {
      value: finalScore,
      scale: '1-10',
      method:
        'Weighted reliability score across sharing/presence/create/edit/AI/conflict convergence with latency, reliability-gate, real-auth coverage, virtual-user, and fatal-error penalties.',
      breakdown: {
        weightedScore: Number(weightedScore.toFixed(2)),
        reliabilityGate: Number(reliabilityGate.toFixed(3)),
        reliabilityMultiplier: Number(reliabilityMultiplier.toFixed(3)),
        aiLatencyScore: Number(aiLatencyScore.toFixed(3)),
        aiLatencyMultiplier: Number(aiLatencyMultiplier.toFixed(3)),
        realAuthCoverageRate: Number(realAuthCoverageRate.toFixed(3)),
        realAuthCoverageMultiplier: Number(realAuthCoverageMultiplier.toFixed(3)),
        virtualUserRate: Number(virtualUserRate.toFixed(3)),
        virtualPenalty: Number(virtualPenalty.toFixed(3)),
        fatalPenalty: Number(fatalPenalty.toFixed(3)),
      },
    },
    warnings,
    fatalErrors,
  }

  console.log('[sim] Summary:')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`[sim] FINAL SCORE: ${finalScore}/10`)

  const ephemeralUsers = users.filter((user) => user.ephemeral)
  const cleanupResults = await mapWithConcurrency(ephemeralUsers, 24, async (user) => deleteTempUser(firebaseApiKey, user.idToken))
  const cleanupSuccess = cleanupResults.filter((result) => result?.ok).length
  console.log(`[sim] Cleanup ephemeral users: ${cleanupSuccess}/${ephemeralUsers.length}`)
}

main().catch((error) => {
  console.error('[sim] Fatal error:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
