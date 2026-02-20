/**
 * Color contrast utilities for accessibility (WCAG 2.0)
 *
 * Provides functions to calculate relative luminance, contrast ratios,
 * and automatically select readable text colors based on background.
 */

/**
 * Parse hex color to RGB array
 * Supports 3-digit (#RGB) and 6-digit (#RRGGBB) formats
 */
export const parseHexColor = (value: string): [number, number, number] => {
  const normalized = value.trim()
  const full =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized

  if (!/^#[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Unsupported color format: ${value}`)
  }

  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16),
  ]
}

/**
 * Convert RGB channel to relative luminance (per WCAG 2.0 spec)
 * @param channel - RGB channel value (0-255)
 * @returns Relative luminance value (0-1)
 */
const toRelativeLuminance = (channel: number): number => {
  const sRgb = channel / 255
  return sRgb <= 0.03928 ? sRgb / 12.92 : Math.pow((sRgb + 0.055) / 1.055, 2.4)
}

/**
 * Calculate relative luminance of a hex color
 * @param hexColor - Color in hex format (#RRGGBB or #RGB)
 * @returns Luminance value between 0 (black) and 1 (white)
 */
export const getLuminance = (hexColor: string): number => {
  const [r, g, b] = parseHexColor(hexColor)
  return (
    0.2126 * toRelativeLuminance(r) + 0.7152 * toRelativeLuminance(g) + 0.0722 * toRelativeLuminance(b)
  )
}

/**
 * Calculate WCAG contrast ratio between two colors
 * @param foreground - Foreground color (text)
 * @param background - Background color
 * @returns Contrast ratio (1:1 to 21:1)
 */
export const getContrastRatio = (foreground: string, background: string): number => {
  const fgLuminance = getLuminance(foreground)
  const bgLuminance = getLuminance(background)
  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Get contrasting text color for a background
 * Automatically selects black or white text based on background luminance.
 * Uses luminance threshold of 0.5 (midpoint) for selection.
 *
 * @param backgroundColor - The background color in hex format
 * @param darkColor - Color to use on light backgrounds (default: #000000)
 * @param lightColor - Color to use on dark backgrounds (default: #FFFFFF)
 * @returns The text color that provides better contrast
 *
 * @example
 * ```ts
 * getContrastingTextColor('#fde68a') // Returns '#000000' (dark text on yellow)
 * getContrastingTextColor('#1e293b') // Returns '#FFFFFF' (light text on dark blue)
 * ```
 */
export const getContrastingTextColor = (
  backgroundColor: string,
  darkColor: string = '#0f172a',
  lightColor: string = '#FFFFFF',
): string => {
  const bgLuminance = getLuminance(backgroundColor)
  // Light backgrounds (luminance > 0.5) get dark text
  // Dark backgrounds (luminance <= 0.5) get light text
  return bgLuminance > 0.5 ? darkColor : lightColor
}

/**
 * Check if a color combination meets WCAG AA standard for normal text
 * @param foreground - Text color
 * @param background - Background color
 * @returns true if contrast ratio >= 4.5:1
 */
export const meetsWCAG_AA = (foreground: string, background: string): boolean => {
  return getContrastRatio(foreground, background) >= 4.5
}

/**
 * Check if a color combination meets WCAG AA standard for large text
 * @param foreground - Text color
 * @param background - Background color
 * @returns true if contrast ratio >= 3:1
 */
export const meetsWCAG_AALarge = (foreground: string, background: string): boolean => {
  return getContrastRatio(foreground, background) >= 3.0
}
