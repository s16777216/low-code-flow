import { describe, it, expect } from 'vitest'

import type { PortDefinition, SystemType, TypeInfo } from '@/api/types'
import { createCatalog } from '../catalog'
import { ctxDeclarations, flattenMessage, mapLine, tsTypeOf, wrapForCheck } from '../codeTypings'

const system: SystemType[] = ['string', 'number', 'boolean', 'date', 'object', 'array', 'function', 'any'].map((kind) => ({ id: `system:${kind}`, name: kind, rootKind: kind as SystemType['rootKind'], immutable: true }))
const userId: TypeInfo = { id: 'user-id', kind: 'type', name: 'UserId', revision: 1, updatedAt: '', executable: true, diagnostics: { errors: 0, warnings: 0 }, rootKind: 'string', ancestry: ['user-id', 'system:string'] }
const catalog = createCatalog(system, [userId])
const port = (name: string, typeId: string): PortDefinition => ({ id: name, name, typeId })

describe('code typings', () => {
  it('maps every root kind to what the code actually sees', () => {
    expect(['string', 'number', 'boolean', 'date', 'object', 'array', 'any', null].map((k) => tsTypeOf(k as never))).toEqual(['string', 'number', 'boolean', 'Date', 'Record<string, unknown>', 'unknown[]', 'unknown', 'unknown'])
    expect(tsTypeOf('function')).toContain('function-ref')
  })

  it('types ctx.inputs by port name, using the root kind and naming the Type in a comment', () => {
    const text = ctxDeclarations([port('userId', 'user-id'), port('when', 'system:date')], [], catalog)
    expect(text).toContain('userId: string;')
    expect(text).toContain('/** UserId */')
    expect(text).toContain('when: Date;')
    expect(text).toMatch(/declare const ctx: \{[\s\S]*inputs: \{[\s\S]*\};[\s\S]*log\(/)
  })

  it('describes the required outputs by port name', () => {
    const text = ctxDeclarations([], [port('total', 'system:number'), port('ok', 'system:boolean')], catalog)
    expect(text).toMatch(/type __Outputs = \{[\s\S]*total: number;[\s\S]*ok: boolean;[\s\S]*\};/)
  })

  it('quotes port names that are not identifiers and survives odd Type names', () => {
    const odd = createCatalog(system, [{ ...userId, name: 'a */ b' }])
    const text = ctxDeclarations([port('first name', 'user-id')], [], odd)
    expect(text).toContain('"first name": string;')
    expect(text).not.toContain('a */ b')
  })

  it('treats a missing Type as unknown rather than failing', () => {
    expect(ctxDeclarations([port('x', 'gone')], [], catalog)).toContain('x: unknown;')
  })

  it('wraps the code as a function body that must return the outputs, after the declarations', () => {
    const declarations = ctxDeclarations([port('a', 'system:number')], [port('b', 'system:number')], catalog)
    const { source, lineOffset } = wrapForCheck('const a = 1\nreturn { a }', declarations)
    expect(source.startsWith(declarations)).toBe(true)
    expect(source.split('\n').slice(lineOffset, lineOffset + 2)).toEqual(['const a = 1', 'return { a }'])
    expect(source.split('\n')[lineOffset - 1]).toBe('async function __run(): Promise<__Outputs> {')
  })

  it('puts a newline between declarations that lack one and the function', () => {
    const { source, lineOffset } = wrapForCheck('return {}', 'type __Outputs = {}')
    expect(source.split('\n')[lineOffset]).toBe('return {}')
  })

  it('maps problems back to the user code and clamps the ones on the wrapper', () => {
    expect(mapLine(3, 1, 5)).toBe(2)
    expect(mapLine(1, 1, 5)).toBe(1)
    expect(mapLine(0, 1, 5)).toBe(1)
    expect(mapLine(9, 1, 5)).toBe(5)
    expect(mapLine(2, 1, 0)).toBe(1)
  })

  it('flattens chained compiler messages into one line', () => {
    expect(flattenMessage('plain')).toBe('plain')
    expect(flattenMessage({ messageText: 'Type {} is not assignable', next: [{ messageText: 'Property total is missing' }] })).toBe('Type {} is not assignable Property total is missing')
  })
})
