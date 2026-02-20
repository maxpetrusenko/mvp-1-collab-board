import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'

const CURSOR_SYNC_SLA = { target: 50, critical: 100 }
const PRESENCE_SLA = { target: 600, critical: 2_500 }
const POLL_INTERVAL_MS = 20
const POLL_TIMEOUT_MS = 8_000
const LATENCY_SAMPLES = 4
const ANON_CREATE_MAX_ATTEMPTS = 8
const ARTIFACT_PATH = path.resolve(process.cwd(), '../submission/test-artifacts/latest-backend-performance.json')
const runtimeSummary = {
  generatedAt: new Date().toISOString(),
  boardId: null,
  authSource: null,
  tests: {},
}

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
        if (splitIndex < 1) return null
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

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(env[key] || '').trim()
    if (value) return value
  }
  return ''
}

const resolveAliasValue = (keyPrefix, index) =>
  readEnv(`${keyPrefix}_${index}`, `${keyPrefix}${index}`)

const decodeUidFromToken = (idToken) => {
  const payloadPart = String(idToken || '').split('.')[1]
  if (!payloadPart) {
    throw new Error('Invalid idToken payload')
  }
  const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  const uid = String(payload.user_id || payload.sub || payload.uid || '')
  if (!uid) {
    throw new Error('Failed to decode uid from idToken')
  }
  return uid
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const signInWithPassword = async ({ apiKey, email, password }) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.idToken) {
    const message = payload?.error?.message || `HTTP_${response.status}`
    throw new Error(`signInWithPassword failed for ${email}: ${message}`)
  }
  return {
    email,
    idToken: payload.idToken,
    uid: decodeUidFromToken(payload.idToken),
    ephemeral: false,
  }
}

const createAnonymousUser = async ({ apiKey, label }) => {
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= ANON_CREATE_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok && payload.idToken) {
      const uid = decodeUidFromToken(payload.idToken)
      return {
        email: `anon-${label}@example.com`,
        idToken: payload.idToken,
        uid,
        ephemeral: true,
      }
    }
    lastError = payload?.error?.message || `HTTP_${response.status}`
    const retryable = lastError === 'TOO_MANY_ATTEMPTS_TRY_LATER' || response.status === 429
    if (!retryable || attempt === ANON_CREATE_MAX_ATTEMPTS) break
    const backoffMs = Math.min(20_000, 900 * 2 ** (attempt - 1))
    await sleep(backoffMs)
  }
  throw new Error(`createAnonymousUser failed (${label}): ${lastError}`)
}

const deleteUser = async ({ apiKey, idToken }) => {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

const resolveDatabaseUrl = (projectId) => {
  const configured = readEnv('VITE_FIREBASE_DATABASE_URL')
  if (configured) {
    return configured.replace(/\/$/, '')
  }
  return `https://${projectId}-default-rtdb.firebaseio.com`
}

const fetchCursorPresence = async ({ databaseUrl, boardId, userId, idToken }) => {
  const endpoint =
    `${databaseUrl}/presence/${encodeURIComponent(boardId)}/${encodeURIComponent(userId)}.json` +
    `?auth=${encodeURIComponent(idToken)}`
  const response = await fetch(endpoint, { method: 'GET' })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`fetchCursorPresence failed (${response.status}): ${body.slice(0, 160)}`)
  }
  const payload = await response.json().catch(() => null)
  return payload && typeof payload === 'object' ? payload : null
}

const writeCursorPresence = async ({ databaseUrl, boardId, userId, idToken, displayName, x, y, connectionId }) => {
  const endpoint =
    `${databaseUrl}/presence/${encodeURIComponent(boardId)}/${encodeURIComponent(userId)}.json` +
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
    throw new Error(`writeCursorPresence failed (${response.status}): ${body.slice(0, 160)}`)
  }
}

