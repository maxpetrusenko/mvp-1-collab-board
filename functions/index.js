/* eslint-disable no-console */
const admin = require('firebase-admin')
const { onRequest } = require('firebase-functions/v2/https')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

// GLM-5 LLM client imports
let glmClient = null
let toolRegistry = null
try {
  glmClient = require('./src/glm-client')
  toolRegistry = require('./src/tool-registry')
} catch (importError) {
  console.warn('GLM client modules not available:', importError.message)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COLOR_MAP = {
  yellow: '#fde68a',
  blue: '#93c5fd',
  green: '#86efac',
  pink: '#fbcfe8',
  red: '#fca5a5',
  orange: '#fdba74',
  purple: '#c4b5fd',
  gray: '#e2e8f0',
}
const COLOR_NAME_ALTERNATION = 'yellow|blue|green|pink|red|orange|purple|gray'
const COLOR_NAME_PATTERN = `(?:${COLOR_NAME_ALTERNATION})`
const CREATE_VERB_PATTERN = '(?:add(?:ed)?|create(?:d)?|make|generate|build|insert|put)'
const BOARD_MUTATION_VERB_REGEX =
  /\b(?:add|create|make|generate|build|insert|put|arrange|organize|organise|move|resize|rotate|delete|duplicate|connect|group|cluster|layout|map|draft|brainstorm|draw|outline)\b/i
const BOARD_ARTIFACT_REGEX =
  /\b(?:board|whiteboard|sticky(?:\s*note)?s?|sticker(?:s)?|notes?|frame(?:s)?|shape(?:s)?|connector(?:s)?|canvas|matrix|map|roadmap|retrospective|swot|journey(?:\s+map)?|mind\s*map|business\s+model\s+canvas|flow\s*chart|workflow|process\s+flow)\b/i
const STRUCTURED_BOARD_ARTIFACT_REGEX =
  /\b(?:business\s+model\s+canvas|swot|retrospective|journey\s+map|mind\s*map|kanban|value\s+proposition\s+canvas|flow\s*chart|workflow)\b/i
const COLOR_PHRASE_REGEX = new RegExp(`\\b(${COLOR_NAME_ALTERNATION})\\s+color\\b`, 'i')
const COLOR_AND_TEXT_CUE_REGEX = new RegExp(
  `\\b(?:that\\s+says|saying|with\\s+text|with\\s+(?:a\\s+)?${COLOR_NAME_PATTERN}\\s+color\\s+and\\s+text|text\\s*[:=-])\\b\\s*(.+)$`,
  'i',
)
const POSITION_PHRASE_REGEX =
  /(?:at|in(?:\s+the)?)\s+(top\s+left|top\s+right|bottom\s+left|bottom\s+right|center|middle|top|bottom|left|right)/i
const STICKY_SHAPE_SIZES = {
  rectangle: { width: 180, height: 110 },
  circle: { width: 130, height: 130 },
  diamond: { width: 170, height: 120 },
  triangle: { width: 170, height: 120 },
}
const BMC_SECTION_LAYOUT = [
  { key: 'keyPartners', title: 'Key Partners', row: 0, col: 0, color: '#fde68a' },
  { key: 'keyActivities', title: 'Key Activities', row: 0, col: 1, color: '#fdba74' },
  { key: 'keyResources', title: 'Key Resources', row: 0, col: 2, color: '#fca5a5' },
  { key: 'valuePropositions', title: 'Value Propositions', row: 1, col: 0, color: '#86efac' },
  { key: 'customerRelationships', title: 'Customer Relationships', row: 1, col: 1, color: '#93c5fd' },
  { key: 'channels', title: 'Channels', row: 1, col: 2, color: '#c4b5fd' },
  { key: 'customerSegments', title: 'Customer Segments', row: 2, col: 0, color: '#fde68a' },
  { key: 'costStructure', title: 'Cost Structure', row: 2, col: 1, color: '#fdba74' },
  { key: 'revenueStreams', title: 'Revenue Streams', row: 2, col: 2, color: '#86efac' },
]
const BMC_IDEA_POOLS = {
  keyPartners: [
    'Cloud infrastructure providers',
    'CRM and helpdesk integrations',
    'Implementation partners',
    'Channel resellers',
    'Compliance advisory partners',
    'Technology alliance ecosystem',
  ],
  keyActivities: [
    'Design and optimize conversation flows',
    'Model evaluation and guardrail tuning',
    'Integrate APIs and channel touchpoints',
    'Onboard customers and train teams',
    'Monitor usage analytics and outcomes',
    'Improve reliability and safety operations',
  ],
  keyResources: [
    'LLM orchestration stack',
    'Conversation datasets and feedback loops',
    'Prompt libraries and reusable playbooks',
    'Analytics dashboards and alerting',
    'Customer success and support team',
    'Security and compliance controls',
  ],
  valuePropositions: [
    'Faster response times across support requests',
    '24/7 self-service assistance with escalation paths',
    'Consistent answers with lower operational overhead',
    'Personalized experiences from customer context',
    'Higher conversion through proactive guidance',
    'Scalable service without linear headcount growth',
  ],
  customerRelationships: [
    'Proactive onboarding nudges',
    'Human handoff for high-risk conversations',
    'Feedback loops after key interactions',
    'Account-based success check-ins',
    'Self-serve knowledge with guided fallback',
    'Usage-based coaching and adoption playbooks',
  ],
  channels: [
    'Website chat widget',
    'WhatsApp or SMS',
    'Slack or Teams assistant',
    'In-app help center panel',
    'Email assistant workflows',
    'API for partner channels',
  ],
  customerSegments: [
    'SMB support teams',
    'Mid-market SaaS operations',
    'Enterprise service organizations',
    'E-commerce customer care teams',
    'Internal employee helpdesk',
    'Sales enablement and lead qualification teams',
  ],
  costStructure: [
    'LLM inference and platform hosting',
    'Engineering and product development',
    'Customer support and success staffing',
    'Compliance and security operations',
    'Partner commissions and channel programs',
    'Analytics and observability tooling',
  ],
  revenueStreams: [
    'Per-seat subscription tiers',
    'Usage-based conversation pricing',
    'Enterprise annual contracts',
    'Premium automation add-ons',
    'Implementation and onboarding services',
    'Partner revenue share programs',
  ],
}
const PASSWORD_RESET_FLOWCHART_NODES = [
  { shapeType: 'circle', text: 'Start', color: '#86efac' },
  { shapeType: 'rectangle', text: 'Open sign-in page', color: '#dbeafe' },
  { shapeType: 'rectangle', text: 'Click "Forgot password"', color: '#dbeafe' },
  { shapeType: 'rectangle', text: 'Enter registered email', color: '#dbeafe' },
  { shapeType: 'diamond', text: 'Email exists?', color: '#fef3c7' },
  { shapeType: 'rectangle', text: 'Send password reset email', color: '#dbeafe' },
  { shapeType: 'rectangle', text: 'Open reset link from email', color: '#dbeafe' },
  { shapeType: 'rectangle', text: 'Set new password', color: '#dbeafe' },
  { shapeType: 'circle', text: 'End: Sign in successful', color: '#86efac' },
]
const FIRESTORE_BATCH_WRITE_LIMIT = 450
const AI_RESPONSE_TARGET_MS = 2_000
const AI_MIN_PROVIDER_TIMEOUT_MS = 400
const AI_LOCK_WAIT_TIMEOUT_MS = 1_200
const AI_LOCK_RETRY_INTERVAL_MS = 75
const AI_LOCK_TTL_MS = 20_000

const normalizeShapeType = (rawShapeType, fallback = 'rectangle') => {
  const normalized = String(rawShapeType || '').toLowerCase().trim()
  if (normalized === 'circle') return 'circle'
  if (normalized === 'diamond' || normalized === 'rhombus' || normalized === 'romb') return 'diamond'
  if (normalized === 'triangle') return 'triangle'
  if (normalized === 'rectangle' || normalized === 'box' || normalized === 'shape') return 'rectangle'
  return fallback
}
const normalizeConnectorStyle = (rawStyle) => (String(rawStyle || '').toLowerCase().trim() === 'line' ? 'line' : 'arrow')

const toColor = (rawColor, fallback) => {
  if (!rawColor) return fallback
  const normalized = rawColor.toLowerCase().trim()
  return COLOR_MAP[normalized] || rawColor
}

const nowMs = () => Date.now()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeText = (text) => String(text || '').trim().slice(0, 300)

const logAiDebug = (event, details = {}) => {
  console.log(`[AI_DEBUG] ${event}`, details)
}
const sanitizeAiAssistantResponse = (text) => sanitizeText(String(text || '').replace(/\s+/g, ' '))
const OUT_OF_SCOPE_AI_MESSAGE = "I can't help with that."
const AI_TEMP_UNAVAILABLE_MESSAGE =
  'AI assistant is temporarily unavailable right now. Please try again in a moment.'
const normalizeCommand = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
const normalizeStickyVocabulary = (value) =>
  String(value || '')
    .replace(/\bsticikies\b/gi, 'sticky notes')
    .replace(/\bstickies\b/gi, 'sticky notes')
    .replace(/\bstikies\b/gi, 'sticky notes')
    .replace(/\bstickys\b/gi, 'sticky notes')
    .replace(/\bstiky\b/gi, 'sticky')
    .replace(/\bstikcy\b/gi, 'sticky')
const normalizeCommandForPlan = (value) =>
  normalizeStickyVocabulary(normalizeCommand(value))
    .replace(/\borganise\b/gi, 'organize')
    .replace(/\bcolour\b/gi, 'color')
const isOrganizeByColorCommand = (lowerCommand) =>
  (lowerCommand.includes('organize') && lowerCommand.includes('color')) ||
  (lowerCommand.includes('group') && lowerCommand.includes('color')) ||
  (lowerCommand.includes('sort') && lowerCommand.includes('color'))
const isKnownColor = (value) => Boolean(value && COLOR_MAP[String(value).toLowerCase().trim()])
const NUMBER_WORD_MAP = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}
const COUNT_TOKEN_ALTERNATION = `\\d+|${Object.keys(NUMBER_WORD_MAP).join('|')}`
const INSTRUCTION_ONLY_TEXT_REGEX =
  /^(?:(?:please|can|could|would|you|me|us|to|a|an|the|some|new|command|comand|cmd|add|added|create|created|make|generate|build|insert|put|sticky|stickies|sticker|note|notes)+\s*)+$/

const parseStickyCountToken = (token) => {
  const normalized = String(token || '').toLowerCase().trim()
  if (!normalized) {
    return null
  }

  const numericValue = /^\d+$/.test(normalized) ? Number(normalized) : NUMBER_WORD_MAP[normalized]
  if (!Number.isFinite(numericValue)) {
    return null
  }

  return Math.min(10, Math.max(1, numericValue))
}

const startsWithCountToken = (value) => new RegExp(`^\\s*(?:${COUNT_TOKEN_ALTERNATION})\\b`, 'i').test(String(value || ''))

const isLikelyBoardMutationCommand = (command) => {
  const normalized = normalizeCommandForPlan(command).toLowerCase()
  if (!normalized) {
    return false
  }

  if (STRUCTURED_BOARD_ARTIFACT_REGEX.test(normalized)) {
    return true
  }

  const hasMutationVerb = BOARD_MUTATION_VERB_REGEX.test(normalized)
  const hasBoardArtifact = BOARD_ARTIFACT_REGEX.test(normalized)

  if (hasBoardArtifact && hasMutationVerb) {
    return true
  }

  if (
    hasBoardArtifact &&
    /\b(?:generate|draft|brainstorm|list|outline|fill|populate|break\s+down)\b/i.test(normalized)
  ) {
    return true
  }

  return false
}

const stripLeadingCreateInstruction = (value) =>
  String(value || '')
    .replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+/i, '')
    .replace(new RegExp(`^(?:please\\s+)?${CREATE_VERB_PATTERN}\\b`, 'i'), '')
    .replace(/^\s*(?:me|us)\s+/i, '')
    .replace(/^\s*(?:a|an)\b/i, '')
    .trim()

const isInstructionOnlyText = (value) =>
  INSTRUCTION_ONLY_TEXT_REGEX.test(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )

const extractStickyPrefixMeta = (beforeMarker) => {
  const tokens = String(beforeMarker || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) {
    return { count: null, color: undefined, remainingText: '' }
  }

  let count = null
  const countIndex = tokens.findIndex((token) => parseStickyCountToken(token) !== null)
  if (countIndex >= 0) {
    count = parseStickyCountToken(tokens[countIndex])
    tokens.splice(countIndex, 1)
  }

  const colorIndex = tokens.findIndex((token) => isKnownColor(token))
  let color
  if (colorIndex >= 0) {
    color = tokens[colorIndex]
    tokens.splice(colorIndex, 1)
  }

  return {
    count,
    color,
    remainingText: tokens.join(' ').trim(),
  }
}

