/* eslint-disable no-console */
const { getCachedToken } = require('./jwt-generator')
const { TOOL_DEFINITIONS, buildSystemPrompt } = require('./tool-registry')

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-5'
const TIMEOUT_MS = 30000 // 30 seconds
const MAX_RETRIES = 1

const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1'
const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.5'
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

const readPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const buildProviderList = () => {
  const providers = []
  const zAiApiKey = readEnv('Z_AI_GLM_API_KEY', 'z_ai_glm_api_key')
  const minimaxApiKey = readEnv('MINIMAX_API_KEY', 'minimax_api_key')
  const deepseekApiKey = readEnv('DEEPSEEK_API_KEY', 'deepseek_api_key')

  if (zAiApiKey) {
    providers.push({
      id: 'zai-glm',
      label: 'Z.ai GLM',
      url: readEnv('Z_AI_GLM_API_URL', 'z_ai_glm_api_url') || GLM_API_URL,
      model: readEnv('Z_AI_GLM_MODEL', 'z_ai_glm_model') || MODEL,
      getAuthorization: () => `Bearer ${getCachedToken()}`,
    })
  }

  if (minimaxApiKey) {
    const baseUrl = (readEnv('MINIMAX_API_BASE_URL', 'minimax_api_base_url') || DEFAULT_MINIMAX_BASE_URL).replace(/\/$/, '')
    providers.push({
      id: 'minimax',
      label: 'MiniMax',
      url: `${baseUrl}/chat/completions`,
      model: readEnv('MINIMAX_MODEL', 'minimax_model') || DEFAULT_MINIMAX_MODEL,
      getAuthorization: () => `Bearer ${minimaxApiKey}`,
    })
  }

  if (deepseekApiKey) {
    const baseUrl = (readEnv('DEEPSEEK_API_BASE_URL', 'deepseek_api_base_url') || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/$/, '')
    providers.push({
      id: 'deepseek',
      label: 'DeepSeek',
      url: `${baseUrl}/chat/completions`,
      model: readEnv('DEEPSEEK_MODEL', 'deepseek_model') || DEFAULT_DEEPSEEK_MODEL,
      getAuthorization: () => `Bearer ${deepseekApiKey}`,
    })
  }

  return providers
}

const isRetryableStatus = (statusCode) => statusCode === 429 || statusCode >= 500

const shouldRetryProviderError = (error) => {
  const statusCode = Number(error?.statusCode || 0)
  if (isRetryableStatus(statusCode)) {
    return true
  }
  return error?.name === 'TimeoutError' || error?.name === 'AbortError'
}

const sanitizeError = (error) => {
  if (!error) return 'Unknown error'
  const statusCode = Number(error.statusCode || 0)
  if (statusCode) {
    return `${statusCode}: ${error.message || 'provider error'}`
  }
  return error.message || String(error)
}

const callProvider = async (provider, requestBody, timeoutMs) => {
  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: provider.getAuthorization(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...requestBody,
      model: provider.model,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const responseBody = await response.text()
  if (!response.ok) {
    const error = new Error(`Provider ${provider.label} error`)
    error.statusCode = response.status
    error.message = responseBody ? `${provider.label} ${response.status}: ${responseBody}` : `${provider.label} ${response.status}`
    throw error
  }

  const parsed = JSON.parse(responseBody)
  return {
    ...parsed,
    provider: provider.id,
    model: provider.model,
  }
}

/**
 * Call Z.ai GLM-5 API with tool calling support
 * @param {string} userCommand - The user's natural language command
 * @param {object} boardContext - Current board state { state: [], boardId: string }
 * @returns {Promise<object>} GLM API response
 */
async function callGLM(userCommand, boardContext) {
  const systemPrompt = buildSystemPrompt(boardContext)
  const timeoutMs = readPositiveInt(readEnv('AI_PROVIDER_TIMEOUT_MS', 'ai_provider_timeout_ms'), TIMEOUT_MS)
  const maxRetries = readPositiveInt(readEnv('AI_PROVIDER_MAX_RETRIES', 'ai_provider_max_retries'), MAX_RETRIES)
  const providers = buildProviderList()

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set at least one API key: Z_AI_GLM_API_KEY, MINIMAX_API_KEY, or DEEPSEEK_API_KEY.')
  }

  const requestBody = {
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
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 2048
  }

  const providerErrors = []

  for (const provider of providers) {
    let providerError = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`LLM provider attempt ${attempt + 1} [${provider.id}] for command: "${userCommand}"`)
        const data = await callProvider(provider, requestBody, timeoutMs)
        console.log(`LLM provider success [${provider.id}], choices:`, data.choices?.length || 0)
        return data
      } catch (error) {
        providerError = error
        console.warn(`LLM provider failed [${provider.id}] attempt ${attempt + 1}:`, sanitizeError(error))

        if (!shouldRetryProviderError(error) || attempt >= maxRetries) {
          break
        }

        const delayMs = 1000 * (attempt + 1)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    providerErrors.push(`[${provider.id}] ${sanitizeError(providerError)}`)
    if (providerError && Number(providerError.statusCode || 0) >= 400 && Number(providerError.statusCode || 0) < 500 && Number(providerError.statusCode || 0) !== 429) {
      continue
    }
  }

  throw new Error(`All AI providers failed: ${providerErrors.join(' | ')}`)
}

/**
 * Parse tool calls from GLM response
 * @param {object} glmResponse - Raw GLM API response
 * @returns {Array<{id: string, name: string, arguments: object}>}
 */
function parseToolCalls(glmResponse) {
  const choice = glmResponse?.choices?.[0]
  if (!choice) {
    console.warn('Invalid LLM response: no choices')
    return []
  }

  const message = choice.message
  const toolCalls = message?.tool_calls || []

  return toolCalls.map(tc => {
    try {
      let parsedArguments = {}
      if (typeof tc?.function?.arguments === 'string') {
        parsedArguments = JSON.parse(tc.function.arguments || '{}')
      } else if (tc?.function?.arguments && typeof tc.function.arguments === 'object') {
        parsedArguments = tc.function.arguments
      }

      return {
        id: tc?.id || '',
        name: tc?.function?.name,
        arguments: parsedArguments
      }
    } catch (parseError) {
      console.error('Failed to parse tool call arguments:', tc?.function?.arguments)
      return {
        id: tc?.id || '',
        name: tc?.function?.name || 'unknown',
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
  const content = glmResponse?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof part.text === 'string') return part.text
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

module.exports = { callGLM, parseToolCalls, getTextResponse, MODEL, TIMEOUT_MS, buildProviderList }
