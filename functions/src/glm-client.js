/* eslint-disable no-console */
const { getCachedToken } = require('./jwt-generator')
const { TOOL_DEFINITIONS, buildSystemPrompt } = require('./tool-registry')

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-5'
const TIMEOUT_MS = 30000 // 30 seconds
const MAX_RETRIES = 1
const MAX_TOKENS_DEFAULT = 1000
const PROVIDER_AUTH_COOLDOWN_MS = 60 * 60 * 1000
const PROVIDER_QUOTA_COOLDOWN_MS = 15 * 60 * 1000

const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/v1'
const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.5'
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
const providerCooldowns = new Map()
const CREATION_FOCUSED_TOOL_NAMES = new Set([
  'executeBatch',
  'getBoardState',
  'createStickyNote',
  'createShape',
  'createFrame',
  'createConnector',
  'createStickyGridTemplate',
  'arrangeGrid',
  'spaceElementsEvenly',
  'createJourneyMap',
  'createBusinessModelCanvas',
  'createWorkflowFlowchart',
  'createSwotTemplate',
  'createRetrospectiveTemplate',
  'organizeBoardByColor',
  'organizeBoardByType',
])
const GRID_FOCUSED_TOOL_NAMES = new Set([
  'executeBatch',
  'createStickyGridTemplate',
  'createStickyNote',
])
const SIMPLE_SINGLE_STICKY_TOOL_NAMES = new Set([
  'createStickyNote',
])
const STRUCTURED_ARTIFACT_TOOL_NAMES = new Set([
  'executeBatch',
  'createBusinessModelCanvas',
  'createWorkflowFlowchart',
  'createSwotTemplate',
  'createRetrospectiveTemplate',
  'createJourneyMap',
  'createStickyGridTemplate',
  'createStickyNote',
  'createShape',
  'createFrame',
  'createConnector',
])
const BOARD_MUTATION_VERB_REGEX =
  /\b(?:add|create|make|generate|build|insert|put|arrange|organize|organise|move|resize|rotate|delete|duplicate|connect|group|cluster|layout|map|draft|brainstorm|draw|outline)\b/
const BOARD_ARTIFACT_REGEX =
  /\b(?:board|whiteboard|sticky(?:\s*note)?s?|sticker(?:s)?|notes?|frame(?:s)?|shape(?:s)?|connector(?:s)?|canvas|matrix|map|roadmap|retrospective|swot|journey(?:\s+map)?|mind\s*map|business\s+model\s+canvas|flow\s*chart|workflow|process\s+flow)\b/
const STRUCTURED_ARTIFACT_COMMAND_REGEX =
  /\b(?:business\s+model\s+canvas|bmc|workflow|flow\s*chart|journey\s+map|swot|retrospective)\b/
const GRID_LAYOUT_COMMAND_REGEX =
  /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:boxes?|sticky(?:\s+notes?)?|notes?)\b/
const SIMPLE_SINGLE_STICKY_COMMAND_REGEX =
  /\b(?:create|add|generate|build|make)\b.*\b(?:one|1|a|an)\b.*\bsticky(?:\s+note)?\b/
const SIMPLE_CREATE_COMMAND_REGEX =
  /\b(?:create|add|generate|build|make)\b.*\b(?:sticky(?:\s+note)?|boxes?|notes?)\b/

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

const normalizeCommand = (command) => String(command || '').toLowerCase().trim()

const shouldUseFullToolSet = (command) => {
  const normalized = normalizeCommand(command)
  return /\b(move|resize|rotate|delete|duplicate|recolor|change color|update text|rename|retitle|share|access)\b/.test(normalized)
}

const isStructuredArtifactCommand = (command) => STRUCTURED_ARTIFACT_COMMAND_REGEX.test(normalizeCommand(command))

const isSimpleSingleStickyCommand = (command) => {
  const normalized = normalizeCommand(command)
  return SIMPLE_SINGLE_STICKY_COMMAND_REGEX.test(normalized) && !/\bsticky\s+notes\b/.test(normalized)
}

const isGridFocusedCommand = (command) => {
  const normalized = normalizeCommand(command)
  if (isSimpleSingleStickyCommand(normalized)) {
    return false
  }
  return GRID_LAYOUT_COMMAND_REGEX.test(normalized) || SIMPLE_CREATE_COMMAND_REGEX.test(normalized)
}