// Parse position from string (supports "top left", "bottom right", "center", etc.)
// Returns { x, y }
// Args: positionString (string like "top left"), defaultX (number), defaultY (number)
const parsePosition = (positionString, defaultX = 120, defaultY = 120) => {
  if (!positionString) return { x: defaultX, y: defaultY }

  const normalized = String(positionString).toLowerCase().trim()

  // Board dimensions (typical viewport)
  const BOARD_WIDTH = 1920
  const BOARD_HEIGHT = 1080

  let x = defaultX
  let y = defaultY

  // Check for center/middle first (explicit center position)
  if (/^(center|middle)$/.test(normalized)) {
    x = BOARD_WIDTH / 2 - 90 // Center minus half sticky width
    y = BOARD_HEIGHT / 2 - 55 // Center minus half sticky height
    return { x, y }
  }

  // Check for relative position patterns
  const hasTop = /\btop\b/.test(normalized)
  const hasBottom = /\bbottom\b/.test(normalized)
  const hasLeft = /\bleft\b/.test(normalized)
  const hasRight = /\bright\b/.test(normalized)

  // Horizontal position
  if (hasLeft) {
    x = 120
  } else if (hasRight) {
    x = BOARD_WIDTH - 300
  } else if (!hasLeft && !hasRight && (hasTop || hasBottom)) {
    // Only "top" or "bottom" specified, center horizontally
    x = BOARD_WIDTH / 2 - 90
  }

  // Vertical position
  if (hasTop) {
    y = 120
  } else if (hasBottom) {
    y = BOARD_HEIGHT - 200
  } else if (!hasTop && !hasBottom && (hasLeft || hasRight)) {
    // Only "left" or "right" specified, center vertically
    y = BOARD_HEIGHT / 2 - 55
  }

  return { x, y }
}

const toFinitePoint = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const x = parseNumber(candidate.x, Number.NaN)
  const y = parseNumber(candidate.y, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return { x, y }
}

const toFiniteViewport = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const x = parseNumber(candidate.x, Number.NaN)
  const y = parseNumber(candidate.y, Number.NaN)
  const width = parseNumber(candidate.width, Number.NaN)
  const height = parseNumber(candidate.height, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }
  if (width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

const normalizeAiPlacementHint = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const pointer = toFinitePoint(candidate.pointer)
  const viewportCenter = toFinitePoint(candidate.viewportCenter)
  const anchor = toFinitePoint(candidate.anchor) || pointer || viewportCenter
  const viewport = toFiniteViewport(candidate.viewport)

  if (!anchor && !pointer && !viewportCenter && !viewport) {
    return null
  }

  return {
    anchor,
    pointer,
    viewportCenter,
    viewport,
  }
}

const resolvePlacementAnchor = (commandPlacement) => {
  if (!commandPlacement || typeof commandPlacement !== 'object') {
    return null
  }
  return (
    toFinitePoint(commandPlacement.anchor) ||
    toFinitePoint(commandPlacement.pointer) ||
    toFinitePoint(commandPlacement.viewportCenter)
  )
}

const resolveLlmCreateArgsWithPlacement = (toolName, args, commandPlacement, batchContext = null) => {
  if (!args || typeof args !== 'object') {
    return args
  }

  const hasExplicitCoordinates = Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y))
  const hasNamedPosition = typeof args.position === 'string' && args.position.trim().length > 0
  if (hasExplicitCoordinates || hasNamedPosition) {
    return args
  }

  const anchor = resolvePlacementAnchor(commandPlacement)
  if (!anchor) {
    return args
  }

  const resolved = { ...args }
  if (toolName === 'createStickyNote') {
    const stickyShapeType = normalizeShapeType(resolved.shapeType || resolved.type, 'rectangle')
    const stickySize = STICKY_SHAPE_SIZES[stickyShapeType] || STICKY_SHAPE_SIZES.rectangle
    if (batchContext && batchContext.total > 1) {
      const layout = getStickyBatchLayoutPositions({
        count: batchContext.total,
        anchor,
        shapeType: stickyShapeType,
      })
      const target = layout[batchContext.index] || layout[layout.length - 1] || { x: 120, y: 120 }
      resolved.x = target.x
      resolved.y = target.y
      return resolved
    }
    resolved.x = Math.round(anchor.x - stickySize.width / 2)
    resolved.y = Math.round(anchor.y - stickySize.height / 2)
    return resolved
  }

  if (toolName === 'createShape') {
    const shapeType = normalizeShapeType(resolved.type || resolved.shapeType, 'rectangle')
    const defaultSize = STICKY_SHAPE_SIZES[shapeType] || STICKY_SHAPE_SIZES.rectangle
    const width = parseNumber(resolved.width, defaultSize.width)
    const height = parseNumber(resolved.height, defaultSize.height)
    resolved.x = Math.round(anchor.x - width / 2)
    resolved.y = Math.round(anchor.y - height / 2)
    return resolved
  }

  if (toolName === 'createFrame') {
    const width = parseNumber(resolved.width, 480)
    const height = parseNumber(resolved.height, 300)
    resolved.x = Math.round(anchor.x - width / 2)
    resolved.y = Math.round(anchor.y - height / 2)
    return resolved
  }

  return resolved
}

const toBatchOperations = (args) => {
  if (!args || typeof args !== 'object' || !Array.isArray(args.operations)) {
    return []
  }

  return args.operations
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const tool =
        typeof entry.tool === 'string'
          ? entry.tool.trim()
          : typeof entry.name === 'string'
            ? entry.name.trim()
            : ''
      if (!tool) {
        return null
      }
      const operationArgs = entry.args && typeof entry.args === 'object' ? entry.args : {}
      return {
        tool,
        args: operationArgs,
      }
    })
    .filter(Boolean)
}

const buildCompoundToolRetryCommand = (command, previousTextResponse = '') => {
  const guidance = [
    'BOARD EXECUTION MODE (RETRY):',
    '- This is a board-mutation request. Do not answer with plain text only.',
    '- Use compound tools: prefer one executeBatch call that includes all required operations.',
    '- If executeBatch is not suitable, emit multiple tool calls in a single response.',
    '- Fulfill full quantity and structure requested by the user.',
    '- Keep generated sticky content distinct and non-repetitive.',
  ].join('\n')

  const previousDraft =
    typeof previousTextResponse === 'string' && previousTextResponse.trim().length > 0
      ? `Previous text-only draft (convert this into board operations, do not return only text):\n${previousTextResponse.trim()}`
      : ''

  return [command, guidance, previousDraft].filter(Boolean).join('\n\n')
}

const buildStickyShortfallRetryCommand = (command, summary) => {
  const remaining = Math.max(0, parseNumber(summary?.remaining, 0))
  const requested = Math.max(0, parseNumber(summary?.requested, 0))
  const created = Math.max(0, parseNumber(summary?.created, 0))
  const guidance = [
    'BOARD EXECUTION MODE (SHORTFALL RECOVERY):',
    `- The user requested ${requested} sticky notes, but only ${created} were created.`,
    `- Create exactly ${remaining} additional sticky notes to satisfy the original request.`,
    '- Use executeBatch with createStickyNote operations when possible.',
    '- Ensure each new sticky has unique, concrete text (no repetition).',
  ].join('\n')

  return [command, guidance].join('\n\n')
}

const buildNoMutationRetryCommand = (command, previousTextResponse = '') => {
  const guidance = [
    'BOARD EXECUTION MODE (NO-OP RECOVERY):',
    '- Previous tool calls produced no board changes.',
    '- Retry with actionable tool calls only.',
    '- If using executeBatch, operations must be non-empty and concrete.',
    '- For artifact/framework requests (canvas/matrix/map), create visible board objects now.',
    '- Do not return text-only output.',
  ].join('\n')

  const priorText =
    typeof previousTextResponse === 'string' && previousTextResponse.trim().length > 0
      ? `Previous assistant text (convert to board operations):\n${previousTextResponse.trim()}`
      : ''

  return [command, guidance, priorText].filter(Boolean).join('\n\n')
}

const countCreatedStickyNotesSinceBaseline = (ctx, baselineObjectIds) => {
  if (!ctx || !Array.isArray(ctx.state) || !(baselineObjectIds instanceof Set)) {
    return 0
  }

  return ctx.state.reduce((count, item) => {
    if (!item || item.type !== 'stickyNote') {
      return count
    }
    if (baselineObjectIds.has(item.id)) {
      return count
    }
    return count + 1
  }, 0)
}

const buildBoardMutationToken = (state = []) => {
  if (!Array.isArray(state) || state.length === 0) {
    return '0:0'
  }

  const entries = state
    .filter(Boolean)
    .map((item) => {
      const id = String(item.id || '')
      const type = String(item.type || '')
      const version = parseNumber(item.version, 0)
      const deleted = item.deleted ? 1 : 0
      const x = parseNumber(item.position?.x, 0)
      const y = parseNumber(item.position?.y, 0)
      const width = parseNumber(item.size?.width, 0)
      const height = parseNumber(item.size?.height, 0)
      const color = String(item.color || '')
      const text = sanitizeText(item.text || item.title || '')
      return `${id}|${type}|${version}|${deleted}|${x}|${y}|${width}|${height}|${color}|${text}`
    })
    .sort()

  return `${entries.length}:${hashText(entries.join('||'))}`
}

const stripWrappingQuotes = (value) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/^['"]|['"]$/g, '').trim()
}

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractPositionPhrase = (value) => {
  const normalized = normalizeCommand(value)
  const positionMatch = normalized.match(POSITION_PHRASE_REGEX)
  if (!positionMatch) {
    return { position: undefined, matchText: '' }
  }

  return {
    position: positionMatch[1]?.toLowerCase().trim(),
    matchText: positionMatch[0] || '',
  }
}

const extractCoordinatePosition = (value) => {
  const normalized = normalizeCommand(value)
  const coordinatePatterns = [
    /\b(?:at|to|position(?:ed)?(?:\s+at)?)\s*(-?\d{1,6})\s*[,x]\s*(-?\d{1,6})\b/i,
    /\bx\s*[:=]\s*(-?\d{1,6})\s*[, ]+\s*y\s*[:=]\s*(-?\d{1,6})\b/i,
    /\by\s*[:=]\s*(-?\d{1,6})\s*[, ]+\s*x\s*[:=]\s*(-?\d{1,6})\b/i,
  ]

  for (const pattern of coordinatePatterns) {
    const match = normalized.match(pattern)
    if (!match) {
      continue
    }

    const xRaw = pattern === coordinatePatterns[2] ? match[2] : match[1]
    const yRaw = pattern === coordinatePatterns[2] ? match[1] : match[2]
    const x = parseNumber(xRaw, Number.NaN)
    const y = parseNumber(yRaw, Number.NaN)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }

    return {
      point: { x, y },
      matchText: match[0] || '',
    }
  }

  return { point: null, matchText: '' }
}

const extractColorAndText = (raw) => {
  const normalized = stripWrappingQuotes(raw)
  if (!normalized) {
    return { color: undefined, text: '' }
  }

  const parts = normalized.split(/\s+/)
  const [first, ...rest] = parts

  if (isKnownColor(first)) {
    return {
      color: first,
      text: rest.join(' ').trim(),
    }
  }

  return {
    color: undefined,
    text: normalized,
  }
}

const extractColorFromPhrase = (raw) => {
  const normalized = normalizeCommand(raw)
  const match = normalized.match(COLOR_PHRASE_REGEX)
  if (!match) {
    return undefined
  }

  return match[1]?.toLowerCase()
}

const stripColorInstructionText = (rawText) =>
  String(rawText || '')
    .replace(new RegExp(`\\bwith\\s+(?:a\\s+)?${COLOR_NAME_PATTERN}\\s+color\\b`, 'gi'), '')
    .replace(new RegExp(`\\b${COLOR_NAME_PATTERN}\\s+color\\b`, 'gi'), '')
    .replace(/\b(?:and\s+)?text\b[:\-]?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

const inferStickyShapeType = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  if (/\b(?:circle|circles|round|rounds)\b/.test(lower)) return 'circle'
  if (/\b(?:diamond|diamonds|rhombus|rhombuses|romb)\b/.test(lower)) return 'diamond'
  if (/\b(?:triangle|triangles)\b/.test(lower)) return 'triangle'
  return 'rectangle'
}

const parseRequestedStickyCount = (command) => {
  const lower = normalizeStickyVocabulary(normalizeCommand(command)).toLowerCase()
  const countMatch = lower.match(
    new RegExp(`\\b(${COUNT_TOKEN_ALTERNATION})\\b(?:\\s+\\w+){0,4}\\s+(?:sticky(?:\\s*note)?|sticker|note)s?\\b`, 'i'),
  )
  if (!countMatch) {
    return 1
  }

  return parseStickyCountToken(countMatch[1]) || 1
}

const parseExplicitStickyTexts = (command) => {
  const normalized = normalizeCommand(command)
  const quoted = [...normalized.matchAll(/["']([^"']{1,120})["']/g)]
    .map((match) => sanitizeText(match[1]))
    .filter(Boolean)
  if (quoted.length >= 2) {
    return quoted.slice(0, 10)
  }

  const pairMatch = normalized.match(
    /\bone\b[^]*?\bsay(?:s)?\b\s+(.+?)\s+\banother\b[^]*?\bsay(?:s)?\b\s+(.+)$/i,
  )
  if (pairMatch) {
    const first = sanitizeText(stripWrappingQuotes(pairMatch[1]))
    const second = sanitizeText(stripWrappingQuotes(pairMatch[2]))
    return [first, second].filter(Boolean)
  }

  return []
}

