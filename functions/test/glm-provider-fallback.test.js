/* eslint-disable no-console */
const assert = require('node:assert/strict')
const test = require('node:test')

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_ABORT_TIMEOUT = AbortSignal.timeout

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
}

const loadFreshClient = () => {
  delete require.cache[require.resolve('../src/glm-client')]
  delete require.cache[require.resolve('../src/jwt-generator')]
  return require('../src/glm-client')
}

test.afterEach(() => {
  restoreEnv()
  global.fetch = ORIGINAL_FETCH
  AbortSignal.timeout = ORIGINAL_ABORT_TIMEOUT
})

test('buildProviderList includes configured fallback providers in deterministic order', () => {
  process.env.Z_AI_GLM_API_KEY = 'id.secret'
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'

  const client = loadFreshClient()
  const providers = client.buildProviderList()
  assert.deepEqual(providers.map((provider) => provider.id), ['zai-glm', 'minimax', 'deepseek'])
})

test('buildProviderList honors AI_PROVIDER_PRIORITY override', () => {
  process.env.Z_AI_GLM_API_KEY = 'id.secret'
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_PRIORITY = 'deepseek,zai-glm,minimax'

  const client = loadFreshClient()
  const providers = client.buildProviderList()
  assert.deepEqual(providers.map((provider) => provider.id), ['deepseek', 'zai-glm', 'minimax'])
})

test('callGLM falls back to deepseek when minimax provider fails', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  const requestedUrls = []
  global.fetch = async (url, request) => {
    requestedUrls.push(String(url))
    const requestBody = JSON.parse(String(request.body))
    assert.ok(requestBody.tools, 'Tool schema must be passed to providers')

    if (String(url).includes('minimax.io')) {
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'overloaded' } }),
      }
    }

    assert.match(String(url), /api\.deepseek\.com\/chat\/completions/)
    assert.equal(request.headers.Authorization, 'Bearer deepseek-key')
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'tc-1',
                    function: {
                      name: 'createStickyNote',
                      arguments: JSON.stringify({ text: 'fallback note' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
    }
  }

  const client = loadFreshClient()
  const response = await client.callGLM('add fallback note', { state: [], boardId: 'board-1' })
  assert.equal(response.provider, 'deepseek')
  assert.equal(requestedUrls.length, 2)
  assert.match(requestedUrls[0], /api\.minimax\.io\/v1\/chat\/completions/)
  assert.match(requestedUrls[1], /api\.deepseek\.com\/chat\/completions/)
})

test('parseToolCalls accepts object and string argument payloads', () => {
  const client = loadFreshClient()
  const parsed = client.parseToolCalls({
    choices: [
      {
        message: {
          tool_calls: [
            {
              id: 'tool-1',
              function: {
                name: 'moveObject',
                arguments: { objectId: 'a', x: 10, y: 20 },
              },
            },
            {
              id: 'tool-2',
              function: {
                name: 'changeColor',
                arguments: '{"objectId":"a","color":"green"}',
              },
            },
          ],
        },
      },
    ],
  })

  assert.equal(parsed.length, 2)
  assert.deepEqual(parsed[0].arguments, { objectId: 'a', x: 10, y: 20 })
  assert.deepEqual(parsed[1].arguments, { objectId: 'a', color: 'green' })
})

test('callGLM applies timeout override when latency budget control is provided', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  process.env.MINIMAX_API_KEY = 'minimax-key'
  delete process.env.DEEPSEEK_API_KEY
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let capturedTimeoutMs = null
  AbortSignal.timeout = (ms) => {
    capturedTimeoutMs = ms
    return ORIGINAL_ABORT_TIMEOUT(ms)
  }

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              tool_calls: [],
              content: 'ok',
            },
          },
        ],
      }),
  })

  const client = loadFreshClient()
  await client.callGLM('add sticky', { state: [], boardId: 'board-1' }, { timeoutMs: 1_250 })
  assert.equal(capturedTimeoutMs, 1_250)
})

test('callGLM applies maxTokens override when response budget control is provided', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  delete process.env.MINIMAX_API_KEY
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let capturedMaxTokens = null
  global.fetch = async (_url, request) => {
    const requestBody = JSON.parse(String(request.body))
    capturedMaxTokens = requestBody.max_tokens
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM('create sticky', { state: [], boardId: 'board-1' }, { maxTokens: 333 })
  assert.equal(capturedMaxTokens, 333)
})