const isLikelyBoardMutationCommand = (command) => {
  const normalized = normalizeCommand(command)
  return BOARD_MUTATION_VERB_REGEX.test(normalized) || BOARD_ARTIFACT_REGEX.test(normalized)
}

const filterToolDefinitions = (toolNames) => {
  const filtered = TOOL_DEFINITIONS.filter((definition) => toolNames.has(definition?.function?.name))
  return filtered.length > 0 ? filtered : TOOL_DEFINITIONS
}

const selectToolDefinitions = (command) => {
  if (shouldUseFullToolSet(command)) {
    return TOOL_DEFINITIONS
  }

  if (isSimpleSingleStickyCommand(command)) {
    return filterToolDefinitions(SIMPLE_SINGLE_STICKY_TOOL_NAMES)
  }

  if (isStructuredArtifactCommand(command)) {
    return filterToolDefinitions(STRUCTURED_ARTIFACT_TOOL_NAMES)
  }

  if (isGridFocusedCommand(command)) {
    return filterToolDefinitions(GRID_FOCUSED_TOOL_NAMES)
  }

  return filterToolDefinitions(CREATION_FOCUSED_TOOL_NAMES)
}

const resolveToolChoice = (command, explicitToolChoice) => {
  const normalizedExplicitChoice = normalizeCommand(explicitToolChoice)
  if (normalizedExplicitChoice === 'required' || normalizedExplicitChoice === 'auto') {
    return normalizedExplicitChoice
  }

  if (shouldUseFullToolSet(command)) {
    return 'auto'
  }

  if (isSimpleSingleStickyCommand(command)) {
    return 'required'
  }

  if (isStructuredArtifactCommand(command) || isGridFocusedCommand(command)) {
    return 'required'
  }

  return isLikelyBoardMutationCommand(command) ? 'required' : 'auto'
}

const shouldUseCompactSystemPrompt = (command) =>
  isStructuredArtifactCommand(command) || isGridFocusedCommand(command) || isSimpleSingleStickyCommand(command)