const getStickyBatchLayoutPositions = ({ count, anchor, shapeType = 'rectangle' }) => {
  const safeCount = Math.max(1, Math.min(10, parseNumber(count, 1)))
  const normalizedShapeType = normalizeShapeType(shapeType, 'rectangle')
  const size = STICKY_SHAPE_SIZES[normalizedShapeType] || STICKY_SHAPE_SIZES.rectangle
  const safeAnchor = toFinitePoint(anchor) || { x: 220, y: 180 }
  const columns = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(safeCount))))
  const rows = Math.ceil(safeCount / columns)
  const rowCounts = Array.from({ length: rows }, (_, rowIndex) => Math.min(columns, Math.max(1, safeCount - rowIndex * columns)))
  const weightedRowCenter = rowCounts.reduce((sum, rowCount, rowIndex) => sum + rowIndex * rowCount, 0) / safeCount
  const gapX = Math.max(24, Math.round(size.width * 0.2))
  const gapY = Math.max(20, Math.round(size.height * 0.28))

  return Array.from({ length: safeCount }, (_, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const remaining = safeCount - row * columns
    const rowItemCount = Math.min(columns, Math.max(1, remaining))
    const colOffset = col - (rowItemCount - 1) / 2
    const rowOffset = row - weightedRowCenter
    const centerX = safeAnchor.x + colOffset * (size.width + gapX)
    const centerY = safeAnchor.y + rowOffset * (size.height + gapY)
    return {
      x: Math.round(centerX - size.width / 2),
      y: Math.round(centerY - size.height / 2),
    }
  })
}

const hashText = (value) => {
  let hash = 0
  const normalized = String(value || '')
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0
  }
  return hash
}

const parseReasonSubjectMeta = (subject) => {
  const sanitizedSubject = stripWrappingQuotes(String(subject || '').replace(/[.!?]+$/g, '').trim())
  const qualityMatch = sanitizedSubject.match(/^(.+?)\s+is\s+(.+)$/i)

  if (!qualityMatch) {
    return {
      entity: sanitizeText(sanitizedSubject) || 'this person',
      quality: 'great',
    }
  }

  return {
    entity: sanitizeText(qualityMatch[1]) || sanitizeText(sanitizedSubject) || 'this person',
    quality: sanitizeText(qualityMatch[2]) || 'great',
  }
}

const buildReasonStickyTexts = (subject, count) => {
  const safeCount = Math.max(1, Math.min(10, parseNumber(count, 1)))
  const { entity, quality } = parseReasonSubjectMeta(subject)
  const reasonCandidates = [
    `${entity} listens with patience and empathy.`,
    `${entity} shows up consistently when support is needed most.`,
    `${entity} makes stressful moments feel manageable and calm.`,
    `${entity} celebrates your wins like they are their own.`,
    `${entity} keeps promises and follows through on commitments.`,
    `${entity} brings humor that lightens hard days.`,
    `${entity} notices small details that make everyday life easier.`,
    `${entity} communicates honestly and respectfully.`,
    `${entity} makes thoughtful decisions even under pressure.`,
    `${entity} keeps growing and learning from experience.`,
    `${entity} creates a strong sense of trust and safety.`,
    `${entity} supports your goals without hesitation.`,
    `${entity} stays kind and steady during disagreements.`,
    `${entity} turns routine moments into meaningful memories.`,
    `${entity} shows what "${quality}" looks like through real actions.`,
  ]
    .map((entry) => sanitizeText(entry))
    .filter(Boolean)

  if (reasonCandidates.length === 0) {
    return Array.from({ length: safeCount }, (_, index) => `Reason ${index + 1}: ${entity} is ${quality}.`)
  }

  const startOffset = hashText(`${entity}:${quality}`) % reasonCandidates.length
  return Array.from({ length: safeCount }, (_, index) => {
    const reason = reasonCandidates[(startOffset + index) % reasonCandidates.length]
    return sanitizeText(`Reason ${index + 1}: ${reason}`)
  })
}

const parseBusinessModelCanvasCommand = (command) => {
  const normalized = normalizeCommandForPlan(command)
  console.log('[BMC] Input command:', command)
  console.log('[BMC] Normalized:', normalized)
  const patternMatch = /\bbusiness\s+model\s+canvas\b/i.test(normalized)
  console.log('[BMC] Pattern match:', patternMatch)
  if (!patternMatch) {
    console.log('[BMC] REJECTED: No BMC pattern match')
    return null
  }

  const topicMatch = normalized.match(/\bfor\s+(.+?)(?:,|$)/i)
  console.log('[BMC] Topic match:', topicMatch?.[1])
  const topicCandidate = sanitizeText(stripWrappingQuotes(topicMatch?.[1] || ''))
  const topic = topicCandidate || 'AI assistant product'
  const includeChannelExamples = /\bchannels?\b/i.test(normalized)
  const includeRevenueExamples = /\brevenue(?:\s+streams?)?\b/i.test(normalized)
  const includeExamples = /\bexamples?\b/i.test(normalized)

  const result = {
    topic,
    includeExamples,
    includeChannelExamples,
    includeRevenueExamples,
  }
  console.log('[BMC] Parsed result:', result)
  return result
}

const parseWorkflowFlowchartCommand = (command) => {
  const normalized = normalizeCommandForPlan(command)
  const hasWorkflowKeyword = /\b(?:flow\s*chart|workflow|process\s+flow)\b/i.test(normalized)
  if (!hasWorkflowKeyword) {
    return null
  }

  const looksQuestion =
    /\?\s*$/.test(normalized) &&
    /^(?:can|could|would|should|is|are|do|does|did|what|why|how)\b/i.test(normalized)
  if (looksQuestion) {
    return null
  }

  const hasActionIntent =
    new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized) || /\b(?:draw|show|outline|map)\b/i.test(normalized)
  if (!hasActionIntent) {
    return null
  }

  const topicMatch = normalized.match(/\bfor\s+(.+?)(?:[.,]|$)/i)
  const topicCandidate = sanitizeText(stripWrappingQuotes(topicMatch?.[1] || ''))

  return {
    topic: topicCandidate || 'workflow process',
    isPasswordReset: /\bpassword\s+reset\b/i.test(normalized),
  }
}

const buildWorkflowFlowchartNodes = (spec = {}) => {
  if (spec.isPasswordReset) {
    return PASSWORD_RESET_FLOWCHART_NODES
  }

  const topic = sanitizeText(spec.topic || 'workflow process')
  return [
    { shapeType: 'circle', text: `Start: ${topic}`, color: '#86efac' },
    { shapeType: 'rectangle', text: `Capture request for ${topic}`, color: '#dbeafe' },
    { shapeType: 'rectangle', text: 'Validate required input', color: '#dbeafe' },
    { shapeType: 'diamond', text: 'Validation passed?', color: '#fef3c7' },
    { shapeType: 'rectangle', text: `Execute ${topic}`, color: '#dbeafe' },
    { shapeType: 'rectangle', text: 'Notify stakeholders', color: '#dbeafe' },
    { shapeType: 'circle', text: `End: ${topic} complete`, color: '#86efac' },
  ]
}

const selectIdeasForTopic = (topic, key, count = 3) => {
  const pool = Array.isArray(BMC_IDEA_POOLS[key]) ? BMC_IDEA_POOLS[key] : []
  if (pool.length === 0) {
    return []
  }

  const safeCount = Math.max(1, Math.min(4, parseNumber(count, 3)))
  const offset = hashText(`${topic}:${key}`) % pool.length
  const selected = []
  for (let index = 0; index < safeCount; index += 1) {
    selected.push(pool[(offset + index) % pool.length])
  }
  return selected
}

const buildBusinessModelCanvasSectionText = ({ title, topic, key, includeExamples = false }) => {
  const selectedIdeas = selectIdeasForTopic(topic, key, 3)
  const topicPrefix =
    key === 'valuePropositions' || key === 'customerSegments'
      ? `For ${topic}: `
      : ''
  const body = selectedIdeas.join('; ')
  const examplePrefix = includeExamples ? 'Examples: ' : ''
  return sanitizeText(`${title}\n${topicPrefix}${examplePrefix}${body}`)
}

const buildStickyTextsFromTemplate = (template, count) => {
  const safeCount = Math.max(1, Math.min(10, parseNumber(count, 1)))
  const normalizedTemplate = sanitizeText(template || 'New sticky note') || 'New sticky note'
  if (safeCount === 1) {
    return [normalizedTemplate]
  }

  const reasonsMatch = normalizedTemplate.match(/^(?:(?:that\s+)?list\s+)?(?:the\s+)?reasons?\s+why\s+(.+)$/i)
  if (reasonsMatch) {
    return buildReasonStickyTexts(reasonsMatch[1], safeCount)
  }

  return Array.from({ length: safeCount }, (_, index) =>
    normalizedTemplate === 'New sticky note' ? `Note ${index + 1}` : `${normalizedTemplate} ${index + 1}`,
  )
}

const parseReasonListCommand = (command) => {
  const normalized = normalizeStickyVocabulary(normalizeCommand(command))
  const reasonMatch = normalized.match(
    new RegExp(
      `(?:^|\\b)(${COUNT_TOKEN_ALTERNATION})\\s+(?:different\\s+|distinct\\s+|creative\\s+|unique\\s+)?reasons?\\s+why\\s+(.+)$`,
      'i',
    ),
  )
  if (!reasonMatch) {
    return null
  }

  const hasCreateIntent =
    new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized) ||
    /\b(?:brainstorm|list|write)\b/i.test(normalized) ||
    startsWithCountToken(normalized)
  if (!hasCreateIntent) {
    return null
  }

  const count = parseStickyCountToken(reasonMatch[1]) || 1
  const { position, matchText } = extractPositionPhrase(normalized)
  const { point: coordinatePoint, matchText: coordinateMatchText } = extractCoordinatePosition(normalized)
  let subject = String(reasonMatch[2] || '').trim()
  if (matchText) {
    subject = subject.replace(new RegExp(escapeRegExp(matchText), 'i'), '').trim()
  }
  if (coordinateMatchText) {
    subject = subject.replace(new RegExp(escapeRegExp(coordinateMatchText), 'i'), '').trim()
  }
  subject = stripWrappingQuotes(subject.replace(/[.!?]+$/g, '').trim())
  if (!subject) {
    return null
  }

  const prefixForColor = normalized.slice(0, (reasonMatch.index || 0) + String(reasonMatch[1] || '').length)
  const prefixMeta = extractStickyPrefixMeta(prefixForColor)
  const colorCandidate = prefixMeta.color || extractColorFromPhrase(prefixForColor)

  return {
    color: colorCandidate,
    shapeType: inferStickyShapeType(normalized),
    count,
    position,
    ...(coordinatePoint ? { x: coordinatePoint.x, y: coordinatePoint.y } : {}),
    texts: buildReasonStickyTexts(subject, count),
  }
}

const parseStickyCommand = (command) => {
  const normalized = normalizeStickyVocabulary(normalizeCommand(command))
  const hasCreateIntent = new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized) || startsWithCountToken(normalized)
  if (!hasCreateIntent) {
    return null
  }

  const stickyMarker = normalized.match(/\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i)
  if (!stickyMarker) {
    return null
  }

  const markerStart = stickyMarker.index || 0
  const markerText = stickyMarker[0]
  const beforeMarker = stripLeadingCreateInstruction(normalized.slice(0, markerStart))

  const afterMarker = normalized.slice(markerStart + markerText.length).trim()

  // Extract position from "at top left", "at center", "in the center", etc.
  const { position, matchText: positionMatchText } = extractPositionPhrase(normalized)
  const { point: coordinatePoint, matchText: coordinateMatchText } = extractCoordinatePosition(normalized)

  const cueMatch = normalized.match(COLOR_AND_TEXT_CUE_REGEX)
  const cueText = cueMatch ? cueMatch[1].replace(/^[:\-\s]+/, '').trim() : ''
  // Remove position from suffix text if present
  let suffixText = afterMarker.replace(/^[.!?]+|[.!?]+$/g, '').trim()
  if (positionMatchText) {
    suffixText = suffixText.replace(new RegExp(escapeRegExp(positionMatchText), 'i'), '').trim()
  }
  if (coordinateMatchText) {
    suffixText = suffixText.replace(new RegExp(escapeRegExp(coordinateMatchText), 'i'), '').trim()
  }

  const stickyPrefix = extractStickyPrefixMeta(beforeMarker)
  const prefixConsumed = stickyPrefix.count !== null || Boolean(stickyPrefix.color)
  let textSource = cueText || suffixText || stickyPrefix.remainingText
  if (!textSource && !prefixConsumed) {
    textSource = beforeMarker
  }
  let colorCandidate = stickyPrefix.color

  if (!cueText && !suffixText && !stickyPrefix.remainingText && prefixConsumed) {
    textSource = ''
  }

  const parsed = extractColorAndText(textSource)
  if (!colorCandidate) {
    colorCandidate = parsed.color
  }
  if (!colorCandidate) {
    colorCandidate = extractColorFromPhrase(`${beforeMarker} ${afterMarker}`)
  }

  let sanitizedParsedText = stripColorInstructionText(parsed.text)
  if (!cueText && !suffixText && prefixConsumed && isInstructionOnlyText(sanitizedParsedText)) {
    sanitizedParsedText = ''
  }

  const explicitTexts = parseExplicitStickyTexts(normalized)
  const requestedCount = parseRequestedStickyCount(normalized)
  const count =
    explicitTexts.length > 0
      ? explicitTexts.length
      : stickyPrefix.count !== null
        ? stickyPrefix.count
        : requestedCount
  const shapeType = inferStickyShapeType(normalized)

  if (!sanitizedParsedText && explicitTexts.length === 0) {
    return {
      color: colorCandidate,
      shapeType,
      count,
      position,
      ...(coordinatePoint ? { x: coordinatePoint.x, y: coordinatePoint.y } : {}),
      texts: Array.from({ length: count }, (_, index) =>
        count > 1 ? `Note ${index + 1}` : 'New sticky note',
      ),
    }
  }

  if (explicitTexts.length > 0) {
    return {
      color: colorCandidate,
      shapeType,
      count,
      position,
      ...(coordinatePoint ? { x: coordinatePoint.x, y: coordinatePoint.y } : {}),
      texts: explicitTexts,
    }
  }

  const fallbackText = sanitizeText(sanitizedParsedText) || 'New sticky note'
  return {
    color: colorCandidate,
    shapeType,
    count,
    position,
    ...(coordinatePoint ? { x: coordinatePoint.x, y: coordinatePoint.y } : {}),
    texts: buildStickyTextsFromTemplate(fallbackText, count),
  }
}

