import { describe, expect, it } from 'vitest'
import { decodeDate, decodeFunctionRef, encodeDate, encodeFunctionRef, assertTransportable, createTypedValue, resolveFunctionReference, transferValue, type TypeContext } from './values.ts'
import type { TypeDefinition } from './types.ts'

const types: Record<string, TypeDefinition> = {
  UserId: { parentTypeId: 'system:string' },
  OrderId: { parentTypeId: 'system:string' },
}
const ctx: TypeContext = { lookup: (id) => types[id], hashOf: (id) => `hash:${id}` }

describe('typed values', () => {
  it('keeps distinct nominal identities for equal raw values', () => {
    const user = createTypedValue('UserId', '123', ctx)
    const order = createTypedValue('OrderId', '123', ctx)
    expect(user).toMatchObject({ ok: true, value: { typeId: 'UserId', typeDefinitionHash: 'hash:UserId', value: '123' } })
    expect(order).toMatchObject({ ok: true, value: { typeId: 'OrderId' } })
  })

  it('rejects a value that violates its declared type', () => {
    expect(createTypedValue('UserId', 123, ctx)).toEqual({ ok: false, errors: ['$: expected string'] })
  })

  it('does not let sibling types pass directly, but accepts an explicit construction', () => {
    const user = createTypedValue('UserId', '123', ctx)
    if (!user.ok) throw new Error('setup')
    expect(transferValue(user.value, 'OrderId', ctx)).toEqual({ ok: false, errors: ['Type UserId is not assignable to OrderId'] })

    const constructed = createTypedValue('OrderId', String(user.value.value), ctx)
    expect(constructed).toMatchObject({ ok: true, value: { typeId: 'OrderId', value: '123' } })
  })
})

describe('any transfer', () => {
  it('keeps the original identity when a value enters any', () => {
    const user = createTypedValue('UserId', '123', ctx)
    if (!user.ok) throw new Error('setup')
    expect(transferValue(user.value, 'system:any', ctx)).toEqual({ ok: true, value: user.value })
  })

  it('validates and relabels a value leaving any', () => {
    const loose = { typeId: 'system:any', typeDefinitionHash: 'hash:system:any', value: '123' as const }
    expect(transferValue(loose, 'UserId', ctx)).toMatchObject({ ok: true, value: { typeId: 'UserId', typeDefinitionHash: 'hash:UserId', value: '123' } })
  })

  it('fails the transfer when a value leaving any does not fit the target', () => {
    const loose = { typeId: 'system:any', typeDefinitionHash: 'h', value: 42 as const }
    expect(transferValue(loose, 'UserId', ctx)).toEqual({ ok: false, errors: ['$: expected string'] })
  })

  it('accepts any JSON value for an any port but rejects closures', () => {
    expect(createTypedValue('system:any', { a: [1, null, 'x'] }, ctx).ok).toBe(true)
    expect(createTypedValue('system:any', { run: () => 1 }, ctx)).toMatchObject({ ok: false })
  })
})

describe('transport codecs', () => {
  it('round-trips a date instant through its tagged form', () => {
    const instant = new Date('2026-10-02T08:30:15.123Z')
    const encoded = encodeDate(instant)
    expect(encoded).toEqual({ $kind: 'date', iso: '2026-10-02T08:30:15.123Z' })
    expect(decodeDate(JSON.parse(JSON.stringify(encoded))).getTime()).toBe(instant.getTime())
  })

  it('requires a time zone on dates', () => {
    expect(() => decodeDate({ $kind: 'date', iso: '2026-10-02T08:30:15' })).toThrow(/time zone/)
    expect(createTypedValue('system:date', { $kind: 'date', iso: '2026-10-02T08:30:15+08:00' }, ctx).ok).toBe(true)
    expect(createTypedValue('system:date', '2026-10-02', ctx).ok).toBe(false)
  })

  it('round-trips function references by Function ID only', () => {
    expect(decodeFunctionRef(encodeFunctionRef('fn-1'))).toBe('fn-1')
    expect(createTypedValue('system:function', encodeFunctionRef('fn-1'), ctx).ok).toBe(true)
    expect(createTypedValue('system:function', () => 1, ctx).ok).toBe(false)
  })

  it('rejects closures and non-JSON values from crossing the boundary', () => {
    expect(() => assertTransportable({ cb: () => 1 })).toThrow(/closures/)
    expect(() => assertTransportable({ n: Number.NaN })).toThrow(/JSON number/)
    expect(() => assertTransportable({ ok: [1, 'a', null] })).not.toThrow()
  })

  it('resolves a function reference from the snapshot first, then from the latest definition', () => {
    const pinned = new Map([['a', { hash: 'pinned-a' }]])
    const latest = (id: string) => (id === 'a' ? { hash: 'latest-a' } : id === 'b' ? { hash: 'latest-b' } : undefined)
    expect(resolveFunctionReference('a', pinned, latest)).toEqual({ source: 'snapshot', hash: 'pinned-a' })
    expect(resolveFunctionReference('b', pinned, latest)).toEqual({ source: 'latest', hash: 'latest-b' })
    expect(resolveFunctionReference('c', pinned, latest)).toBeUndefined()
  })
})
