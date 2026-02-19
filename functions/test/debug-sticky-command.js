// Debug test for sticky command parsing
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
  console.log('parseStickyCommand normalized:', normalized)

  if (!/^(?:add|create)\b/i.test(normalized)) {
    console.log('FAILS: does not start with add/create')
    return null
  }

  const stickyMarker = normalized.match(/\b(?:sticky(?:\s*note)?|sticker|note)s?\b/i)
  if (!stickyMarker) {
    console.log('FAILS: no sticky marker found')
    console.log('Looking for patterns: sticky, sticky note, sticker, note')
    return null
  }
  console.log('stickyMarker:', stickyMarker[0], 'at index:', stickyMarker.index)

  const explicitTexts = parseExplicitStickyTexts(normalized)
  const requestedCount = parseRequestedStickyCount(normalized)
  const shapeType = inferStickyShapeType(normalized)

  console.log('explicitTexts:', explicitTexts)
  console.log('requestedCount:', requestedCount)
  console.log('shapeType:', shapeType)

  return {
    color: undefined,
    shapeType,
    count: explicitTexts.length > 0 ? explicitTexts.length : requestedCount,
    texts: explicitTexts.length > 0 ? explicitTexts : Array.from({ length: requestedCount }, (_, index) => `Note ${index + 1}`),
  }
}

// Test the failing command
const cmd = 'create two stickers with circle form one say 1 another says 2'
const result = parseStickyCommand(cmd)
console.log('Final result:', JSON.stringify(result, null, 2))

// Also test simpler commands
console.log('\n--- Test simpler command ---')
const simpleResult = parseStickyCommand('create two stickers')
console.log('Simple result:', JSON.stringify(simpleResult, null, 2))

// Test the actual test command variation
console.log('\n--- Test exact test command ---')
const testResult = parseStickyCommand('create two stickers with circle form one say 1 another says 2')
console.log('Test result:', JSON.stringify(testResult, null, 2))
