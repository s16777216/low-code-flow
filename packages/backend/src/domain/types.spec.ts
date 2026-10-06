import { describe, expect, it } from 'vitest'
import { BASE_KINDS, SYSTEM_TYPE_IDS, isAssignable, resolveAncestry, validateTypeDefinition, validateValue, type TypeDefinition, type TypeLookup } from './types.ts'

const lookupOf = (types: Record<string, TypeDefinition>): TypeLookup => (id) => types[id]
const codes = (id: string, types: Record<string, TypeDefinition>) =>
  validateTypeDefinition(id, types[id], lookupOf(types), () => undefined).map((d) => d.code)

describe('system base types', () => {
  it('exposes exactly the eight immutable base types', () => {
    expect(Object.values(SYSTEM_TYPE_IDS).sort()).toEqual(BASE_KINDS.map((k) => `system:${k}`).sort())
    expect(Object.isFrozen(SYSTEM_TYPE_IDS)).toBe(true)
    expect(() => {
      ;(SYSTEM_TYPE_IDS as Record<string, string>).string = 'hacked'
    }).toThrow(/read only/)
  })

  it('rejects user types that inherit any', () => {
    expect(codes('Payload', { Payload: { parentTypeId: 'system:any' } })).toEqual(['any_parent'])
  })

  it('rejects a type without a parent, with several parents, or with an unknown system parent', () => {
    expect(codes('A', { A: {} as TypeDefinition })).toEqual(['missing_parent'])
    expect(codes('A', { A: { parentTypeId: ['system:string', 'system:number'] as unknown as string } })).toEqual(['multiple_parents'])
    expect(codes('A', { A: { parentTypeId: 'system:nope' } })).toEqual(['unknown_system_type'])
  })

  it('rejects a function as a parent', () => {
    const types = { A: { parentTypeId: 'fn-1' } }
    expect(validateTypeDefinition('A', types.A, lookupOf(types), (id) => (id === 'fn-1' ? 'function' : undefined)).map((d) => d.code)).toEqual(['parent_not_a_type'])
  })
})

describe('ancestry', () => {
  const types = {
    Id: { parentTypeId: 'system:string' },
    UserId: { parentTypeId: 'Id' },
    Entity: { parentTypeId: 'system:object' },
    User: { parentTypeId: 'Entity' },
    AdminUser: { parentTypeId: 'User' },
  }

  it('resolves the chain and root kind across several levels', () => {
    expect(resolveAncestry('UserId', lookupOf(types))).toEqual({ ok: true, chain: ['UserId', 'Id', 'system:string'], root: 'string' })
    expect(resolveAncestry('AdminUser', lookupOf(types))).toMatchObject({ ok: true, root: 'object', chain: ['AdminUser', 'User', 'Entity', 'system:object'] })
    expect(resolveAncestry('system:date', lookupOf(types))).toEqual({ ok: true, chain: ['system:date'], root: 'date' })
  })

  it('reports an inheritance cycle on every member', () => {
    const cyclic = { A: { parentTypeId: 'B' }, B: { parentTypeId: 'C' }, C: { parentTypeId: 'A' } }
    for (const id of ['A', 'B', 'C']) expect(codes(id, cyclic)).toEqual(['inheritance_cycle'])
  })

  it('treats an unknown parent as unresolved rather than a type error', () => {
    expect(codes('A', { A: { parentTypeId: 'ghost' } })).toEqual([])
    expect(resolveAncestry('A', lookupOf({ A: { parentTypeId: 'ghost' } }))).toMatchObject({ ok: false, code: 'unknown_type' })
  })

  describe('nominal assignability', () => {
    const lookup = lookupOf({ ...types, OrderId: { parentTypeId: 'Id' }, Mirror: { parentTypeId: 'Entity' } })
    it.each([
      ['same type', 'User', 'User', true],
      ['descendant to ancestor', 'AdminUser', 'User', true],
      ['descendant to a distant ancestor', 'AdminUser', 'Entity', true],
      ['descendant to its system base', 'UserId', 'system:string', true],
      ['ancestor to descendant', 'User', 'AdminUser', false],
      ['siblings with identical structure', 'UserId', 'OrderId', false],
      ['unrelated types with the same shape', 'User', 'Mirror', false],
      ['different base kinds', 'UserId', 'system:number', false],
      ['anything into any', 'UserId', 'system:any', true],
      ['any into anything', 'system:any', 'AdminUser', true],
    ])('%s', (_name, source, target, expected) => {
      expect(isAssignable(source, target, lookup)).toBe(expected)
    })
  })
})

