import { describe, expect, test } from 'bun:test'
import { cn } from '../utils/cn'

describe('cn', () => {
  test('filters falsy values and merges classes', () => {
    expect(cn('text-red-500', false, null, undefined, 'text-blue-500')).toBe(
      'text-blue-500'
    )
  })

  test('handles arrays and object maps', () => {
    expect(
      cn('p-2', ['mt-2', { 'mb-2': true, 'mb-4': false }])
    ).toBe('p-2 mt-2 mb-2')
  })
})
