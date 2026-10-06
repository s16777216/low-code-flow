import { describe, it, expect } from 'vitest'

import type { SystemType, TypeInfo } from '@/api/types'
import { createCatalog } from '../catalog'

const system: SystemType[] = [
  { id: 'system:string', name: 'string', rootKind: 'string', immutable: true },
  { id: 'system:object', name: 'object', rootKind: 'object', immutable: true },
]
const type = (id: string, name: string, rootKind: TypeInfo['rootKind'], ancestry: string[]): TypeInfo => ({
  id,
  kind: 'type',
  name,
  revision: 1,
  updatedAt: '',
  executable: true,
  diagnostics: { errors: 0, warnings: 0 },
  rootKind,
  ancestry,
})

describe('type catalog', () => {
  const catalog = createCatalog(system, [
    type('id', 'Id', 'string', ['id', 'system:string']),
    type('userId', 'UserId', 'string', ['userId', 'id', 'system:string']),
    type('user', 'User', 'object', ['user', 'system:object']),
  ])

  it('looks up names and root kinds, marking system types', () => {
    expect(catalog.name('userId')).toBe('UserId')
    expect(catalog.rootKind('userId')).toBe('string')
    expect(catalog.get('system:string')).toMatchObject({ system: true })
    expect(catalog.get('userId')).toMatchObject({ system: false })
    expect(catalog.name('gone')).toContain('missing')
  })

  it('finds descendants, which cannot be chosen as a parent without a cycle', () => {
    expect(catalog.descendantsOf('id')).toEqual(['userId'])
    expect(catalog.descendantsOf('system:string').sort()).toEqual(['id', 'userId'])
    expect(catalog.descendantsOf('userId')).toEqual([])
  })
})