test('callGLM uses grid-focused toolset and required tool choice for repetitive create prompts', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  delete process.env.MINIMAX_API_KEY
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let requestedToolNames = []
  let requestedToolChoice = null
  global.fetch = async (_url, request) => {
    const requestBody = JSON.parse(String(request.body))
    requestedToolNames = (requestBody.tools || []).map((tool) => tool?.function?.name).filter(Boolean)
    requestedToolChoice = requestBody.tool_choice
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM('create 6 boxes with message -', { state: [], boardId: 'board-1' })

  assert.ok(requestedToolNames.includes('executeBatch'))
  assert.ok(requestedToolNames.includes('createStickyGridTemplate'))
  assert.equal(requestedToolNames.includes('createShape'), false)
  assert.equal(requestedToolNames.includes('deleteObject'), false)
  assert.equal(requestedToolChoice, 'required')
})

test('callGLM uses structured artifact toolset for business model canvas prompts', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  delete process.env.MINIMAX_API_KEY
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let requestedToolNames = []
  let requestedToolChoice = null
  global.fetch = async (_url, request) => {
    const requestBody = JSON.parse(String(request.body))
    requestedToolNames = (requestBody.tools || []).map((tool) => tool?.function?.name).filter(Boolean)
    requestedToolChoice = requestBody.tool_choice
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM(
    'Generate a Business Model Canvas for ai chat bot, including example channels and revenue streams.',
    { state: [], boardId: 'board-1' },
  )

  assert.ok(requestedToolNames.includes('createBusinessModelCanvas'))
  assert.ok(requestedToolNames.includes('executeBatch'))
  assert.equal(requestedToolNames.includes('deleteObject'), false)
  assert.equal(requestedToolChoice, 'required')
})

test('callGLM keeps full toolset for edit-oriented prompts', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  delete process.env.MINIMAX_API_KEY
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let requestedToolNames = []
  let requestedToolChoice = null
  global.fetch = async (_url, request) => {
    const requestBody = JSON.parse(String(request.body))
    requestedToolNames = (requestBody.tools || []).map((tool) => tool?.function?.name).filter(Boolean)
    requestedToolChoice = requestBody.tool_choice
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM('move object-1 to x 200 y 100 and change color to blue', {
    state: [],
    boardId: 'board-1',
  })

  assert.ok(requestedToolNames.includes('moveObject'))
  assert.ok(requestedToolNames.includes('deleteObject'))
  assert.equal(requestedToolChoice, 'auto')
})

test('callGLM cooldown-skips provider with auth failures on subsequent commands', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  const minimaxCalls = []
  const deepseekCalls = []
  global.fetch = async (url) => {
    if (String(url).includes('minimax.io')) {
      minimaxCalls.push(String(url))
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'invalid api key' } }),
      }
    }

    deepseekCalls.push(String(url))
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'ok', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM('first command', { state: [], boardId: 'board-1' })
  await client.callGLM('second command', { state: [], boardId: 'board-1' })

  assert.equal(minimaxCalls.length, 1)
  assert.equal(deepseekCalls.length, 2)
})

test('callGLM does not cooldown-skip provider after timeout failures', async () => {
  delete process.env.Z_AI_GLM_API_KEY
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'
  process.env.AI_PROVIDER_PRIORITY = 'deepseek,minimax'
  process.env.AI_PROVIDER_MAX_RETRIES = '0'

  let deepseekCalls = 0
  let minimaxCalls = 0
  global.fetch = async (url) => {
    if (String(url).includes('deepseek.com')) {
      deepseekCalls += 1
      if (deepseekCalls === 1) {
        const timeoutError = new Error('The operation was aborted due to timeout')
        timeoutError.name = 'TimeoutError'
        throw timeoutError
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'ok', tool_calls: [] } }],
          }),
      }
    }

    minimaxCalls += 1
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'fallback', tool_calls: [] } }],
        }),
    }
  }

  const client = loadFreshClient()
  await client.callGLM('first command', { state: [], boardId: 'board-1' })
  await client.callGLM('second command', { state: [], boardId: 'board-1' })

  assert.equal(deepseekCalls, 2)
  assert.equal(minimaxCalls, 1)
})
