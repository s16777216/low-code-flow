import { describe, it, expect } from 'vitest'

import { fieldKindFor, initialFieldText, parseField } from '../rawInput'

describe('raw execution inputs', () => {
  it('chooses a field kind from the root kind', () => {
    expect(['string', 'number', 'boolean', 'date', 'object', 'array', 'any', 'function', null].map((k) => fieldKindFor(k as never))).toEqual(['text', 'number', 'boolean', 'date', 'json', 'json', 'json', 'json', 'json'])
  })

  it('keeps text as typed, including the empty string', () => {
    expect(parseField('text', '')).toEqual({ ok: true, value: '' })
    expect(parseField('text', ' a ')).toEqual({ ok: true, value: ' a ' })
  })

  it('parses numbers and rejects blanks and garbage', () => {
    expect(parseField('number', '1.5')).toEqual({ ok: true, value: 1.5 })
    expect(parseField('number', '').ok).toBe(false)
    expect(parseField('number', 'abc').ok).toBe(false)
  })

  it('wraps a date string in its transport form', () => {
    expect(parseField('date', ' 2026-10-02T08:00:00Z ')).toEqual({ ok: true, value: { $kind: 'date', iso: '2026-10-02T08:00:00Z' } })
    expect(parseField('date', '').ok).toBe(false)
  })

  it('parses JSON for structured values and reports bad JSON', () => {
    expect(parseField('json', '{"a":[1,null]}')).toEqual({ ok: true, value: { a: [1, null] } })
    expect(parseField('json', '{oops').ok).toBe(false)
    expect(parseField('boolean', 'true')).toEqual({ ok: true, value: true })
    expect(initialFieldText('boolean')).toBe('false')
  })
})
