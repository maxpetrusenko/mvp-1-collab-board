/* eslint-disable no-console */
const { getCachedToken } = require('./jwt-generator')
const { TOOL_DEFINITIONS, buildSystemPrompt } = require('./tool-registry')

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-5'
const TIMEOUT_MS = 30000 // 30 seconds
const MAX_RETRIES = 1

/**
 * Call Z.ai GLM-5 API with tool calling support
 * @param {string} userCommand - The user's natural language command
 * @param {object} boardContext - Current board state { state: [], boardId: string }
 * @returns {Promise<object>} GLM API response
 */
async function callGLM(userCommand, boardContext) {
  const token = getCachedToken()
  const systemPrompt = buildSystemPrompt(boardContext)

  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `User command: "${userCommand}"`
      }
    ],
    tools: TOOL_DEFINITIONS,
    temperature: 0.1, // Low temperature for deterministic tool calls
    top_p: 0.9,
    max_tokens: 2048
  }

  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`GLM API call attempt ${attempt + 1} for command: "${userCommand}"`)

      const response = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })

      const responseBody = await response.text()

      if (!response.ok) {
        throw new Error(`GLM API error ${response.status}: ${responseBody}`)
      }

      const data = JSON.parse(responseBody)
      console.log('GLM API success, choices:', data.choices?.length)

      return data

    } catch (error) {
      lastError = error
      console.warn(`GLM call attempt ${attempt + 1} failed:`, error.message)

      // Don't retry on timeout or auth errors
      if (error.name === 'TimeoutError' ||
          error.message.includes('401') ||
          error.message.includes('403')) {
        break
      }

      // Retry with backoff for server errors
      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * (attempt + 1)
        console.log(`Retrying in ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error('GLM call failed after retries')
}

/**
 * Parse tool calls from GLM response
 * @param {object} glmResponse - Raw GLM API response
 * @returns {Array<{id: string, name: string, arguments: object}>}
 */
function parseToolCalls(glmResponse) {
  const choice = glmResponse?.choices?.[0]
  if (!choice) {
    console.warn('Invalid GLM response: no choices')
    return []
  }

  const message = choice.message
  const toolCalls = message?.tool_calls || []

  // GLM-5 returns tool_calls in OpenAI-compatible format
  return toolCalls.map(tc => {
    try {
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }
    } catch (parseError) {
      console.error('Failed to parse tool call arguments:', tc.function.arguments)
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: {},
        parseError: true
      }
    }
  })
}

/**
 * Get the text content from a GLM response (when no tools are called)
 * @param {object} glmResponse - Raw GLM API response
 * @returns {string} The assistant's text response
 */
function getTextResponse(glmResponse) {
  return glmResponse?.choices?.[0]?.message?.content || ''
}

module.exports = { callGLM, parseToolCalls, getTextResponse, MODEL, TIMEOUT_MS }
