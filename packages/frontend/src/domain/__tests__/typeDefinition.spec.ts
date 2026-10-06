import { describe, it, expect } from 'vitest'

import { inheritedProperties, toDefinition, toForm } from '../typeDefinition'

describe('type definition form', () => {
  it('round-trips string, number, object and array constraints', () => {
    const cases: Array<[Parameters<typeof toDefinition>[1], unknown]> = [
      ['string', { parentTypeId: 'system:string', constraints: { minLength: 2, maxLength: 9, pattern: '^a' } }],
      ['number', { parentTypeId: 'system:number', constraints: { min: 1, max: 5, integer: true } }],
      ['object', { parentTypeId: 'system:object', constraints: { properties: [{ name: 'id', typeId: 'system:string' }, { name: 'note', typeId: 'system:string', required: false }] } }],
      ['array', { parentTypeId: 'system:array', constraints: { elementType: { typeId: 'system:string' } } }],
    ]
    for (const [root, definition] of cases) expect(toDefinition(toForm('T', definition), root)).toEqual(definition)
  })

  it('omits empty constraints entirely', () => {
    expect(toDefinition(toForm('T', { parentTypeId: 'system:string' }), 'string')).toEqual({ parentTypeId: 'system:string' })
  })

  it('drops constraints that do not apply to the root kind after the parent changes', () => {
    const form = { ...toForm('T', { parentTypeId: 'system:string', constraints: { minLength: 3 } }), parentTypeId: 'system:number' }
    expect(toDefinition(form, 'number')).toEqual({ parentTypeId: 'system:number' })
    expect(toDefinition(form, 'boolean')).toEqual({ parentTypeId: 'system:number' })
  })

  it('treats a cleared number field as unset', () => {
    const form = { ...toForm('T', { parentTypeId: 'system:number' }), min: undefined, max: Number.NaN }
    expect(toDefinition(form, 'number')).toEqual({ parentTypeId: 'system:number' })
  })

  it('inherits properties when a subtype declares none, and copies the nearest list otherwise', () => {
    expect(toForm('T', { parentTypeId: 'p' }).properties).toBeUndefined()
    expect(toDefinition({ ...toForm('T', { parentTypeId: 'p' }) }, 'object')).toEqual({ parentTypeId: 'p' })

    const chain = [
      { parentTypeId: 'system:object', constraints: { properties: [{ name: 'id', typeId: 'system:string' }] } },
      { parentTypeId: 'a' },
      { parentTypeId: 'a', constraints: { properties: [{ name: 'id', typeId: 'system:string' }, { name: 'name', typeId: 'system:string', required: false }] } },
    ]
    expect(inheritedProperties(chain)).toEqual([
      { name: 'id', typeId: 'system:string', required: true },
      { name: 'name', typeId: 'system:string', required: false },
    ])
    expect(inheritedProperties([])).toEqual([])
  })
})
