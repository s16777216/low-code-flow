import { describe, it, expect } from 'vitest'

import { checkConnection, type PortGraph } from '../connection'

const chains: Record<string, string[]> = {
  'system:number': ['system:number'],
  'system:string': ['system:string'],
  userId: ['userId', 'system:string'],
  orderId: ['orderId', 'system:string'],
}
const ancestryOf = (id: string) => chains[id]
const typeName = (id: string) => id.replace('system:', '')

const nodes: PortGraph['nodes'] = [
  { id: 'a', data: { outputs: [{ id: 'a-out', name: 'out', typeId: 'system:number' }] } },
  {
    id: 'b',
    data: { inputs: [{ id: 'b-in', name: 'in', typeId: 'system:number' }], outputs: [{ id: 'b-out', name: 'out', typeId: 'system:string' }] },
  },
  {
    id: 'c',
    data: {
      inputs: [
        { id: 'c-num', name: 'num', typeId: 'system:number' },
        { id: 'c-str', name: 'str', typeId: 'system:string' },
        { id: 'c-any', name: 'anything', typeId: 'system:any' },
        { id: 'c-user', name: 'user', typeId: 'userId' },
      ],
      outputs: [
        { id: 'c-out', name: 'out', typeId: 'system:number' },
        { id: 'c-order', name: 'order', typeId: 'orderId' },
      ],
    },
  },
  { id: 'd', data: { inputs: [{ id: 'd-str', name: 'str', typeId: 'system:string' }] } },
]

const aToB = { source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }
const check = (connection: Parameters<typeof checkConnection>[0], edges: PortGraph['edges'] = []) =>
  checkConnection(connection, { nodes, edges }, ancestryOf, typeName)

describe('checkConnection', () => {
  it('accepts an output connected to a compatible input', () => {
    expect(check(aToB)).toEqual({ valid: true })
  })

  it('accepts a connection into an any input', () => {
    expect(check({ source: 'b', sourceHandle: 'b-out', target: 'c', targetHandle: 'c-any' })).toEqual({ valid: true })
  })

  it('accepts a subtype into its base type', () => {
    expect(check({ source: 'c', sourceHandle: 'c-order', target: 'd', targetHandle: 'd-str' })).toEqual({ valid: true })
  })

  it('explains an incompatible connection with the type names', () => {
    expect(check({ source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-str' })).toEqual({
      valid: false,
      reason: expect.stringContaining('number is not assignable to string'),
    })
  })

  it('rejects sibling types that share a base', () => {
    const result = check({ source: 'c', sourceHandle: 'c-order', target: 'c', targetHandle: 'c-user' })
    expect(result.valid).toBe(false)
    expect(check({ source: 'c', sourceHandle: 'c-order', target: 'b', targetHandle: 'b-in' }).valid).toBe(false)
  })

  it('rejects unknown or wrong-direction ports', () => {
    expect(check({ source: 'b', sourceHandle: 'b-in', target: 'c', targetHandle: 'c-num' }).valid).toBe(false)
    expect(check({ source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-out' }).valid).toBe(false)
  })

  it('rejects a second producer for the same input', () => {
    expect(check({ source: 'c', sourceHandle: 'c-out', target: 'b', targetHandle: 'b-in' }, [aToB])).toEqual({
      valid: false,
      reason: 'Input in already has a producer',
    })
  })

  it('does not count an existing edge against itself when it is re-validated', () => {
    const existing = { id: 'e-ab', ...aToB }
    expect(check(existing, [existing])).toEqual({ valid: true })
    expect(check(aToB, [existing]).valid).toBe(false)
    expect(check({ id: 'other', source: 'c', sourceHandle: 'c-out', target: 'b', targetHandle: 'b-in' }, [existing]).valid).toBe(false)
  })

  it('allows one output to fan out to multiple inputs', () => {
    expect(check({ source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-num' }, [aToB])).toEqual({ valid: true })
  })

  it('rejects a connection that closes a cycle, including a node to itself', () => {
    const bToC = { source: 'b', sourceHandle: 'b-out', target: 'c', targetHandle: 'c-str' }
    expect(check({ source: 'c', sourceHandle: 'c-out', target: 'b', targetHandle: 'b-in' }, [bToC])).toEqual({
      valid: false,
      reason: 'Connection would create a cycle',
    })
    expect(check({ source: 'c', sourceHandle: 'c-out', target: 'c', targetHandle: 'c-num' })).toEqual({
      valid: false,
      reason: 'Connection would create a cycle',
    })
  })
})
