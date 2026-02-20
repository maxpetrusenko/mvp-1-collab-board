/* eslint-disable no-console */
const assert = require('node:assert/strict')
const test = require('node:test')

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_ENV = { ...process.env }

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
})

test('buildProviderList includes configured fallback providers in deterministic order', () => {
  process.env.Z_AI_GLM_API_KEY = 'id.secret'
  process.env.MINIMAX_API_KEY = 'minimax-key'
  process.env.DEEPSEEK_API_KEY = 'deepseek-key'

  const client = loadFreshClient()
  const providers = client.buildProviderList()
  assert.deepEqual(providers.map((provider) => provider.id), ['zai-glm', 'minimax', 'deepseek'])
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

    if (String(url).includes('minimaxi.com')) {
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
  assert.match(requestedUrls[0], /api\.minimaxi\.com\/v1\/chat\/completions/)
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