const fetchBoardPresenceMap = async ({ databaseUrl, boardId, idToken }) => {
  const endpoint = `${databaseUrl}/presence/${encodeURIComponent(boardId)}.json?auth=${encodeURIComponent(idToken)}`
  const response = await fetch(endpoint, { method: 'GET' })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`fetchBoardPresenceMap failed (${response.status}): ${body.slice(0, 160)}`)
  }
  const payload = await response.json().catch(() => null)
  return payload && typeof payload === 'object' ? payload : {}
}

const waitForPresenceMatch = async ({ databaseUrl, boardId, userId, readerToken, expectedX, expectedY }) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const presence = await fetchCursorPresence({
      databaseUrl,
      boardId,
      userId,
      idToken: readerToken,
    })
    if (presence && presence.x === expectedX && presence.y === expectedY) {
      return Date.now() - startedAt
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Presence propagation timeout after ${POLL_TIMEOUT_MS}ms`)
}

const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

const resolveUsers = async ({ apiKey }) => {
  const userAToken = readEnv('TEST_USER_A_TOKEN')
  const userBToken = readEnv('TEST_USER_B_TOKEN')
  if (userAToken && userBToken) {
    return {
      users: [
        {
          email: 'token-user-a',
          idToken: userAToken,
          uid: readEnv('TEST_USER_A_UID') || decodeUidFromToken(userAToken),
          ephemeral: false,
        },
        {
          email: 'token-user-b',
          idToken: userBToken,
          uid: readEnv('TEST_USER_B_UID') || decodeUidFromToken(userBToken),
          ephemeral: false,
        },
      ],
      source: 'tokens',
    }
  }

  const namedResolved = await resolveNamedUsers({ apiKey, desiredCount: 2 })
  if (namedResolved.users.length >= 2) {
    return { users: namedResolved.users.slice(0, 2), source: namedResolved.source }
  }

  if (readEnv('BACKEND_PERF_ALLOW_ANON') === '1') {
    const [userA, userB] = await Promise.all([
      createAnonymousUser({ apiKey, label: 'a' }),
      createAnonymousUser({ apiKey, label: 'b' }),
    ])
    return { users: [userA, userB], source: 'anonymous' }
  }

  throw new Error(
    'Missing backend perf auth config. Set TEST_USER_A..E credentials/tokens or EMAIL1..EMAIL5 + PW. Optionally set BACKEND_PERF_ALLOW_ANON=1.',
  )
}

const loadCredentialFilePairs = () => {
  const credentialPath = path.resolve(process.cwd(), 'test-users-credentials.txt')
  if (!existsSync(credentialPath)) {
    return []
  }

  const seen = new Set()
  const pairs = []
  const lines = readFileSync(credentialPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('index,')) {
      continue
    }
    const columns = trimmed.split(',')
    const email = String(columns[1] || '').trim()
    const password = String(columns[2] || '').trim()
    if (!email || !password || seen.has(email)) {
      continue
    }
    seen.add(email)
    pairs.push({ email, password })
  }
  return pairs
}

const resolveNamedUsers = async ({ apiKey, desiredCount = 5 }) => {
  const users = []
  const seenEmails = new Set()
  const sourceParts = []

  const tokenUsers = []
  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    const token = readEnv(`TEST_USER_${key}_TOKEN`)
    if (!token) {
      continue
    }
    tokenUsers.push({
      email: `token-user-${key.toLowerCase()}`,
      idToken: token,
      uid: readEnv(`TEST_USER_${key}_UID`) || decodeUidFromToken(token),
      ephemeral: false,
    })
  }
  if (tokenUsers.length > 0) {
    users.push(...tokenUsers)
    sourceParts.push(`tokens:${tokenUsers.length}`)
  }

  const signInFromPairs = async (pairs, sourceLabel) => {
    if (users.length >= desiredCount || pairs.length === 0) {
      return
    }
    let successes = 0
    let failures = 0
    for (const pair of pairs) {
      if (users.length >= desiredCount) {
        break
      }
      if (seenEmails.has(pair.email)) {
        continue
      }
      seenEmails.add(pair.email)
      try {
        users.push(await signInWithPassword({ apiKey, ...pair }))
        successes += 1
      } catch {
        failures += 1
      }
      await sleep(200)
    }
    sourceParts.push(`${sourceLabel}:${successes}-ok/${failures}-failed`)
  }

  const explicitCredentialPairs = []
  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    const email = readEnv(`TEST_USER_${key}_EMAIL`)
    const password = readEnv(`TEST_USER_${key}_PASSWORD`, 'TEST_USER_PASSWORD')
    if (!email || !password) {
      continue
    }
    explicitCredentialPairs.push({ email, password })
  }
  await signInFromPairs(explicitCredentialPairs, 'named-email-password')

  const sharedPassword = readEnv('PW', 'E2E_PASSWORD', 'QA_PASSWORD')
  const envSlotPairs = [1, 2, 3, 4, 5]
    .map((index) => resolveAliasValue('EMAIL', index))
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
    .map((email) => ({ email, password: sharedPassword }))
    .filter((pair) => Boolean(pair.password))
  await signInFromPairs(envSlotPairs, 'env-email-slot+shared-password')

  const filePairs = loadCredentialFilePairs()
  await signInFromPairs(filePairs, 'credential-file')

  return { users, source: sourceParts.length > 0 ? sourceParts.join('+') : 'none' }
}

const ensureUserCount = async ({ apiKey, users, source, count }) => {
  const deduped = []
  const seen = new Set()
  for (const user of users) {
    if (!user?.uid || seen.has(user.uid)) {
      continue
    }
    seen.add(user.uid)
    deduped.push(user)
  }

  if (deduped.length >= count) {
    return { users: deduped.slice(0, count), source }
  }

  if (readEnv('BACKEND_PERF_ALLOW_ANON') !== '1') {
    return { users: deduped, source }
  }

  const needed = count - deduped.length
  for (let index = 0; index < needed; index += 1) {
    try {
      const anonUser = await createAnonymousUser({ apiKey, label: `fill-${index}-${Date.now()}` })
      if (!seen.has(anonUser.uid)) {
        seen.add(anonUser.uid)
        deduped.push(anonUser)
      }
    } catch {
      break
    }
  }

  return { users: deduped, source: deduped.length > users.length ? `${source}+anon-fill` : source }
}

const waitForPresenceCount = async ({ databaseUrl, boardId, idToken, expectedCount }) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const presenceMap = await fetchBoardPresenceMap({
      databaseUrl,
      boardId,
      idToken,
    })
    const connectedCount = Object.keys(presenceMap || {}).length
    if (connectedCount >= expectedCount) {
      return Date.now() - startedAt
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Presence count did not reach ${expectedCount} within ${POLL_TIMEOUT_MS}ms`)
}