const buildCompactSystemPrompt = (boardContext, command) => {
  const state = Array.isArray(boardContext?.state) ? boardContext.state : []
  const placement = boardContext?.commandPlacement
  const anchorX = Number(placement?.anchor?.x)
  const anchorY = Number(placement?.anchor?.y)
  const anchorHint =
    Number.isFinite(anchorX) && Number.isFinite(anchorY)
      ? `Anchor hint: (${Math.round(anchorX)}, ${Math.round(anchorY)}).`
      : 'Anchor hint unavailable.'
  const normalized = normalizeCommand(command)
  const gridHint = GRID_LAYOUT_COMMAND_REGEX.test(normalized)
    ? 'For repetitive "N boxes/stickies" requests, prefer createStickyGridTemplate.'
    : ''
  const artifactHint = STRUCTURED_ARTIFACT_COMMAND_REGEX.test(normalized)
    ? 'For BMC/workflow/journey/SWOT/retro requests, prefer dedicated template tools.'
    : ''
  const singleStickyHint = isSimpleSingleStickyCommand(normalized)
    ? 'For single sticky creation, call createStickyNote exactly once.'
    : ''

  return [
    "You are CollabBoard's board tool planner.",
    'For board-mutation intent, return tool calls only.',
    'Set assistant message content to an empty string.',
    'Prefer one executeBatch call for multi-step operations.',
    singleStickyHint,
    gridHint,
    artifactHint,
    anchorHint,
    `Current board object count: ${state.length}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

const parseProviderPriority = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

const applyProviderPriority = (providers) => {
  const priority = parseProviderPriority(readEnv('AI_PROVIDER_PRIORITY', 'ai_provider_priority'))
  if (priority.length === 0) {
    return providers
  }

  const priorityIndex = new Map(priority.map((providerId, index) => [providerId, index]))
  return [...providers].sort((left, right) => {
    const leftOrder = priorityIndex.has(left.id) ? priorityIndex.get(left.id) : Number.MAX_SAFE_INTEGER
    const rightOrder = priorityIndex.has(right.id) ? priorityIndex.get(right.id) : Number.MAX_SAFE_INTEGER
    if (leftOrder === rightOrder) return 0
    return leftOrder - rightOrder
  })
}

const isAuthProviderError = (error) => {
  const statusCode = Number(error?.statusCode || 0)
  const message = String(error?.message || '')
  if (statusCode === 401 || statusCode === 403) {
    return true
  }
  return /\bauthorized_error\b|invalid api key|authentication|forbidden|unauthorized/i.test(message)
}

const isQuotaProviderError = (error) => {
  const statusCode = Number(error?.statusCode || 0)
  const message = String(error?.message || '')
  if (statusCode !== 429) {
    return false
  }
  return /\b1113\b|quota|余额不足|resource pack|insufficient/i.test(message)
}

const isProviderOnCooldown = (providerId, now = Date.now()) => {
  const until = Number(providerCooldowns.get(providerId) || 0)
  return until > now
}

const markProviderCooldown = (providerId, cooldownMs) => {
  const safeMs = Number(cooldownMs)
  if (!Number.isFinite(safeMs) || safeMs <= 0) {
    return
  }
  providerCooldowns.set(providerId, Date.now() + safeMs)
}

const clearProviderCooldown = (providerId) => {
  providerCooldowns.delete(providerId)
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

  return applyProviderPriority(providers)
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
 * @param {object} options - Optional runtime controls
 * @param {number} options.timeoutMs - Optional provider timeout override in milliseconds
 * @param {number} options.maxRetries - Optional provider retry override per provider
 * @param {number} options.maxTokens - Optional max token override for provider responses
 * @param {'auto' | 'required'} options.toolChoice - Optional tool choice override
 * @returns {Promise<object>} GLM API response
 */
async function callGLM(userCommand, boardContext, options = {}) {
  const systemPrompt = shouldUseCompactSystemPrompt(userCommand)
    ? buildCompactSystemPrompt(boardContext, userCommand)
    : buildSystemPrompt(boardContext)
  const configuredTimeoutMs = readPositiveInt(readEnv('AI_PROVIDER_TIMEOUT_MS', 'ai_provider_timeout_ms'), TIMEOUT_MS)
  const timeoutOverrideMs = readPositiveInt(options?.timeoutMs, 0)
  const timeoutMs = timeoutOverrideMs > 0 ? timeoutOverrideMs : configuredTimeoutMs
  const parsedRetryOverride = Number(options?.maxRetries)
  const maxRetriesOverride =
    Number.isFinite(parsedRetryOverride) && parsedRetryOverride >= 0
      ? Math.floor(parsedRetryOverride)
      : null
  const maxRetries =
    maxRetriesOverride !== null
      ? maxRetriesOverride
      : readPositiveInt(readEnv('AI_PROVIDER_MAX_RETRIES', 'ai_provider_max_retries'), MAX_RETRIES)
  const maxTokensOverride = readPositiveInt(options?.maxTokens, 0)
  const providers = buildProviderList()

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set at least one API key: Z_AI_GLM_API_KEY, MINIMAX_API_KEY, or DEEPSEEK_API_KEY.')
  }

  const now = Date.now()
  const activeProviders = providers.filter((provider) => !isProviderOnCooldown(provider.id, now))
  const providersToTry = activeProviders.length > 0 ? activeProviders : providers
  const toolChoice = resolveToolChoice(userCommand, options?.toolChoice)

  const requestBody = {
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userCommand
      }
    ],
    tools: selectToolDefinitions(userCommand),
    tool_choice: toolChoice,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens:
      maxTokensOverride > 0
        ? maxTokensOverride
        : readPositiveInt(readEnv('AI_MAX_TOKENS', 'ai_max_tokens'), MAX_TOKENS_DEFAULT)
  }

  const providerErrors = []

  for (const provider of providersToTry) {
    let providerError = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`LLM provider attempt ${attempt + 1} [${provider.id}] for command: "${userCommand}"`)
        const data = await callProvider(provider, requestBody, timeoutMs)
        console.log(`LLM provider success [${provider.id}], choices:`, data.choices?.length || 0)
        clearProviderCooldown(provider.id)
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

    if (providerError) {
      if (isAuthProviderError(providerError)) {
        markProviderCooldown(provider.id, PROVIDER_AUTH_COOLDOWN_MS)
      } else if (isQuotaProviderError(providerError)) {
        markProviderCooldown(provider.id, PROVIDER_QUOTA_COOLDOWN_MS)
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
