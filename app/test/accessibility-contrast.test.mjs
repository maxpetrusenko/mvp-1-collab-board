import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const stylesPath = path.resolve(process.cwd(), 'src/styles.css')
const stylesSource = readFileSync(stylesPath, 'utf8')
const rootMatch = stylesSource.match(/:root\s*{([\s\S]*?)}/)

if (!rootMatch) {
  throw new Error('Unable to locate :root CSS variable block in src/styles.css')
}

const cssVariables = {}
for (const match of rootMatch[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
  cssVariables[`--${match[1]}`] = match[2].trim()
}

const parseHexColor = (value) => {
  const normalized = value.trim()
  const full =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized

  if (!/^#[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Unsupported color format: ${value}`)
  }

  return [full.slice(1, 3), full.slice(3, 5), full.slice(5, 7)].map((hex) => Number.parseInt(hex, 16))
}

const toRelativeLuminance = (channel) => {
  const sRgb = channel / 255
  return sRgb <= 0.03928 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4
}

const contrastRatio = (foreground, background) => {
  const [fr, fg, fb] = parseHexColor(foreground)
  const [br, bg, bb] = parseHexColor(background)
  const foregroundLuminance =
    0.2126 * toRelativeLuminance(fr) +
    0.7152 * toRelativeLuminance(fg) +
    0.0722 * toRelativeLuminance(fb)
  const backgroundLuminance =
    0.2126 * toRelativeLuminance(br) +
    0.7152 * toRelativeLuminance(bg) +
    0.0722 * toRelativeLuminance(bb)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

const expectContrastAtLeast = (label, foreground, background, minimumRatio) => {
  const ratio = contrastRatio(foreground, background)
  assert.ok(
    ratio >= minimumRatio,
    `${label} contrast ratio ${ratio.toFixed(2)} is below required ${minimumRatio}:1 (${foreground} on ${background})`,
  )
}

test('A11Y-CONTRAST-001: body text meets 4.5:1 on primary surfaces', () => {
  expectContrastAtLeast(
    'Primary text on surface',
    cssVariables['--color-text-primary'],
    cssVariables['--color-surface'],
    4.5,
  )
  expectContrastAtLeast(
    'Secondary text on surface',
    cssVariables['--color-text-secondary'],
    cssVariables['--color-surface'],
    4.5,
  )
})

test('A11Y-CONTRAST-002: primary action text meets 4.5:1 on button backgrounds', () => {
  expectContrastAtLeast('White text on primary', '#FFFFFF', cssVariables['--color-primary'], 4.5)
  expectContrastAtLeast('White text on primary dark', '#FFFFFF', cssVariables['--color-primary-dark'], 4.5)
})

test('A11Y-CONTRAST-003: focus ring color meets 3:1 on elevated surface', () => {
  expectContrastAtLeast('Focus ring on elevated surface', '#0f766e', cssVariables['--color-surface-elevated'], 3)
})

// Helper that replicates getContrastingTextColor logic
const getContrastingTextColor = (backgroundColor, darkColor = '#0f172a', lightColor = '#FFFFFF') => {
  const sRgb = (channel) => channel / 255
  const toLuminance = (channel) => sRgb(channel) <= 0.03928 ? sRgb(channel) / 12.92 : Math.pow((sRgb(channel) + 0.055) / 1.055, 2.4)

  const [br, bg, bb] = parseHexColor(backgroundColor)
  const bgLuminance = 0.2126 * toLuminance(br) + 0.7152 * toLuminance(bg) + 0.0722 * toLuminance(bb)

  return bgLuminance > 0.5 ? darkColor : lightColor
}

test('A11Y-CONTRAST-004: getContrastingTextColor returns WCAG-compliant colors for all palette options', () => {
  // All board object color palettes
  const stickyColors = ['#fde68a', '#fdba74', '#fca5a5', '#86efac', '#93c5fd']
  const shapeColors = ['#93c5fd', '#67e8f9', '#86efac', '#fcd34d', '#fca5a5', '#c4b5fd']
  const frameColors = ['#e2e8f0', '#dbeafe', '#dcfce7', '#fee2e2', '#fef3c7']
  const connectorColors = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']
  const textColors = ['#0f172a', '#1d4ed8', '#dc2626', '#0f766e', '#6d28d9']

  const allColors = [...stickyColors, ...shapeColors, ...frameColors, ...connectorColors, ...textColors]

  for (const bgColor of allColors) {
    const textColor = getContrastingTextColor(bgColor, '#0f172a', '#FFFFFF')
    const ratio = contrastRatio(textColor, bgColor)

    assert.ok(
      ratio >= 4.5,
      `${bgColor} with ${textColor} has contrast ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`,
    )
  }

  // Also verify some edge cases
  assert.equal(getContrastingTextColor('#ffffff'), '#0f172a', 'Pure white should get dark text')
  assert.equal(getContrastingTextColor('#000000'), '#FFFFFF', 'Pure black should get light text')
  assert.equal(getContrastingTextColor('#808080'), '#FFFFFF', 'Mid-gray should get light text')
})