test('Backend perf: cursor sync latency (RTDB only, no Playwright)', async (t) => {
  const apiKey = readEnv('VITE_FIREBASE_API_KEY')
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID')
  if (!apiKey || !projectId) {
    runtimeSummary.tests.cursorSync = {
      status: 'skipped',
      reason: 'missing Firebase API key/project id',
    }
    t.skip('Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in app/.env')
    return
  }

  let users = []
  let source = 'unknown'
  try {
    const resolved = await resolveUsers({ apiKey })
    users = resolved.users
    source = resolved.source
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    runtimeSummary.tests.cursorSync = {
      status: 'skipped',
      reason,
    }
    t.skip(reason)
    return
  }

  const databaseUrl = resolveDatabaseUrl(projectId)
  const boardId = `backend-perf-${Date.now()}`
  runtimeSummary.boardId = boardId

  try {
    const [userA, userB] = users
    const latencies = []

    for (let i = 0; i < LATENCY_SAMPLES; i += 1) {
      const x1 = 120 + i * 17
      const y1 = 180 + i * 13
      await writeCursorPresence({
        databaseUrl,
        boardId,
        userId: userA.uid,
        idToken: userA.idToken,
        displayName: userA.email,
        x: x1,
        y: y1,
        connectionId: `backend-a-${i}`,
      })
      latencies.push(
        await waitForPresenceMatch({
          databaseUrl,
          boardId,
          userId: userA.uid,
          readerToken: userB.idToken,
          expectedX: x1,
          expectedY: y1,
        }),
      )

      const x2 = 240 + i * 19
      const y2 = 140 + i * 11
      await writeCursorPresence({
        databaseUrl,
        boardId,
        userId: userB.uid,
        idToken: userB.idToken,
        displayName: userB.email,
        x: x2,
        y: y2,
        connectionId: `backend-b-${i}`,
      })
      latencies.push(
        await waitForPresenceMatch({
          databaseUrl,
          boardId,
          userId: userB.uid,
          readerToken: userA.idToken,
          expectedX: x2,
          expectedY: y2,
        }),
      )
    }

    const avgMs = average(latencies)
    const maxMs = Math.max(...latencies)
    const score = Math.max(
      1,
      Math.min(
        10,
        Number((10 * Math.min(1, CURSOR_SYNC_SLA.target / Math.max(avgMs, 1)) * Math.min(1, CURSOR_SYNC_SLA.critical / Math.max(maxMs, 1))).toFixed(1)),
      ),
    )

    const presenceMap = await fetchBoardPresenceMap({
      databaseUrl,
      boardId,
      idToken: userA.idToken,
    })
    const visibleUsers = [userA.uid, userB.uid].filter((uid) => Boolean(presenceMap[uid])).length

    console.log(
      JSON.stringify(
        {
          source,
          boardId,
          cursorLatencyMs: {
            samples: latencies,
            avg: Number(avgMs.toFixed(2)),
            max: maxMs,
            target: CURSOR_SYNC_SLA.target,
            critical: CURSOR_SYNC_SLA.critical,
          },
          presence: {
            visibleUsers,
            expected: 2,
            targetMs: PRESENCE_SLA.target,
            criticalMs: PRESENCE_SLA.critical,
          },
          score,
        },
        null,
        2,
      ),
    )

    runtimeSummary.authSource = source
    runtimeSummary.tests.cursorSync = {
      status: 'measured',
      sampleCount: latencies.length,
      avgMs: Number(avgMs.toFixed(2)),
      maxMs,
      targetMs: CURSOR_SYNC_SLA.target,
      criticalMs: CURSOR_SYNC_SLA.critical,
      targetMet: avgMs <= CURSOR_SYNC_SLA.target && maxMs <= CURSOR_SYNC_SLA.critical,
      score,
    }

    const requireTargets = readEnv('BACKEND_PERF_REQUIRE_TARGETS') === '1'
    if (requireTargets) {
      assert.ok(avgMs <= CURSOR_SYNC_SLA.target, `Cursor average ${avgMs.toFixed(2)}ms exceeds target ${CURSOR_SYNC_SLA.target}ms`)
      assert.ok(maxMs <= CURSOR_SYNC_SLA.critical, `Cursor max ${maxMs}ms exceeds critical ${CURSOR_SYNC_SLA.critical}ms`)
    }

    assert.ok(latencies.length > 0, 'Expected at least one latency sample')
    assert.ok(maxMs <= PRESENCE_SLA.critical, `Presence propagation max ${maxMs}ms exceeds ${PRESENCE_SLA.critical}ms`)
    assert.equal(visibleUsers, 2, 'Expected both users to be visible in presence map')
  } finally {
    for (const user of users) {
      if (!user?.ephemeral) continue
      await deleteUser({ apiKey, idToken: user.idToken }).catch(() => undefined)
    }
  }
})

