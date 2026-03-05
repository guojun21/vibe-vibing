import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { formatRelativeTime } from '../components/SessionList'

afterEach(() => {
  setSystemTime()
})

describe('formatRelativeTime', () => {
  test('returns empty string for invalid dates', () => {
    expect(formatRelativeTime('not-a-date')).toBe('')
  })

  test('formats relative times', () => {
    setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

    expect(formatRelativeTime('2024-01-01T00:00:00.000Z')).toBe('now')
    expect(formatRelativeTime('2023-12-31T23:30:00.000Z')).toBe('30m')
    expect(formatRelativeTime('2023-12-31T22:00:00.000Z')).toBe('2h')
    expect(formatRelativeTime('2023-12-30T00:00:00.000Z')).toBe('2d')
  })
})