describe('object constraints', () => {
  const entity: TypeDefinition = { parentTypeId: 'system:object', constraints: { properties: [{ name: 'id', typeId: 'system:string' }] } }
  const withUser = (constraints: TypeDefinition['constraints']) => ({ Entity: entity, User: { parentTypeId: 'Entity', constraints } })

  it('accepts added properties and a narrowing override', () => {
    expect(codes('User', withUser({ properties: [{ name: 'id', typeId: 'system:string' }, { name: 'name', typeId: 'system:string' }] }))).toEqual([])
    const types = { ...withUser({ properties: [{ name: 'id', typeId: 'UserId' }] }), UserId: { parentTypeId: 'system:string' } }
    expect(codes('User', types)).toEqual([])
  })

  it('rejects removing, retyping or relaxing an inherited property', () => {
    expect(codes('User', withUser({ properties: [{ name: 'name', typeId: 'system:string' }] }))).toEqual(['removed_property'])
    expect(codes('User', withUser({ properties: [{ name: 'id', typeId: 'system:number' }] }))).toEqual(['incompatible_property'])
    expect(codes('User', withUser({ properties: [{ name: 'id', typeId: 'system:string', required: false }] }))).toEqual(['relaxed_property'])
  })

  it('inherits the property list when a subtype omits it, and rejects duplicate names', () => {
    expect(codes('User', withUser({}))).toEqual([])
    expect(codes('User', withUser({ properties: [{ name: 'id', typeId: 'system:string' }, { name: 'id', typeId: 'system:string' }] }))).toEqual(['duplicate_property'])
  })

  it('validates values against inherited and added properties', () => {
    const types = { Entity: entity, User: { parentTypeId: 'Entity', constraints: { properties: [{ name: 'id', typeId: 'system:string' }, { name: 'name', typeId: 'system:string' }] } }, AdminUser: { parentTypeId: 'User' } }
    const lookup = lookupOf(types)
    expect(validateValue('User', { id: '1', name: 'Ann' }, lookup)).toEqual([])
    expect(validateValue('User', { id: '1' }, lookup)).toEqual(['$.name: required property is missing'])
    expect(validateValue('AdminUser', { name: 'Ann' }, lookup)).toEqual(['$.id: required property is missing'])
    expect(validateValue('User', { id: 1, name: 'Ann' }, lookup)).toEqual(['$.id: expected string'])
    expect(validateValue('User', { id: '1', name: 'Ann', extra: true }, lookup)).toEqual([])
  })
})

describe('primitive and array constraints', () => {
  it('accepts narrowing and rejects widening or impossible ranges', () => {
    const types = {
      Positive: { parentTypeId: 'system:number', constraints: { min: 1 } },
      Narrower: { parentTypeId: 'Positive', constraints: { min: 5, max: 10 } },
      Wider: { parentTypeId: 'Positive', constraints: { min: 0 } },
      Empty: { parentTypeId: 'Narrower', constraints: { max: 2 } },
      Code: { parentTypeId: 'system:string', constraints: { minLength: 3, maxLength: 5 } },
      LongerCode: { parentTypeId: 'Code', constraints: { maxLength: 9 } },
    }
    expect(codes('Positive', types)).toEqual([])
    expect(codes('Narrower', types)).toEqual([])
    expect(codes('Wider', types)).toEqual(['widened_constraint'])
    expect(codes('Empty', types)).toEqual(['empty_range'])
    expect(codes('LongerCode', types)).toEqual(['widened_constraint'])
  })

  it('rejects inapplicable and malformed constraints', () => {
    expect(codes('A', { A: { parentTypeId: 'system:string', constraints: { min: 1 } } })).toEqual(['inapplicable_constraint'])
    expect(codes('A', { A: { parentTypeId: 'system:string', constraints: { pattern: '(' } } })).toEqual(['invalid_constraint'])
    expect(codes('A', { A: { parentTypeId: 'system:boolean', constraints: { min: 1 } } })).toEqual(['inapplicable_constraint'])
  })

  it('applies narrowing constraints when validating values', () => {
    const lookup = lookupOf({ Positive: { parentTypeId: 'system:number', constraints: { min: 1 } }, Code: { parentTypeId: 'system:string', constraints: { pattern: '^[A-Z]{3}$' } } })
    expect(validateValue('Positive', 3, lookup)).toEqual([])
    expect(validateValue('Positive', 0, lookup)).toEqual(['$: below 1'])
    expect(validateValue('Code', 'ABC', lookup)).toEqual([])
    expect(validateValue('Code', 'abc', lookup)).toHaveLength(1)
  })

  it('requires an element type for an array subtype and checks elements', () => {
    const types = {
      UserList: { parentTypeId: 'system:array', constraints: { elementType: { typeId: 'system:string' } } },
      Bare: { parentTypeId: 'system:array' },
      Inherits: { parentTypeId: 'UserList' },
      Clash: { parentTypeId: 'UserList', constraints: { elementType: { typeId: 'system:number' } } },
    }
    expect(codes('UserList', types)).toEqual([])
    expect(codes('Bare', types)).toEqual(['missing_element_type'])
    expect(codes('Inherits', types)).toEqual([])
    expect(codes('Clash', types)).toEqual(['incompatible_element_type'])
    const lookup = lookupOf(types)
    expect(validateValue('UserList', ['a', 'b'], lookup)).toEqual([])
    expect(validateValue('UserList', ['a', 2], lookup)).toEqual(['$[1]: expected string'])
  })
})