const parseCompoundStickyCreateOperations = (command) => {
  const normalized = normalizeStickyVocabulary(normalizeCommand(command))
  console.log('[COMPOUND] Input command:', command)
  console.log('[COMPOUND] Normalized:', normalized)
  console.log('[COMPOUND] Has verb:', new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized))
  console.log('[COMPOUND] Has "and":', /\band\b/i.test(normalized))

  if (!new RegExp(CREATE_VERB_PATTERN, 'i').test(normalized) || !/\band\b/i.test(normalized)) {
    console.log('[COMPOUND] REJECTED: Missing verb or "and"')
    return []
  }

  const verbStripped = stripLeadingCreateInstruction(normalized)
  console.log('[COMPOUND] Verb stripped:', verbStripped)

  const segments = verbStripped
    .split(/\s+\band\b\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean)

  console.log('[COMPOUND] Segments:', segments)

  if (segments.length < 2) {
    console.log('[COMPOUND] REJECTED: Less than 2 segments')
    return []
  }

  const operations = []
  for (const segment of segments) {
    const hasStickyMarker = /\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i.test(segment)
    const hasShapeMarker = /\b(?:circle|round|diamond|rhombus|romb|triangle|rectangle|box|shape)s?\b/i.test(segment)
    console.log('[COMPOUND] Segment:', segment, '| sticky:', hasStickyMarker, '| shape:', hasShapeMarker)
    if (!hasStickyMarker && !hasShapeMarker) {
      console.log('[COMPOUND] REJECTED: Segment missing markers')
      return []
    }

    const countMatch = segment.match(new RegExp(`\\b(${COUNT_TOKEN_ALTERNATION})\\b`, 'i'))
    const count = parseStickyCountToken(countMatch?.[1]) || 1
    console.log('[COMPOUND] Count:', count, 'from match:', countMatch?.[1])

    const colorMatch = segment.match(new RegExp(`\\b(${COLOR_NAME_ALTERNATION})\\b`, 'i'))
    const color = colorMatch?.[1]?.toLowerCase()
    console.log('[COMPOUND] Color:', color, 'from match:', colorMatch?.[1])

    const shapeType = inferStickyShapeType(segment)
    console.log('[COMPOUND] Shape type:', shapeType)

    const textMatch = segment.match(
      /\b(?:with\s+words?|with\s+text|text\s*[:=-]|that\s+says|saying)\s+(.+)$/i,
    )
    const extractedText = sanitizeText(stripWrappingQuotes(textMatch?.[1] || ''))
    console.log('[COMPOUND] Text match:', textMatch?.[1], '| Extracted:', extractedText)

    for (let index = 0; index < count; index += 1) {
      operations.push({
        text:
          extractedText ||
          (shapeType === 'triangle' || shapeType === 'circle'
            ? `${shapeType} note`
            : `Note ${operations.length + 1}`),
        ...(color ? { color } : {}),
        shapeType,
      })
    }
  }

  console.log('[COMPOUND] Final operations:', operations.length, operations)
  return operations
}

const getObjectsRef = (boardId) => db.collection('boards').doc(boardId).collection('objects')
const getCommandsRef = (boardId) => db.collection('boards').doc(boardId).collection('aiCommands')
const getSystemRef = (boardId) => db.collection('boards').doc(boardId).collection('system').doc('ai-lock')
const getBoardRef = (boardId) => db.collection('boards').doc(boardId)

const normalizeSharedWith = (candidate, ownerId) =>
  Array.isArray(candidate)
    ? candidate
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0 && entry !== ownerId)
    : []

const normalizeSharedRoles = (candidate, sharedWith) => {
  const normalized = {}
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    Object.entries(candidate).forEach(([userId, roleValue]) => {
      if (!sharedWith.includes(userId)) {
        return
      }
      normalized[userId] = roleValue === 'view' ? 'view' : 'edit'
    })
  }
  sharedWith.forEach((userId) => {
    if (normalized[userId] !== 'view' && normalized[userId] !== 'edit') {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}
const normalizeLinkAccessRole = (candidate) => {
  if (candidate === 'edit' || candidate === 'view') {
    return candidate
  }
  return 'restricted'
}

const normalizeBoardMeta = (boardId, data) => {
  const ownerIdCandidate =
    typeof data?.ownerId === 'string' && data.ownerId.trim()
      ? data.ownerId.trim()
      : ''
  const createdByCandidate =
    typeof data?.createdBy === 'string' && data.createdBy.trim() ? data.createdBy.trim() : ''
  const ownerId = ownerIdCandidate || createdByCandidate
  const createdBy = createdByCandidate || ownerId
  const linkAccessRole = normalizeLinkAccessRole(data?.linkAccessRole)
  const sharedWith = normalizeSharedWith(data?.sharedWith, ownerId)
  const sharedRoles = normalizeSharedRoles(data?.sharedRoles, sharedWith)

  return {
    id: String(data?.id || boardId),
    name: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : `Board ${boardId.slice(0, 8)}`,
    description: typeof data?.description === 'string' ? data.description : '',
    createdBy,
    ownerId,
    linkAccessRole,
    sharedWith,
    sharedRoles,
  }
}

const canUserAccessBoard = (boardMeta, userId) =>
  Boolean(
    boardMeta?.ownerId === userId ||
      boardMeta?.sharedWith?.includes(userId) ||
      boardMeta?.linkAccessRole === 'view' ||
      boardMeta?.linkAccessRole === 'edit',
  )

const canUserEditBoard = (boardMeta, userId) => {
  if (boardMeta?.ownerId === userId) {
    return true
  }
  if (boardMeta?.sharedWith?.includes(userId)) {
    return boardMeta?.sharedRoles?.[userId] !== 'view'
  }
  return boardMeta?.linkAccessRole === 'edit'
}

const ensureBoardAccess = async ({ boardId, userId, createIfMissing = false }) => {
  const boardRef = getBoardRef(boardId)
  const boardSnap = await boardRef.get()

  if (!boardSnap.exists) {
    if (!createIfMissing) {
      return { ok: false, reason: 'Board not found', status: 404 }
    }

    await boardRef.set({
      id: boardId,
      name: `Board ${boardId.slice(0, 8)}`,
      description: 'Untitled board',
      ownerId: userId,
      linkAccessRole: 'restricted',
      sharedWith: [],
      sharedRoles: {},
      createdBy: userId,
      updatedBy: userId,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    })

    return {
      ok: true,
      boardMeta: {
        id: boardId,
        name: `Board ${boardId.slice(0, 8)}`,
        description: 'Untitled board',
        createdBy: userId,
        ownerId: userId,
        linkAccessRole: 'restricted',
        sharedWith: [],
        sharedRoles: {},
      },
    }
  }

  const boardMeta = normalizeBoardMeta(boardId, boardSnap.data())
  if (!boardMeta.ownerId || !canUserAccessBoard(boardMeta, userId)) {
    return { ok: false, reason: 'Access denied for this board', status: 403 }
  }

  return { ok: true, boardMeta, boardRef }
}

const resolveSingleCollaboratorFromSnapshot = (snapshot, lookupType) => {
  if (!snapshot || snapshot.empty) {
    return null
  }
  if (snapshot.docs.length > 1) {
    throw new Error(`Multiple users match that ${lookupType}. Use a full email address`)
  }
  return snapshot.docs[0].id
}

const resolveCollaboratorId = async ({ email, userId }) => {
  const trimmedUserId = typeof userId === 'string' ? userId.trim() : ''
  if (trimmedUserId) {
    return trimmedUserId
  }

  const normalizedInput = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedInput) {
    throw new Error('Provide collaborator email or userId')
  }

  if (normalizedInput.includes('@')) {
    try {
      const collaborator = await admin.auth().getUserByEmail(normalizedInput)
      return collaborator.uid
    } catch (error) {
      const exactSnapshot = await db
        .collection('users')
        .where('emailLower', '==', normalizedInput)
        .limit(2)
        .get()
      const exactId = resolveSingleCollaboratorFromSnapshot(exactSnapshot, 'email')
      if (exactId) {
        return exactId
      }
      throw new Error('Collaborator email not found')
    }
  }

  const exactUserDoc = await db.collection('users').doc(normalizedInput).get()
  if (exactUserDoc.exists) {
    return exactUserDoc.id
  }

  const displaySnapshot = await db
    .collection('users')
    .where('displayNameLower', '==', normalizedInput)
    .limit(2)
    .get()
  const displayId = resolveSingleCollaboratorFromSnapshot(displaySnapshot, 'handle')
  if (displayId) {
    return displayId
  }

  const emailPrefixStart = `${normalizedInput}@`
  const emailPrefixEnd = `${normalizedInput}@\uf8ff`
  const prefixSnapshot = await db
    .collection('users')
    .where('emailLower', '>=', emailPrefixStart)
    .where('emailLower', '<=', emailPrefixEnd)
    .limit(2)
    .get()
  const prefixId = resolveSingleCollaboratorFromSnapshot(prefixSnapshot, 'handle')
  if (prefixId) {
    return prefixId
  }

  throw new Error('Collaborator not found. Use full email or exact handle')
}

const getBoardState = async (boardId) => {
  const snapshot = await getObjectsRef(boardId).limit(500).get()
  const objects = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data()
    if (data && !data.deleted) objects.push(data)
  })
  return objects
}

const getNextZIndex = (objects) => objects.reduce((maxZ, obj) => Math.max(maxZ, obj.zIndex || 0), 0) + 1
const toConnectorBounds = (start, end) => ({
  position: {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  },
  size: {
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  },
})
const getObjectCenter = (object) => ({
  x: parseNumber(object?.position?.x, 0) + parseNumber(object?.size?.width, 0) / 2,
  y: parseNumber(object?.position?.y, 0) + parseNumber(object?.size?.height, 0) / 2,
})
const getObjectBounds = (object) => {
  if (object?.type === 'connector') {
    const startX = parseNumber(object?.start?.x, 0)
    const startY = parseNumber(object?.start?.y, 0)
    const endX = parseNumber(object?.end?.x, startX)
    const endY = parseNumber(object?.end?.y, startY)
    return {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.max(1, Math.abs(endX - startX)),
      height: Math.max(1, Math.abs(endY - startY)),
    }
  }

  return {
    x: parseNumber(object?.position?.x, 0),
    y: parseNumber(object?.position?.y, 0),
    width: Math.max(1, parseNumber(object?.size?.width, 1)),
    height: Math.max(1, parseNumber(object?.size?.height, 1)),
  }
}

const getAutoStickyPosition = (state, size = STICKY_SHAPE_SIZES.rectangle) => {
  const stickyCount = state.filter((candidate) => candidate.type === 'stickyNote').length
  const width = Math.max(1, parseNumber(size?.width, 180))
  const height = Math.max(1, parseNumber(size?.height, 110))
  const columns = 5
  const gutterX = 28
  const gutterY = 26
  const startX = 120
  const startY = 120

  return {
    x: startX + (stickyCount % columns) * (width + gutterX),
    y: startY + Math.floor(stickyCount / columns) * (height + gutterY),
  }
}

const persistObjectToFirestore = async ({ boardId, objectId, payload, merge = false }) => {
  const ref = getObjectsRef(boardId).doc(objectId)
  if (merge) {
    await ref.set(payload, { merge: true })
  } else {
    await ref.set(payload)
  }
}

let writeObjectImpl = persistObjectToFirestore

const writeObject = async (args) => writeObjectImpl(args)

const commitObjectBatchWrites = async ({ boardId, objects }) => {
  if (!Array.isArray(objects) || objects.length === 0) {
    return
  }

  for (let index = 0; index < objects.length; index += FIRESTORE_BATCH_WRITE_LIMIT) {
    const chunk = objects.slice(index, index + FIRESTORE_BATCH_WRITE_LIMIT)
    const batch = db.batch()
    for (const object of chunk) {
      batch.set(getObjectsRef(boardId).doc(object.id), object)
    }
    await batch.commit()
  }
}

const buildStickyNotePayload = (ctx, args = {}) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const shapeType = normalizeShapeType(args.shapeType || args.type)
  const defaultSize = STICKY_SHAPE_SIZES[shapeType]
  const hasExplicitX = Number.isFinite(Number(args.x))
  const hasExplicitY = Number.isFinite(Number(args.y))
  let pos
  if (args.position) {
    pos = parsePosition(args.position, 80, 80)
  } else if (hasExplicitX || hasExplicitY) {
    pos = { x: parseNumber(args.x, 80), y: parseNumber(args.y, 80) }
  } else {
    pos = getAutoStickyPosition(ctx.state, defaultSize)
  }

  const zIndex = Number.isFinite(Number(args.zIndex)) ? Number(args.zIndex) : getNextZIndex(ctx.state)

  return {
    id,
    boardId: ctx.boardId,
    type: 'stickyNote',
    shapeType,
    position: { x: pos.x, y: pos.y },
    size: {
      width: parseNumber(args.width, defaultSize.width),
      height: parseNumber(args.height, defaultSize.height),
    },
    zIndex,
    text: sanitizeText(args.text || 'New sticky note'),
    color: toColor(args.color, '#fde68a'),
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }
}

