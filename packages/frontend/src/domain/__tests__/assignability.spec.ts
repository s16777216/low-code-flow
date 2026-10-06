import { describe, it, expect } from 'vitest'

import { isAssignable, type AncestryOf } from '../assignability'

const chains: Record<string, string[]> = {
  'system:string': ['system:string'],
  'system:number': ['system:number'],
  'system:date': ['system:date'],
  'system:object': ['system:object'],
  id: ['id', 'system:string'],
  userId: ['userId', 'id', 'system:string'],
  orderId: ['orderId', 'id', 'system:string'],
  user: ['user', 'system:object'],
  admin: ['admin', 'user', 'system:object'],
}
const ancestryOf: AncestryOf = (id) => chains[id]

describe('isAssignable', () => {
  it.each([
    ['the same type', 'userId', 'userId', true],
    ['a descendant to its parent', 'admin', 'user', true],
    ['a descendant to a distant ancestor', 'userId', 'system:string', true],
    ['a parent to its descendant', 'user', 'admin', false],
    ['siblings with the same structure', 'userId', 'orderId', false],
    ['different base kinds', 'system:string', 'system:number', false],
    ['anything into any', 'userId', 'system:any', true],
    ['any into anything', 'system:any', 'system:date', true],
    ['an unknown type to a different one', 'ghost', 'user', false],
  ])('%s', (_name, source, target, expected) => {
    expect(isAssignable(source, target, ancestryOf)).toBe(expected)
  })
})
