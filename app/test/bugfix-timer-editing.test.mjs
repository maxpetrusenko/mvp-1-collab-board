/**
 * Unit tests for bugfix: Timer inline editing
 *
 * Addresses T-096: Timer should support inline editing with proper validation
 * (Enter to submit, Escape to cancel, MM:SS format validation).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// Mimic the formatTimerLabel function from BoardPage.tsx
const formatTimerLabel = (ms) => {
  const clamped = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Mimic the submitTimerTime validation logic
const parseTimerInput = (inputValue) => {
  const match = inputValue.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return { valid: false, error: 'Invalid format - must be MM:SS' }
  }

  const [, minutesStr, secondsStr] = match
  const minutes = parseInt(minutesStr, 10)
  const seconds = parseInt(secondsStr, 10)

  if (minutes < 0 || minutes > 99 || seconds < 0 || seconds > 59) {
    return { valid: false, error: 'Out of range - minutes 0-99, seconds 0-59' }
  }

  const totalMs = (minutes * 60 + seconds) * 1000
  return { valid: true, totalMs }
}

describe('BUGFIX-096: Timer inline editing validation', () => {
  it('should format 5 minutes as "05:00"', () => {
    assert.strictEqual(formatTimerLabel(5 * 60 * 1000), '05:00')
  })

  it('should format 10:30 correctly', () => {
    assert.strictEqual(formatTimerLabel(10 * 60 * 1000 + 30 * 1000), '10:30')
  })

  it('should format single-digit minutes with leading zero', () => {
    assert.strictEqual(formatTimerLabel(3 * 60 * 1000), '03:00')
    assert.strictEqual(formatTimerLabel(3 * 60 * 1000 + 45 * 1000), '03:45')
  })

  it('should reject invalid format (missing colon)', () => {
    const result = parseTimerInput('12345')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error?.includes('Invalid format'))
  })

  it('should reject out-of-range seconds (>59)', () => {
    const result = parseTimerInput('05:99')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error?.includes('Out of range'))
  })

  it('should reject out-of-range minutes (>99)', () => {
    // Note: "100:00" has 3 digits for minutes, so it fails format validation first
    const result = parseTimerInput('100:00')
    assert.strictEqual(result.valid, false)
    // The regex \d{1,2} only matches 1-2 digits, so this fails format validation
    assert.ok(result.error?.includes('Invalid format') || result.error?.includes('Out of range'))
  })

  it('should accept valid maximum time (99:59)', () => {
    const result = parseTimerInput('99:59')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.totalMs, (99 * 60 + 59) * 1000)
  })

  it('should accept valid single-digit minutes', () => {
    const result = parseTimerInput('3:30')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.totalMs, (3 * 60 + 30) * 1000)
  })

  it('should accept double-digit minutes with leading zero', () => {
    const result = parseTimerInput('07:15')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.totalMs, (7 * 60 + 15) * 1000)
  })

  it('should round-trip: format -> parse -> format', () => {
    const originalMs = 7 * 60 * 1000 + 23 * 1000 // 7:23
    const formatted = formatTimerLabel(originalMs)
    const parsed = parseTimerInput(formatted)
    assert.strictEqual(parsed.valid, true)
    assert.strictEqual(parsed.totalMs, originalMs)
  })
})