const buildShapePayload = (ctx, args = {}) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const shapeType = normalizeShapeType(args.type || args.shapeType, 'rectangle')
  const defaultSize = STICKY_SHAPE_SIZES[shapeType] || { width: 220, height: 140 }
  const shapeText = sanitizeText(args.text || args.label || args.title || '')
  const pos = args.position
    ? parsePosition(args.position, 200, 200)
    : { x: parseNumber(args.x, 200), y: parseNumber(args.y, 200) }
  const zIndex = Number.isFinite(Number(args.zIndex)) ? Number(args.zIndex) : getNextZIndex(ctx.state)

  return {
    id,
    boardId: ctx.boardId,
    type: 'shape',
    shapeType,
    position: { x: pos.x, y: pos.y },
    size: {
      width: parseNumber(args.width, defaultSize.width),
      height: parseNumber(args.height, defaultSize.height),
    },
    zIndex,
    ...(shapeText ? { text: shapeText } : {}),
    color: toColor(args.color, '#93c5fd'),
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }
}

const createStickyNote = async (ctx, args) => {
  const sticky = buildStickyNotePayload(ctx, args)

  await writeObject({ boardId: ctx.boardId, objectId: sticky.id, payload: sticky })
  ctx.state.push(sticky)
  ctx.executedTools.push({ tool: 'createStickyNote', id: sticky.id })
  return sticky
}

const createShape = async (ctx, args) => {
  const shape = buildShapePayload(ctx, args)

  await writeObject({ boardId: ctx.boardId, objectId: shape.id, payload: shape })
  ctx.state.push(shape)
  ctx.executedTools.push({ tool: 'createShape', id: shape.id })
  return shape
}

const createFrame = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const parsedPosition = args.position ? parsePosition(args.position, 120, 120) : null
  const fallbackX = parsedPosition ? parsedPosition.x : 120
  const fallbackY = parsedPosition ? parsedPosition.y : 120
  const frame = {
    id,
    boardId: ctx.boardId,
    type: 'frame',
    title: sanitizeText(args.title || 'Frame'),
    color: '#e2e8f0',
    position: {
      x: parseNumber(args.x, fallbackX),
      y: parseNumber(args.y, fallbackY),
    },
    size: {
      width: parseNumber(args.width, 480),
      height: parseNumber(args.height, 300),
    },
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: frame })
  ctx.state.push(frame)
  ctx.executedTools.push({ tool: 'createFrame', id: frame.id })
  return frame
}

const createConnector = async (ctx, args) => {
  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const style = normalizeConnectorStyle(args.style)
  const fromObject = ctx.state.find((candidate) => candidate.id === args.fromId)
  const toObject = ctx.state.find((candidate) => candidate.id === args.toId)
  const start = fromObject
    ? getObjectCenter(fromObject)
    : {
        x: parseNumber(args.startX, parseNumber(args.x1, 180)),
        y: parseNumber(args.startY, parseNumber(args.y1, 180)),
      }
  const end = toObject
    ? getObjectCenter(toObject)
    : {
        x: parseNumber(args.endX, parseNumber(args.x2, start.x + 180)),
        y: parseNumber(args.endY, parseNumber(args.y2, start.y + 40)),
      }
  const bounds = toConnectorBounds(start, end)

  const connector = {
    id,
    boardId: ctx.boardId,
    type: 'connector',
    color: toColor(args.color, '#0f172a'),
    style,
    start,
    end,
    fromObjectId: fromObject?.id || null,
    toObjectId: toObject?.id || null,
    fromAnchor: null,
    toAnchor: null,
    ...bounds,
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: connector })
  ctx.state.push(connector)
  ctx.executedTools.push({
    tool: 'createConnector',
    id,
    fromId: args.fromId || null,
    toId: args.toId || null,
    style,
  })
  return connector
}

const moveObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    position: { x: parseNumber(args.x, object.position.x), y: parseNumber(args.y, object.position.y) },
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'moveObject', id: object.id })
  return object
}

const resizeObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    size: {
      width: parseNumber(args.width, object.size?.width || 180),
      height: parseNumber(args.height, object.size?.height || 110),
    },
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'resizeObject', id: object.id })
  return object
}

const updateText = async (ctx, args) => {
  const object = ctx.state.find(
    (candidate) =>
      candidate.id === args.objectId &&
      (candidate.type === 'stickyNote' || candidate.type === 'shape' || candidate.type === 'text'),
  )
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    text: sanitizeText(args.newText || object.text),
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'updateText', id: object.id })
  return object
}

const changeColor = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    color: toColor(args.color, object.color || '#e2e8f0'),
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'changeColor', id: object.id })
  return object
}

const createSwotTemplate = async (ctx) => {
  const startX = 100
  const startY = 100
  const boxW = 260
  const boxH = 180
  const gap = 24

  const labels = ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']
  const stagedObjects = []
  const stagedTools = []
  let zIndexCursor = getNextZIndex(ctx.state)

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const index = row * 2 + col
      const x = startX + col * (boxW + gap)
      const y = startY + row * (boxH + gap)
      const shape = buildShapePayload(ctx, {
        type: 'rectangle',
        x,
        y,
        width: boxW,
        height: boxH,
        color: '#dbeafe',
        zIndex: zIndexCursor,
      })
      zIndexCursor += 1
      const sticky = buildStickyNotePayload(ctx, {
        text: labels[index],
        x: x + 12,
        y: y + 12,
        color: '#ffffff',
        zIndex: zIndexCursor,
      })
      zIndexCursor += 1
      stagedObjects.push(shape, sticky)
      stagedTools.push({ tool: 'createShape', id: shape.id }, { tool: 'createStickyNote', id: sticky.id })
    }
  }

  await commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push(...stagedTools)
  ctx.executedTools.push({ tool: 'createSwotTemplate' })
}

