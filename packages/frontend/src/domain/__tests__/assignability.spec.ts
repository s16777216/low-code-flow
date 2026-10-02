import { describe, it, expect } from 'vitest'

import { isAssignable } from '../assignability'

describe('isAssignable', () => {
  it('accepts the same type', () => {
    expect(isAssignable('number', 'number')).toBe(true)
  })

  it('rejects different base types', () => {
    expect(isAssignable('string', 'number')).toBe(false)
    expect(isAssignable('object', 'array')).toBe(false)
  })

  it('accepts any type into any', () => {
    expect(isAssignable('string', 'any')).toBe(true)
  })

  it('accepts any into a specific type', () => {
    expect(isAssignable('any', 'date')).toBe(true)
  })
})