test('Backend perf: five-user presence propagation (RTDB only, no Playwright)', async (t) => {
  const apiKey = readEnv('VITE_FIREBASE_API_KEY')
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID')
  if (!apiKey || !projectId) {
    t.skip('Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in app/.env')
    runtimeSummary.tests.presence5Users = {
      status: 'skipped',
      reason: 'missing Firebase API key/project id',
    }
    return
  }

  const namedResolved = await resolveNamedUsers({ apiKey, desiredCount: 5 })
  const ensured = await ensureUserCount({
    apiKey,
    users: namedResolved.users,
    source: namedResolved.source,
    count: 5,
  })
  if (ensured.users.length < 5) {
    t.skip(
      `Need 5 distinct users; resolved ${ensured.users.length}. Set TEST_USER_A..E creds/tokens or BACKEND_PERF_ALLOW_ANON=1.`,
    )
    runtimeSummary.tests.presence5Users = {
      status: 'skipped',
      reason: `resolved ${ensured.users.length} distinct users`,
      source: ensured.source,
    }
    return
  }

  const users = ensured.users
  const databaseUrl = resolveDatabaseUrl(projectId)
  const boardId = runtimeSummary.boardId || `backend-perf-presence5-${Date.now()}`

  try {
    const startedAt = Date.now()
    await Promise.all(
      users.map((user, index) =>
        writeCursorPresence({
          databaseUrl,
          boardId,
          userId: user.uid,
          idToken: user.idToken,
          displayName: user.email,
          x: 100 + index * 30,
          y: 100 + index * 20,
          connectionId: `backend-presence5-${index}`,
        }),
      ),
    )

    const propagationMs = await waitForPresenceCount({
      databaseUrl,
      boardId,
      idToken: users[0].idToken,
      expectedCount: 5,
    })
    const elapsedMs = Date.now() - startedAt

    console.log(
      JSON.stringify(
        {
          boardId,
          source: ensured.source,
          presence5Users: {
            propagationMs,
            elapsedMs,
            target: PRESENCE_SLA.target,
            critical: PRESENCE_SLA.critical,
          },
        },
        null,
        2,
      ),
    )

    runtimeSummary.tests.presence5Users = {
      status: 'measured',
      source: ensured.source,
      users: users.length,
      propagationMs,
      elapsedMs,
      targetMs: PRESENCE_SLA.target,
      criticalMs: PRESENCE_SLA.critical,
      targetMet: propagationMs <= PRESENCE_SLA.target && elapsedMs <= PRESENCE_SLA.critical,
    }
    const requireTargets = readEnv('BACKEND_PERF_REQUIRE_TARGETS') === '1'
    if (requireTargets) {
      assert.ok(propagationMs <= PRESENCE_SLA.target, `5-user propagation ${propagationMs}ms exceeds target ${PRESENCE_SLA.target}ms`)
      assert.ok(elapsedMs <= PRESENCE_SLA.critical, `5-user elapsed ${elapsedMs}ms exceeds critical ${PRESENCE_SLA.critical}ms`)
    }
    assert.ok(propagationMs <= PRESENCE_SLA.critical, `5-user presence propagation ${propagationMs}ms exceeds ${PRESENCE_SLA.critical}ms`)
    assert.ok(elapsedMs <= PRESENCE_SLA.critical, `5-user presence elapsed ${elapsedMs}ms exceeds ${PRESENCE_SLA.critical}ms`)
  } finally {
    for (const user of users) {
      if (!user?.ephemeral) continue
      await deleteUser({ apiKey, idToken: user.idToken }).catch(() => undefined)
    }
  }
})

process.on('exit', () => {
  try {
    mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true })
    writeFileSync(
      ARTIFACT_PATH,
      `${JSON.stringify(
        {
          ...runtimeSummary,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  } catch {
    // Best-effort artifact generation: avoid masking test outcomes.
  }
})