const createRetrospectiveTemplate = async (ctx) => {
  const columns = ['What Went Well', "What Didn't", 'Action Items']
  const startX = 80
  const gap = 26
  const colW = 220
  const colH = 320
  const stagedObjects = []
  const stagedTools = []
  let zIndexCursor = getNextZIndex(ctx.state)

  for (let i = 0; i < columns.length; i += 1) {
    const x = startX + i * (colW + gap)
    const shape = buildShapePayload(ctx, {
      x,
      y: 110,
      width: colW,
      height: colH,
      color: '#dbeafe',
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    const sticky = buildStickyNotePayload(ctx, {
      text: columns[i],
      x: x + 10,
      y: 120,
      color: '#ffffff',
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    stagedObjects.push(shape, sticky)
    stagedTools.push({ tool: 'createShape', id: shape.id }, { tool: 'createStickyNote', id: sticky.id })
  }

  await commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push(...stagedTools)
  ctx.executedTools.push({ tool: 'createRetrospectiveTemplate' })
}

// Normalize rotation to 0-360 range
const normalizeRotationDegrees = (degrees) => {
  const normalized = degrees % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const rotateObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const nextRotation = normalizeRotationDegrees(parseNumber(args.angle, 0))
  const nextVersion = (object.version || 0) + 1
  const updatedAt = nowMs()
  const patch = {
    rotation: nextRotation,
    updatedAt,
    updatedBy: ctx.userId,
    version: nextVersion,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  ctx.executedTools.push({ tool: 'rotateObject', id: object.id, angle: nextRotation })
  return object
}

const deleteObject = async (ctx, args) => {
  const object = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!object) return null

  const updatedAt = nowMs()
  const patch = {
    deleted: true,
    deletedAt: updatedAt,
    deletedBy: ctx.userId,
    updatedAt,
    updatedBy: ctx.userId,
  }

  await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: patch, merge: true })
  Object.assign(object, patch)
  // Remove from state array
  const index = ctx.state.findIndex((o) => o.id === args.objectId)
  if (index !== -1) {
    ctx.state.splice(index, 1)
  }
  ctx.executedTools.push({ tool: 'deleteObject', id: object.id })
  return { id: object.id, deleted: true }
}

const duplicateObject = async (ctx, args) => {
  const source = ctx.state.find((candidate) => candidate.id === args.objectId)
  if (!source) return null

  const id = crypto.randomUUID()
  const now = nowMs()
  const zIndex = getNextZIndex(ctx.state)
  const offsetX = parseNumber(args.offsetX, 20)
  const offsetY = parseNumber(args.offsetY, 20)

  const duplicate = {
    ...source,
    id,
    boardId: ctx.boardId,
    position: {
      x: parseNumber(source.position?.x, 0) + offsetX,
      y: parseNumber(source.position?.y, 0) + offsetY,
    },
    zIndex,
    createdBy: ctx.userId,
    createdAt: now,
    updatedBy: ctx.userId,
    updatedAt: now,
    version: 1,
    // Clear connection-specific fields for connectors
    ...(source.type === 'connector' ? { fromObjectId: null, toObjectId: null } : {}),
  }

  await writeObject({ boardId: ctx.boardId, objectId: id, payload: duplicate })
  ctx.state.push(duplicate)
  ctx.executedTools.push({ tool: 'duplicateObject', id, sourceId: source.id })
  return duplicate
}

const arrangeGrid = async (ctx, objects) => {
  if (!objects.length) return

  const columns = Math.ceil(Math.sqrt(objects.length))
  const startX = 120
  const startY = 120
  const gapX = 220
  const gapY = 150

  for (let i = 0; i < objects.length; i += 1) {
    const row = Math.floor(i / columns)
    const col = i % columns
    await moveObject(ctx, {
      objectId: objects[i].id,
      x: startX + col * gapX,
      y: startY + row * gapY,
    })
  }

  ctx.executedTools.push({ tool: 'arrangeGrid', count: objects.length })
}

const createStickyGridTemplate = async (ctx, args = {}) => {
  const rows = Math.min(6, Math.max(1, parseNumber(args.rows, 2)))
  const columns = Math.min(6, Math.max(1, parseNumber(args.columns, 3)))
  const total = rows * columns
  const startX = 120
  const startY = 120
  const gapX = 220
  const gapY = 150
  const stagedObjects = []
  const stagedTools = []
  let zIndexCursor = getNextZIndex(ctx.state)
  const labels = String(args.labelText || '')
    .split(/\s*(?:,|\/|\|)\s*|\s+and\s+/i)
    .map((entry) => sanitizeText(entry))
    .filter(Boolean)

  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / columns)
    const column = index % columns
    const label =
      labels.length > 0
        ? labels[index % labels.length]
        : `R${row + 1}C${column + 1}`

    const sticky = buildStickyNotePayload(ctx, {
      text: label,
      x: startX + column * gapX,
      y: startY + row * gapY,
      color: '#fde68a',
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    stagedObjects.push(sticky)
    stagedTools.push({ tool: 'createStickyNote', id: sticky.id })
  }

  await commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push(...stagedTools)
  ctx.executedTools.push({ tool: 'createStickyGridTemplate', rows, columns, count: total })
}

const createJourneyMap = async (ctx, stages) => {
  const count = Math.min(10, Math.max(3, stages))
  const startX = 80
  const y = 420
  const gap = 190
  const stagedObjects = []
  const stagedTools = []
  let zIndexCursor = getNextZIndex(ctx.state)

  for (let i = 0; i < count; i += 1) {
    const shape = buildShapePayload(ctx, {
      x: startX + i * gap,
      y,
      width: 160,
      height: 100,
      color: '#bfdbfe',
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    const sticky = buildStickyNotePayload(ctx, {
      text: `Stage ${i + 1}`,
      x: startX + i * gap + 12,
      y: y + 12,
      color: '#ffffff',
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    stagedObjects.push(shape, sticky)
    stagedTools.push({ tool: 'createShape', id: shape.id }, { tool: 'createStickyNote', id: sticky.id })
  }

  await commitObjectBatchWrites({ boardId: ctx.boardId, objects: stagedObjects })
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push(...stagedTools)
  ctx.executedTools.push({ tool: 'createJourneyMap', count })
}

const organizeBoardByType = async (ctx) => {
  const movable = ctx.state.filter((item) => item.type !== 'connector')
  if (movable.length === 0) {
    ctx.executedTools.push({ tool: 'organizeBoardByType', count: 0 })
    return
  }

  const groups = {
    frame: movable.filter((item) => item.type === 'frame'),
    shape: movable.filter((item) => item.type === 'shape'),
    sticky: movable.filter((item) => item.type === 'stickyNote'),
  }
  const orderedGroups = [groups.frame, groups.shape, groups.sticky].filter((group) => group.length > 0)
  const startX = 80
  const startY = 90
  const colGap = 280
  const rowGap = 160

  for (let col = 0; col < orderedGroups.length; col += 1) {
    const group = orderedGroups[col]
    for (let row = 0; row < group.length; row += 1) {
      const object = group[row]
      await moveObject(ctx, {
        objectId: object.id,
        x: startX + col * colGap,
        y: startY + row * rowGap,
      })
    }
  }

  ctx.executedTools.push({ tool: 'organizeBoardByType', count: movable.length })
}

const organizeBoardByColor = async (ctx) => {
  const movable = ctx.state.filter((item) => item.type !== 'connector' && item.color)
  if (movable.length === 0) {
    ctx.executedTools.push({ tool: 'organizeBoardByColor', count: 0, groups: 0 })
    return
  }

  const groups = new Map()
  for (const item of movable) {
    const colorKey = String(toColor(item.color, item.color)).toLowerCase().trim()
    if (!groups.has(colorKey)) {
      groups.set(colorKey, [])
    }
    groups.get(colorKey).push(item)
  }

  const orderedGroups = Array.from(groups.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, items]) =>
      items.slice().sort((left, right) => {
        const yDelta = parseNumber(left.position?.y, 0) - parseNumber(right.position?.y, 0)
        if (yDelta !== 0) return yDelta
        return parseNumber(left.position?.x, 0) - parseNumber(right.position?.x, 0)
      }),
    )

  const startX = 80
  const startY = 90
  const colGap = 260
  const rowGap = 150

  for (let col = 0; col < orderedGroups.length; col += 1) {
    const group = orderedGroups[col]
    for (let row = 0; row < group.length; row += 1) {
      const object = group[row]
      await moveObject(ctx, {
        objectId: object.id,
        x: startX + col * colGap,
        y: startY + row * rowGap,
      })
    }
  }

  ctx.executedTools.push({ tool: 'organizeBoardByColor', count: movable.length, groups: orderedGroups.length })
}

const spaceElementsEvenly = async (ctx, objects) => {
  const movable = (objects || ctx.state).filter((item) => item.type !== 'connector')
  if (movable.length < 3) {
    ctx.executedTools.push({ tool: 'spaceElementsEvenly', count: movable.length })
    return
  }

  const ordered = [...movable].sort((left, right) => left.position.x - right.position.x)
  const firstX = ordered[0].position.x
  const lastX = ordered[ordered.length - 1].position.x
  const step = (lastX - firstX) / (ordered.length - 1 || 1)

  for (let index = 0; index < ordered.length; index += 1) {
    const object = ordered[index]
    await moveObject(ctx, {
      objectId: object.id,
      x: Math.round(firstX + step * index),
      y: object.position.y,
    })
  }

  ctx.executedTools.push({ tool: 'spaceElementsEvenly', count: ordered.length })
}

const resizeFrameToFitContents = async (ctx, args = {}) => {
  const frame = ctx.state.find((item) => item.type === 'frame' && (!args.frameId || item.id === args.frameId))
  if (!frame) {
    ctx.executedTools.push({ tool: 'resizeFrameToFitContents', count: 0 })
    return null
  }

  const members = ctx.state.filter(
    (item) => item.id !== frame.id && item.type !== 'connector' && item.type !== 'frame' && item.frameId === frame.id,
  )
  if (members.length === 0) {
    ctx.executedTools.push({ tool: 'resizeFrameToFitContents', count: 0 })
    return frame
  }

  const padding = 24
  const bounds = members.map((member) => getObjectBounds(member))
  const minX = Math.min(...bounds.map((item) => item.x))
  const minY = Math.min(...bounds.map((item) => item.y))
  const maxX = Math.max(...bounds.map((item) => item.x + item.width))
  const maxY = Math.max(...bounds.map((item) => item.y + item.height))
  const patch = {
    position: { x: minX - padding, y: minY - padding },
    size: {
      width: Math.max(160, maxX - minX + padding * 2),
      height: Math.max(120, maxY - minY + padding * 2),
    },
    updatedAt: nowMs(),
    updatedBy: ctx.userId,
    version: (frame.version || 0) + 1,
  }

  await writeObject({ boardId: ctx.boardId, objectId: frame.id, payload: patch, merge: true })
  Object.assign(frame, patch)
  ctx.executedTools.push({ tool: 'resizeFrameToFitContents', id: frame.id, count: members.length })
  return frame
}

const synthesizeStickyThemes = async (ctx) => {
  const stickyNotes = ctx.state.filter((item) => item.type === 'stickyNote')
  if (stickyNotes.length === 0) {
    ctx.executedTools.push({ tool: 'synthesizeStickyThemes', count: 0 })
    return
  }

  const themeMap = new Map()
  for (const sticky of stickyNotes) {
    const firstWord = sanitizeText(sticky.text)
      .toLowerCase()
      .split(/\W+/)
      .find((token) => token.length > 2)
    const key = firstWord || 'general'
    if (!themeMap.has(key)) {
      themeMap.set(key, [])
    }
    themeMap.get(key).push(sticky)
  }

  const topThemes = Array.from(themeMap.entries())
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)

  const startX = 920
  const startY = 120
  const gapY = 180

  for (let i = 0; i < topThemes.length; i += 1) {
    const [theme, entries] = topThemes[i]
    await createFrame(ctx, {
      x: startX,
      y: startY + i * gapY,
      width: 260,
      height: 150,
      title: `Theme: ${theme}`,
    })
    await createStickyNote(ctx, {
      text: `${entries.length} notes mention "${theme}"`,
      x: startX + 16,
      y: startY + i * gapY + 44,
      color: '#ffffff',
    })
  }

  ctx.executedTools.push({ tool: 'synthesizeStickyThemes', count: topThemes.length })
}

const resolveMovableObjectsForOperation = (ctx, args = {}) => {
  const requestedIds =
    Array.isArray(args.objectIds) && args.objectIds.length > 0
      ? new Set(args.objectIds.map((entry) => String(entry || '').trim()).filter(Boolean))
      : null

  return ctx.state.filter((item) => {
    if (item.type === 'connector') {
      return false
    }
    if (!requestedIds) {
      return true
    }
    return requestedIds.has(item.id)
  })
}

const executeLlmToolCall = async (ctx, toolName, rawArgs, options = {}) => {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}
  const batchContext = options.batchContext || null

  switch (toolName) {
    case 'createStickyNote': {
      const positionedArgs = resolveLlmCreateArgsWithPlacement(
        toolName,
        args,
        ctx.commandPlacement,
        batchContext,
      )
      await createStickyNote(ctx, {
        text: positionedArgs.text || 'New sticky note',
        shapeType: positionedArgs.shapeType || 'rectangle',
        color: toColor(positionedArgs.color, '#fde68a'),
        position: positionedArgs.position,
        x: positionedArgs.x,
        y: positionedArgs.y,
        width: positionedArgs.width,
        height: positionedArgs.height,
      })
      return
    }
    case 'createShape': {
      const positionedArgs = resolveLlmCreateArgsWithPlacement(
        toolName,
        args,
        ctx.commandPlacement,
        batchContext,
      )
      await createShape(ctx, {
        type: positionedArgs.type || 'rectangle',
        text: sanitizeText(positionedArgs.text || positionedArgs.label || positionedArgs.title || ''),
        color: toColor(positionedArgs.color, '#93c5fd'),
        position: positionedArgs.position,
        x: positionedArgs.x,
        y: positionedArgs.y,
        width: positionedArgs.width,
        height: positionedArgs.height,
      })
      return
    }
    case 'createFrame': {
      const positionedArgs = resolveLlmCreateArgsWithPlacement(
        toolName,
        args,
        ctx.commandPlacement,
        batchContext,
      )
      await createFrame(ctx, {
        title: sanitizeText(positionedArgs.title || 'New Frame'),
        width: parseNumber(positionedArgs.width, 480),
        height: parseNumber(positionedArgs.height, 300),
        x: parseNumber(positionedArgs.x, 120),
        y: parseNumber(positionedArgs.y, 120),
      })
      return
    }
    case 'createConnector':
      await createConnector(ctx, {
        fromId: args.fromId,
        toId: args.toId,
        color: toColor(args.color, '#0f172a'),
        style: args.style,
      })
      return
    case 'moveObject':
      await moveObject(ctx, {
        objectId: args.objectId,
        x: parseNumber(args.x, 0),
        y: parseNumber(args.y, 0),
      })
      return
    case 'resizeObject':
      await resizeObject(ctx, {
        objectId: args.objectId,
        width: args.width,
        height: args.height,
      })
      return
    case 'updateText':
      await updateText(ctx, {
        objectId: args.objectId,
        newText: args.newText || args.text || '',
      })
      return
    case 'changeColor':
      await changeColor(ctx, {
        objectId: args.objectId,
        color: args.color,
      })
      return
    case 'getBoardState':
      ctx.state = await getBoardState(ctx.boardId)
      return
    case 'organizeBoardByColor':
      await organizeBoardByColor(ctx)
      return
    case 'organizeBoardByType':
      await organizeBoardByType(ctx)
      return
    case 'arrangeGrid': {
      const stickyNotes = ctx.state.filter((item) => item.type === 'stickyNote')
      await arrangeGrid(ctx, stickyNotes)
      return
    }
    case 'createStickyGridTemplate':
      await createStickyGridTemplate(ctx, {
        rows: parseNumber(args.rows, 2),
        columns: parseNumber(args.columns, 3),
        labelText: sanitizeText(args.labelText || ''),
      })
      return
    case 'spaceElementsEvenly': {
      const movable = resolveMovableObjectsForOperation(ctx, args)
      await spaceElementsEvenly(ctx, movable)
      return
    }
    case 'createJourneyMap':
      await createJourneyMap(ctx, parseNumber(args.stages, 5))
      return
    case 'createSwotTemplate':
      await createSwotTemplate(ctx)
      return
    case 'createRetrospectiveTemplate':
      await createRetrospectiveTemplate(ctx)
      return
    case 'rotateObject':
      await rotateObject(ctx, args)
      return
    case 'deleteObject':
      await deleteObject(ctx, args)
      return
    case 'duplicateObject':
      await duplicateObject(ctx, args)
      return
    case 'executeBatch':
      await executeBatchTool(ctx, args)
      return
    default:
      throw new Error(`Unknown tool requested by LLM: ${toolName}`)
  }
}

const executeBatchTool = async (ctx, args = {}) => {
  const operations = toBatchOperations(args)
  if (operations.length === 0) {
    return { count: 0 }
  }

  const stickyOperationCount = operations.filter((operation) => operation.tool === 'createStickyNote').length
  let stickyOperationIndex = 0

  for (const operation of operations) {
    const batchContext =
      operation.tool === 'createStickyNote' && stickyOperationCount > 1
        ? { index: stickyOperationIndex, total: stickyOperationCount }
        : null
    if (operation.tool === 'createStickyNote') {
      stickyOperationIndex += 1
    }
    await executeLlmToolCall(ctx, operation.tool, operation.args, { batchContext })
  }

  return { count: operations.length }
}

const createBusinessModelCanvas = async (ctx, spec = {}) => {
  const anchor = resolvePlacementAnchor(ctx.commandPlacement) || { x: 640, y: 360 }
  logAiDebug('create_business_model_canvas', {
    boardId: ctx.boardId,
    topic: spec.topic || 'AI assistant product',
    anchor,
    includeExamples: Boolean(spec.includeExamples),
    includeChannelExamples: Boolean(spec.includeChannelExamples),
    includeRevenueExamples: Boolean(spec.includeRevenueExamples),
  })
  const width = STICKY_SHAPE_SIZES.rectangle.width
  const height = STICKY_SHAPE_SIZES.rectangle.height
  const gapX = width + 54
  const gapY = height + 42
  let zIndexCursor = getNextZIndex(ctx.state)
  const stagedObjects = []
  const stagedTools = []

  for (const section of BMC_SECTION_LAYOUT) {
    const centerX = anchor.x + (section.col - 1) * gapX
    const centerY = anchor.y + (section.row - 1) * gapY
    const sticky = buildStickyNotePayload(ctx, {
      text: buildBusinessModelCanvasSectionText({
        title: section.title,
        topic: spec.topic || 'AI assistant product',
        key: section.key,
        includeExamples:
          spec.includeExamples ||
          (section.key === 'channels' && spec.includeChannelExamples) ||
          (section.key === 'revenueStreams' && spec.includeRevenueExamples),
      }),
      shapeType: 'rectangle',
      color: section.color,
      x: Math.round(centerX - width / 2),
      y: Math.round(centerY - height / 2),
      zIndex: zIndexCursor,
    })
    zIndexCursor += 1
    stagedObjects.push(sticky)
    stagedTools.push({ tool: 'createStickyNote', id: sticky.id, bmcSection: section.key })
  }

  for (const object of stagedObjects) {
    await writeObject({ boardId: ctx.boardId, objectId: object.id, payload: object })
  }
  ctx.state.push(...stagedObjects)
  ctx.executedTools.push(...stagedTools)
  ctx.executedTools.push({
    tool: 'createBusinessModelCanvas',
    topic: spec.topic || 'AI assistant product',
    count: stagedObjects.length,
  })
  return { count: stagedObjects.length }
}

const createWorkflowFlowchart = async (ctx, spec = {}) => {
  const anchor = resolvePlacementAnchor(ctx.commandPlacement) || { x: 640, y: 360 }
  const nodes = buildWorkflowFlowchartNodes(spec)
  if (nodes.length === 0) {
    return { nodeCount: 0, connectorCount: 0 }
  }

  const columns = 3
  const rows = Math.ceil(nodes.length / columns)
  const gapX = 280
  const gapY = 200
  const createdShapes = []

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const shapeType = normalizeShapeType(node.shapeType || 'rectangle', 'rectangle')
    const size = STICKY_SHAPE_SIZES[shapeType] || STICKY_SHAPE_SIZES.rectangle
    const row = Math.floor(index / columns)
    const col = index % columns
    const remainingInRow = nodes.length - row * columns
    const rowItemCount = Math.min(columns, Math.max(1, remainingInRow))
    const colOffset = col - (rowItemCount - 1) / 2
    const rowOffset = row - (rows - 1) / 2
    const x = Math.round(anchor.x + colOffset * gapX - size.width / 2)
    const y = Math.round(anchor.y + rowOffset * gapY - size.height / 2)

    const createdShape = await createShape(ctx, {
      type: shapeType,
      text: node.text,
      color: node.color || (shapeType === 'diamond' ? '#fef3c7' : '#dbeafe'),
      x,
      y,
      width: size.width,
      height: size.height,
    })

    createdShapes.push(createdShape)
  }

  for (let index = 0; index < createdShapes.length - 1; index += 1) {
    await createConnector(ctx, {
      fromId: createdShapes[index].id,
      toId: createdShapes[index + 1].id,
      style: 'arrow',
      color: '#0f172a',
    })
  }

  ctx.executedTools.push({
    tool: 'createWorkflowFlowchart',
    topic: spec.topic || 'workflow process',
    nodeCount: createdShapes.length,
    connectorCount: Math.max(0, createdShapes.length - 1),
  })

  return {
    nodeCount: createdShapes.length,
    connectorCount: Math.max(0, createdShapes.length - 1),
  }
}

const executeParsedToolCalls = async (ctx, toolCalls = []) => {
  for (const toolCall of toolCalls) {
    if (toolCall.parseError) {
      throw new Error(`Failed to parse tool call arguments for ${toolCall.name}`)
    }

    console.log('LLM tool call:', toolCall.name, toolCall.arguments)

    await executeLlmToolCall(ctx, toolCall.name, toolCall.arguments)

    ctx.executedTools.push({
      tool: toolCall.name,
      llmGenerated: true,
      args: toolCall.arguments,
    })
  }
}

const countPlannedStickyOperations = (toolCalls = []) => {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return 0
  }

  let planned = 0
  for (const toolCall of toolCalls) {
    const toolName = typeof toolCall?.name === 'string' ? toolCall.name : ''
    if (toolName === 'createStickyNote') {
      planned += 1
      continue
    }

    if (toolName !== 'executeBatch') {
      continue
    }

    const operations = toBatchOperations(toolCall.arguments)
    planned += operations.filter((operation) => operation.tool === 'createStickyNote').length
  }

  return planned
}

