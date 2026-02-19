// Debug test to trace command flow
const normalizeCommandForPlan = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[""''']/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\borganise\b/gi, 'organize')
    .replace(/\bcolour\b/gi, 'color')

const normalizeCommand = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[""''']/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const NUMBER_WORD_MAP = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

const inferStickyShapeType = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  if (/\bcircle\b/.test(lower)) return 'circle'
  if (/\b(?:diamond|rhombus|romb)\b/.test(lower)) return 'diamond'
  if (/\btriangle\b/.test(lower)) return 'triangle'
  return 'rectangle'
}

const parseRequestedStickyCount = (command) => {
  const lower = normalizeCommand(command).toLowerCase()
  const countMatch = lower.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:sticky(?:\s*note)?|sticker|note)s?\b/,
  )
  if (!countMatch) {
    return 1
  }
  const token = countMatch[1]
  const numericValue = /^\d+$/.test(token) ? Number(token) : NUMBER_WORD_MAP[token] || 1
  return Math.min(10, Math.max(1, numericValue))
}

const parseExplicitStickyTexts = (command) => {
  const normalized = normalizeCommand(command)
  const pairMatch = normalized.match(
    /\bone\b[^]*?\bsay(?:s)?\b\s+(.+?)\s+\banother\b[^]*?\bsay(?:s)?\b\s+(.+)$/i,
  )
  if (pairMatch) {
    return [pairMatch[1], pairMatch[2]]
  }
  return []
}

const parseStickyCommand = (command) => {
  const normalized = normalizeCommand(command)

  if (!/^(?:add|create)\b/i.test(normalized)) {
    return null
  }

  const stickyMarker = normalized.match(/\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i)
  if (!stickyMarker) {
    return null
  }

  const explicitTexts = parseExplicitStickyTexts(normalized)
  const requestedCount = parseRequestedStickyCount(normalized)
  const shapeType = inferStickyShapeType(normalized)

  return {
    color: undefined,
    shapeType,
    count: explicitTexts.length > 0 ? explicitTexts.length : requestedCount,
    texts: explicitTexts.length > 0 ? explicitTexts : Array.from({ length: requestedCount }, (_, index) => `Note ${index + 1}`),
  }
}

// Simulate runCommandPlan flow
const runCommandPlan = (command) => {
  const normalizedCommand = normalizeCommandForPlan(command)
  const lower = normalizedCommand.toLowerCase()

  console.log('=== runCommandPlan ===')
  console.log('Input command:', command)
  console.log('Normalized command:', normalizedCommand)
  console.log('Lower:', lower)

  const stickyCommand = parseStickyCommand(normalizedCommand)
  console.log('stickyCommand result:', JSON.stringify(stickyCommand, null, 2))

  if (stickyCommand) {
    console.log('Would create', stickyCommand.count, 'sticky notes')
    console.log('Texts:', stickyCommand.texts)
    console.log('Shape type:', stickyCommand.shapeType)
    return 'MATCHED: stickyCommand'
  }

  return 'NO MATCH - would fall through to LLM'
}

// Test cases
const tests = [
  'create two stickers with circle form one say 1 another says 2',
  'add green sticky note saying hello',
  'create two stickers',
  'add red sticky note',
]

tests.forEach(cmd => {
  console.log('\n' + '='.repeat(60))
  const result = runCommandPlan(cmd)
  console.log('Result:', result)
})