const getRemainingAiLatencyBudgetMs = (ctx) => {
  const startedAt = Number(ctx?.commandStartedAtMs)
  const safeStartedAt = Number.isFinite(startedAt) ? startedAt : nowMs()
  return Math.max(0, AI_RESPONSE_TARGET_MS - (nowMs() - safeStartedAt))
}

const runCommandPlan = async (ctx, command) => {
  const normalizedCommand = normalizeCommandForPlan(command)
  if (!Number.isFinite(Number(ctx.commandStartedAtMs))) {
    ctx.commandStartedAtMs = nowMs()
  }
  logAiDebug('run_command_plan_start', {
    boardId: ctx.boardId,
    command: normalizedCommand,
  })
  const bmcCommand = parseBusinessModelCanvasCommand(normalizedCommand)
  if (bmcCommand) {
    logAiDebug('run_command_plan_route_bmc', {
      boardId: ctx.boardId,
      topic: bmcCommand.topic,
      includeExamples: bmcCommand.includeExamples,
      includeChannelExamples: bmcCommand.includeChannelExamples,
      includeRevenueExamples: bmcCommand.includeRevenueExamples,
    })
    const bmcResult = await createBusinessModelCanvas(ctx, bmcCommand)
    if (bmcResult.count > 0) {
      const successMessage = 'Created Business Model Canvas on the board.'
      return {
        message: successMessage,
        aiResponse: successMessage,
      }
    }
  }

  const workflowCommand = parseWorkflowFlowchartCommand(normalizedCommand)
  if (workflowCommand) {
    const workflowResult = await createWorkflowFlowchart(ctx, workflowCommand)
    if (workflowResult.nodeCount > 0) {
      const successMessage = 'Created workflow flowchart on the board.'
      return {
        message: successMessage,
        aiResponse: successMessage,
      }
    }
  }

  if (!glmClient) {
    return {
      message: AI_TEMP_UNAVAILABLE_MESSAGE,
      aiResponse: AI_TEMP_UNAVAILABLE_MESSAGE,
      level: 'warning',
    }
  }

  try {
    logAiDebug('run_command_plan_route_llm', {
      boardId: ctx.boardId,
      command: normalizedCommand,
    })
    return await executeViaLLM(ctx, normalizedCommand)
  } catch (llmError) {
    console.error('LLM-first execution failed:', llmError)
    if (String(llmError?.message || '').toLowerCase().includes('latency budget')) {
      const latencyWarningMessage = 'AI command exceeded the 2-second response target. Retry with a shorter command.'
      return {
        message: latencyWarningMessage,
        aiResponse: latencyWarningMessage,
        level: 'warning',
      }
    }
    return {
      message: AI_TEMP_UNAVAILABLE_MESSAGE,
      aiResponse: AI_TEMP_UNAVAILABLE_MESSAGE,
      level: 'warning',
    }
  }
}

/**
 * Execute a command via GLM-5 LLM with tool calling
 * @param {object} ctx - Execution context { state, boardId, userId, executedTools }
 * @param {string} command - Normalized user command
 * @returns {Promise<{message?: string, aiResponse?: string} | null>}
 */
const executeViaLLM = async (ctx, command) => {
  console.log('Executing command via LLM:', command)

  const boardContext = {
    state: ctx.state,
    boardId: ctx.boardId,
    commandPlacement: ctx.commandPlacement,
  }
  const baselineObjectIds = new Set(ctx.state.map((item) => item?.id).filter(Boolean))
  const baselineMutationToken = buildBoardMutationToken(ctx.state)
  const boardMutationIntent = isLikelyBoardMutationCommand(command)

  const requestLlmPass = async (commandText) => {
    const remainingBudgetMs = getRemainingAiLatencyBudgetMs(ctx)
    if (remainingBudgetMs < AI_MIN_PROVIDER_TIMEOUT_MS) {
      throw new Error('AI latency budget exhausted before model call.')
    }

    const providerTimeoutMs = Math.max(AI_MIN_PROVIDER_TIMEOUT_MS, remainingBudgetMs - 120)
    const glmResponse = await glmClient.callGLM(commandText, boardContext, {
      timeoutMs: providerTimeoutMs,
    })
    const toolCalls = glmClient.parseToolCalls(glmResponse)
    const textResponse = sanitizeAiAssistantResponse(glmClient.getTextResponse(glmResponse))
    return { glmResponse, toolCalls, textResponse }
  }

  let llmPass = await requestLlmPass(command)
  let expectedStickyCount = countPlannedStickyOperations(llmPass.toolCalls)

  if (llmPass.toolCalls.length === 0 && boardMutationIntent) {
    const retryCommand = buildCompoundToolRetryCommand(command, llmPass.textResponse)
    const retryPass = await requestLlmPass(retryCommand)
    if (retryPass.toolCalls.length > 0 || retryPass.textResponse) {
      llmPass = retryPass
      expectedStickyCount = countPlannedStickyOperations(llmPass.toolCalls)
    }
  }

  if (llmPass.toolCalls.length === 0) {
    const assistantMessage = llmPass.textResponse || OUT_OF_SCOPE_AI_MESSAGE
    ctx.executedTools.push({
      tool: 'assistantResponse',
      llmGenerated: true,
      outOfScope: assistantMessage === OUT_OF_SCOPE_AI_MESSAGE,
      ...(llmPass.textResponse ? { modelText: llmPass.textResponse } : {}),
    })
    const noMutationWarning =
      boardMutationIntent && buildBoardMutationToken(ctx.state) === baselineMutationToken
        ? { level: 'warning' }
        : {}
    return {
      message: assistantMessage,
      aiResponse: assistantMessage,
      ...(assistantMessage === OUT_OF_SCOPE_AI_MESSAGE ? { level: 'warning' } : noMutationWarning),
    }
  }

  await executeParsedToolCalls(ctx, llmPass.toolCalls)
  let boardMutationApplied = buildBoardMutationToken(ctx.state) !== baselineMutationToken

  if (boardMutationIntent && !boardMutationApplied && expectedStickyCount === 0) {
    const noMutationRetryCommand = buildNoMutationRetryCommand(command, llmPass.textResponse)
      const noMutationRetryPass = await requestLlmPass(noMutationRetryCommand)
      if (noMutationRetryPass.toolCalls.length > 0) {
        await executeParsedToolCalls(ctx, noMutationRetryPass.toolCalls)
        boardMutationApplied = buildBoardMutationToken(ctx.state) !== baselineMutationToken
        expectedStickyCount = Math.max(expectedStickyCount, countPlannedStickyOperations(noMutationRetryPass.toolCalls))
      }
      if (noMutationRetryPass.textResponse) {
        llmPass = noMutationRetryPass
    }
  }

  if (expectedStickyCount > 0) {
    const createdStickyCount = countCreatedStickyNotesSinceBaseline(ctx, baselineObjectIds)
    if (createdStickyCount < expectedStickyCount) {
      const shortfallCommand = buildStickyShortfallRetryCommand(command, {
        requested: expectedStickyCount,
        created: createdStickyCount,
        remaining: expectedStickyCount - createdStickyCount,
      })
      const recoveryPass = await requestLlmPass(shortfallCommand)
      if (recoveryPass.toolCalls.length > 0) {
        await executeParsedToolCalls(ctx, recoveryPass.toolCalls)
      }
      if (recoveryPass.textResponse) {
        llmPass = recoveryPass
      }
      boardMutationApplied = buildBoardMutationToken(ctx.state) !== baselineMutationToken
    } else {
      boardMutationApplied = true
    }
  }

  if (boardMutationIntent && !boardMutationApplied) {
    const assistantMessage =
      llmPass.textResponse ||
      "I couldn't apply that command to the board. Please retry with explicit board actions."
    ctx.executedTools.push({
      tool: 'assistantResponse',
      llmGenerated: true,
      noMutation: true,
      ...(llmPass.textResponse ? { modelText: llmPass.textResponse } : {}),
    })
    return {
      message: assistantMessage,
      aiResponse: assistantMessage,
      level: 'warning',
    }
  }

  console.log('LLM execution completed, tools executed:', llmPass.toolCalls.length)
  return llmPass.textResponse
    ? {
        message: llmPass.textResponse,
        aiResponse: llmPass.textResponse,
      }
    : null
}

const reserveQueueSequence = async (boardId) => {
  const lockRef = getSystemRef(boardId)

  const sequence = await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef)
    const lockData = lockSnap.exists ? lockSnap.data() : null
    const nextSequence = parseNumber(lockData?.nextSequence, 1)
    const processingSequence = parseNumber(lockData?.processingSequence, 1)

    tx.set(
      lockRef,
      {
        nextSequence: nextSequence + 1,
        processingSequence,
        updatedAt: nowMs(),
      },
      { merge: true },
    )

    return nextSequence
  })

  return sequence
}

const acquireBoardLock = async (boardId, commandId, queueSequence) => {
  const lockRef = getSystemRef(boardId)
  const deadlineMs = nowMs() + AI_LOCK_WAIT_TIMEOUT_MS

  while (nowMs() <= deadlineMs) {
    const acquired = await db.runTransaction(async (tx) => {
      const now = nowMs()
      const lockSnap = await tx.get(lockRef)
      const lockData = lockSnap.exists ? lockSnap.data() : null
      const activeCommandId = lockData?.activeCommandId || null
      const expiresAt = lockData?.expiresAt || 0
      const processingSequence = parseNumber(lockData?.processingSequence, 1)

      if (processingSequence !== queueSequence) {
        return false
      }

      if (activeCommandId && expiresAt > now && activeCommandId !== commandId) {
        return false
      }

      tx.set(
        lockRef,
        {
          activeCommandId: commandId,
          expiresAt: now + AI_LOCK_TTL_MS,
          updatedAt: now,
        },
        { merge: true },
      )

      return true
    })

    if (acquired) {
      return
    }

    await sleep(AI_LOCK_RETRY_INTERVAL_MS)
  }

  throw new Error('AI command queue timeout. Retry in a moment.')
}

const releaseBoardLock = async (boardId, commandId, queueSequence = null) => {
  const lockRef = getSystemRef(boardId)

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef)
    if (!lockSnap.exists) return

    const lockData = lockSnap.data()
    if (lockData?.activeCommandId !== commandId) return

    const processingSequence = parseNumber(lockData?.processingSequence, 1)
    const nextProcessingSequence =
      queueSequence === null ? processingSequence : Math.max(processingSequence, queueSequence + 1)

    tx.set(
      lockRef,
      {
        activeCommandId: null,
        expiresAt: 0,
        processingSequence: nextProcessingSequence,
        updatedAt: nowMs(),
      },
      { merge: true },
    )
  })
}

const startBoardLockHeartbeat = ({
  boardId,
  commandId,
  queueSequence,
  intervalMs = 5_000,
  ttlMs = AI_LOCK_TTL_MS,
}) => {
  const lockRef = getSystemRef(boardId)
  let active = true

  const timer = setInterval(async () => {
    if (!active) {
      return
    }

    try {
      await db.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef)
        if (!lockSnap.exists) {
          return
        }

        const lockData = lockSnap.data()
        const processingSequence = parseNumber(lockData?.processingSequence, 1)
        if (lockData?.activeCommandId !== commandId || processingSequence !== queueSequence) {
          return
        }

        tx.set(
          lockRef,
          {
            expiresAt: nowMs() + ttlMs,
            updatedAt: nowMs(),
          },
          { merge: true },
        )
      })
    } catch (heartbeatError) {
      console.warn('AI lock heartbeat refresh failed', {
        boardId,
        commandId,
        error: heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError),
      })
    }
  }, intervalMs)

  if (typeof timer.unref === 'function') {
    timer.unref()
  }

  return () => {
    active = false
    clearInterval(timer)
  }
}

exports.api = onRequest({ timeoutSeconds: 120, cors: true }, async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value))

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const isAiCommandRoute = req.path.endsWith('/ai/command')
  const isBoardShareRoute = req.path.endsWith('/boards/share')
  if (!isAiCommandRoute && !isBoardShareRoute) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  let boardIdForError = ''
  let clientCommandIdForError = ''
  let queueSequenceForError = null
  let commandForError = ''
  let stopLockHeartbeat = () => {}

  try {
    const authHeader = String(req.headers.authorization || '')
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization bearer token' })
      return
    }

    const idToken = authHeader.slice('Bearer '.length).trim()
    let decodedToken
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken)
    } catch (verifyError) {
      console.warn('Bearer token verification failed', verifyError)
      res.status(401).json({ error: 'Invalid or expired bearer token' })
      return
    }

    const boardId = String(req.body?.boardId || '').trim()
    const userId = decodedToken.uid

    if (!boardId) {
      res.status(400).json({ error: 'boardId is required' })
      return
    }

    if (isBoardShareRoute) {
      const action = String(req.body?.action || 'share').trim().toLowerCase()
      const roleInput = String(req.body?.role || 'edit').trim().toLowerCase()
      const requestedRole = roleInput === 'view' ? 'view' : roleInput === 'edit' ? 'edit' : null
      const requestedLinkRole = normalizeLinkAccessRole(req.body?.linkRole)
      const boardRef = getBoardRef(boardId)

      if (action === 'request-access' || action === 'request_access') {
        const boardSnapshot = await boardRef.get()
        if (!boardSnapshot.exists) {
          res.status(404).json({ error: 'Board not found' })
          return
        }

        const boardMeta = normalizeBoardMeta(boardId, boardSnapshot.data())
        if (!boardMeta.ownerId) {
          res.status(404).json({ error: 'Board not found' })
          return
        }
        if (canUserAccessBoard(boardMeta, userId)) {
          res.status(200).json({ status: 'success', boardId, message: 'You already have access to this board.' })
          return
        }

        await boardRef.collection('accessRequests').doc(userId).set(
          {
            userId,
            email: String(decodedToken.email || '').trim().toLowerCase(),
            role: requestedRole || 'edit',
            status: 'pending',
            requestedAt: nowMs(),
            updatedAt: nowMs(),
          },
          { merge: true },
        )

        res.status(200).json({
          status: 'success',
          boardId,
          message: 'Access request sent to board owner.',
        })
        return
      }

      const accessResult = await ensureBoardAccess({ boardId, userId, createIfMissing: false })
      if (!accessResult.ok) {
        res.status(accessResult.status || 403).json({ error: accessResult.reason || 'Access denied' })
        return
      }

      const boardMeta = accessResult.boardMeta
      if (!boardMeta || boardMeta.ownerId !== userId) {
        res.status(403).json({ error: 'Only board owner can manage sharing' })
        return
      }
      if (action === 'set-link-access' || action === 'set_link_access' || action === 'link-access') {
        await (accessResult.boardRef || boardRef).set(
          {
            ownerId: boardMeta.ownerId,
            linkAccessRole: requestedLinkRole,
            updatedBy: userId,
            updatedAt: nowMs(),
          },
          { merge: true },
        )

        res.status(200).json({
          status: 'success',
          boardId,
          linkAccessRole: requestedLinkRole,
          message:
            requestedLinkRole === 'restricted'
              ? 'Link sharing disabled.'
              : `Anyone with link can ${requestedLinkRole}.`,
        })
        return
      }

      let collaboratorId = ''
      try {
        collaboratorId = await resolveCollaboratorId({
          email: req.body?.email,
          userId: req.body?.userId,
        })
      } catch (resolveError) {
        const message = resolveError instanceof Error ? resolveError.message : 'Invalid collaborator'
        res.status(400).json({ error: message })
        return
      }
      if (!collaboratorId || collaboratorId === boardMeta.ownerId) {
        res.status(400).json({ error: 'Invalid collaborator' })
        return
      }
      if ((action === 'share' || action === 'add' || action === 'approve-request') && !requestedRole) {
        res.status(400).json({ error: 'Invalid role. Use "edit" or "view".' })
        return
      }

      const boardRefForShare = accessResult.boardRef || boardRef
      let nextSharedWith = []
      let normalizedSharedRoles = {}
      let nextLinkAccessRole = boardMeta.linkAccessRole || 'restricted'

      try {
        await db.runTransaction(async (tx) => {
          const latestBoardSnapshot = await tx.get(boardRefForShare)
          if (!latestBoardSnapshot.exists) {
            const missingBoardError = new Error('Board not found')
            missingBoardError.httpStatus = 404
            throw missingBoardError
          }

          const latestBoardMeta = normalizeBoardMeta(boardId, latestBoardSnapshot.data())
          if (!latestBoardMeta.ownerId || latestBoardMeta.ownerId !== userId) {
            const ownerError = new Error('Only board owner can manage sharing')
            ownerError.httpStatus = 403
            throw ownerError
          }

          const sharedWithSet = new Set(latestBoardMeta.sharedWith)
          const nextSharedRoles = { ...(latestBoardMeta.sharedRoles || {}) }
          if (action === 'revoke' || action === 'remove') {
            sharedWithSet.delete(collaboratorId)
            delete nextSharedRoles[collaboratorId]
          } else {
            sharedWithSet.add(collaboratorId)
            nextSharedRoles[collaboratorId] = requestedRole || 'edit'
          }

          nextSharedWith = [...sharedWithSet]
          normalizedSharedRoles = normalizeSharedRoles(nextSharedRoles, nextSharedWith)
          nextLinkAccessRole = latestBoardMeta.linkAccessRole || 'restricted'

          tx.set(
            boardRefForShare,
            {
              ownerId: latestBoardMeta.ownerId,
              linkAccessRole: nextLinkAccessRole,
              sharedWith: nextSharedWith,
              sharedRoles: normalizedSharedRoles,
              updatedBy: userId,
              updatedAt: nowMs(),
            },
            { merge: true },
          )
        })
      } catch (shareError) {
        const status = Number(shareError?.httpStatus || 500)
        const message = shareError instanceof Error ? shareError.message : 'Failed to update board sharing'
        res.status(status).json({ error: message })
        return
      }

      if (action === 'approve-request') {
        await boardRef.collection('accessRequests').doc(collaboratorId).set(
          {
            status: 'approved',
            approvedBy: userId,
            approvedAt: nowMs(),
            updatedAt: nowMs(),
          },
          { merge: true },
        )
      }

      res.status(200).json({
        status: 'success',
        boardId,
        linkAccessRole: nextLinkAccessRole,
        sharedWith: nextSharedWith,
        sharedRoles: normalizedSharedRoles,
        message:
          action === 'approve-request'
            ? `Access request approved (${requestedRole || 'edit'} access).`
            : action === 'revoke' || action === 'remove'
            ? 'Collaborator removed from board'
            : `Board shared successfully (${requestedRole || 'edit'} access). No invitation email is sent yet.`,
      })
      return
    }

    const userDisplayName = String(req.body?.userDisplayName || decodedToken.name || '').trim()
    const command = sanitizeText(req.body?.command)
    const commandPlacement = normalizeAiPlacementHint(req.body?.placement)
    commandForError = command
    const clientCommandId = String(req.body?.clientCommandId || crypto.randomUUID()).trim()
    boardIdForError = boardId
    clientCommandIdForError = clientCommandId

    if (!command) {
      res.status(400).json({ error: 'boardId and command are required' })
      return
    }

    const accessResult = await ensureBoardAccess({ boardId, userId, createIfMissing: true })
    if (!accessResult.ok) {
      res.status(accessResult.status || 403).json({ error: accessResult.reason || 'Access denied' })
      return
    }
    if (!canUserEditBoard(accessResult.boardMeta, userId)) {
      res.status(403).json({ error: 'You have view-only access to this board.' })
      return
    }

    const commandRef = getCommandsRef(boardId).doc(clientCommandId)
    const existing = await commandRef.get()
    const existingData = existing.exists ? existing.data() || {} : {}

    if (existing.exists) {
      if (existingData.status === 'success') {
        res.status(200).json({
          status: 'success',
          idempotent: true,
          commandId: clientCommandId,
          result: existingData.result,
        })
        return
      }

      if (existingData.status === 'running' || existingData.status === 'queued') {
        res.status(202).json({
          status: existingData.status,
          commandId: clientCommandId,
          queueSequence: existingData.queueSequence || null,
        })
        return
      }
    }

    // Failed attempts may leave a stale queueSequence. Retry should reserve a fresh slot.
    let queueSequence = existingData.status === 'error' ? 0 : parseNumber(existingData.queueSequence, 0)
    if (queueSequence > 0) {
      const lockSnapshot = await getSystemRef(boardId).get()
      const lockData = lockSnapshot.exists ? lockSnapshot.data() : null
      const processingSequence = parseNumber(lockData?.processingSequence, 1)
      if (queueSequence < processingSequence) {
        queueSequence = 0
      }
    }
    if (!queueSequence) {
      queueSequence = await reserveQueueSequence(boardId)
    }
    queueSequenceForError = queueSequence

    await commandRef.set(
      {
        boardId,
        command,
        userId,
        userDisplayName,
        status: 'queued',
        queueSequence,
        queuedAt: nowMs(),
      },
      { merge: true },
    )

    await acquireBoardLock(boardId, clientCommandId, queueSequence)

    await commandRef.set(
      {
        status: 'running',
        startedAt: nowMs(),
      },
      { merge: true },
    )
    stopLockHeartbeat = startBoardLockHeartbeat({
      boardId,
      commandId: clientCommandId,
      queueSequence,
    })

    const state = await getBoardState(boardId)
    const context = {
      boardId,
      userId,
      state,
      executedTools: [],
      commandPlacement,
      commandStartedAtMs: nowMs(),
    }

    const planResult = await runCommandPlan(context, command)
    const latencyMs = nowMs() - Number(context.commandStartedAtMs || nowMs())
    const latencyBreached = latencyMs > AI_RESPONSE_TARGET_MS
    const baseResultMessage = sanitizeAiAssistantResponse(planResult?.message) || 'Command executed and synced to the board.'
    const resultMessage = latencyBreached
      ? sanitizeAiAssistantResponse(
          `${baseResultMessage} Response took ${latencyMs}ms, above ${AI_RESPONSE_TARGET_MS}ms target.`,
        )
      : baseResultMessage
    const aiResponse = sanitizeAiAssistantResponse(planResult?.aiResponse)

    const resultLevel = planResult?.level === 'warning' || latencyBreached ? 'warning' : undefined
    const result = {
      executedTools: context.executedTools,
      objectCount: context.state.length,
      message: resultMessage,
      latencyMs,
      ...(aiResponse ? { aiResponse } : {}),
      ...(resultLevel ? { level: resultLevel } : {}),
    }
    logAiDebug('api_ai_command_result', {
      boardId,
      commandId: clientCommandId,
      objectCount: result.objectCount,
      toolCount: result.executedTools.length,
      message: result.message,
      level: result.level || 'info',
    })

    await commandRef.set(
      {
        status: 'success',
        completedAt: nowMs(),
        result,
      },
      { merge: true },
    )

    stopLockHeartbeat()
    await releaseBoardLock(boardId, clientCommandId, queueSequence)

    res.status(200).json({ status: 'success', commandId: clientCommandId, result })
  } catch (error) {
    stopLockHeartbeat()
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    try {
      if (boardIdForError && clientCommandIdForError) {
        await getCommandsRef(boardIdForError).doc(clientCommandIdForError).set(
          {
            status: 'error',
            completedAt: nowMs(),
            error: errorMessage,
          },
          { merge: true },
        )
        await releaseBoardLock(boardIdForError, clientCommandIdForError, queueSequenceForError)
      }
    } catch (innerError) {
      console.error('Failed to store AI command error', innerError)
    }

    console.error('AI command execution failed', {
      error: error instanceof Error ? error.message : String(error),
      boardId: boardIdForError,
      command: commandForError,
      normalizedCommand: normalizeCommand(commandForError),
    })
    res.status(500).json({ error: errorMessage })
  }
})

const __setGlmClientForTests = (client) => {
  glmClient = client
}

const __setObjectWriterForTests = (writer) => {
  writeObjectImpl = typeof writer === 'function' ? writer : persistObjectToFirestore
}

exports.__test = {
  __setGlmClientForTests,
  __setObjectWriterForTests,
  runCommandPlan,
  resolvePlacementAnchor,
  resolveLlmCreateArgsWithPlacement,
  toBatchOperations,
  normalizeCommandForPlan,
  isOrganizeByColorCommand,
  isLikelyBoardMutationCommand,
  parseBusinessModelCanvasCommand,
  parseWorkflowFlowchartCommand,
  parseStickyCommand,
  parseCompoundStickyCreateOperations,
  parseReasonListCommand,
  buildReasonStickyTexts,
  countPlannedStickyOperations,
  getRemainingAiLatencyBudgetMs,
  getAutoStickyPosition,
  normalizeAiPlacementHint,
  getStickyBatchLayoutPositions,
  parsePosition,
  extractCoordinatePosition,
  sanitizeAiAssistantResponse,
  normalizeBoardMeta,
  canUserAccessBoard,
  canUserEditBoard,
  normalizeSharedRoles,
  AI_RESPONSE_TARGET_MS,
  AI_LOCK_WAIT_TIMEOUT_MS,
  AI_LOCK_RETRY_INTERVAL_MS,
}
// Tue Feb 17 18:22:00 EST 2026
