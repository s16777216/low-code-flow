import { describe, it, expect } from 'vitest'

import { checkConnection, type PortGraph } from '../connection'

// a(out: number) -> b(in: number, out: string) ; c(in: number, in2: string, in3: any, out: number)
const nodes: PortGraph['nodes'] = [
  {
    id: 'a',
    data: { label: 'A', outputs: [{ id: 'a-out', name: 'out', type: 'number' }] },
  },
  {
    id: 'b',
    data: {
      label: 'B',
      inputs: [{ id: 'b-in', name: 'in', type: 'number' }],
      outputs: [{ id: 'b-out', name: 'out', type: 'string' }],
    },
  },
  {
    id: 'c',
    data: {
      label: 'C',
      inputs: [
        { id: 'c-num', name: 'num', type: 'number' },
        { id: 'c-str', name: 'str', type: 'string' },
        { id: 'c-any', name: 'anything', type: 'any' },
      ],
      outputs: [{ id: 'c-out', name: 'out', type: 'number' }],
    },
  },
]

const aToB = { source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }

describe('checkConnection', () => {
  it('accepts an output connected to a compatible input', () => {
    const result = checkConnection(aToB, { nodes, edges: [] })
    expect(result).toEqual({ valid: true })
  })

  it('accepts a connection into an any input', () => {
    const result = checkConnection(
      { source: 'b', sourceHandle: 'b-out', target: 'c', targetHandle: 'c-any' },
      { nodes, edges: [] },
    )
    expect(result).toEqual({ valid: true })
  })

  it('rejects incompatible port types', () => {
    const result = checkConnection(
      { source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-str' },
      { nodes, edges: [] },
    )
    expect(result).toEqual({ valid: false, reason: 'Type number is not assignable to string' })
  })

  it('rejects unknown or wrong-direction ports', () => {
    const fromInput = checkConnection(
      { source: 'b', sourceHandle: 'b-in', target: 'c', targetHandle: 'c-num' },
      { nodes, edges: [] },
    )
    const toOutput = checkConnection(
      { source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-out' },
      { nodes, edges: [] },
    )
    expect(fromInput.valid).toBe(false)
    expect(toOutput.valid).toBe(false)
  })

  it('rejects a second producer for the same input', () => {
    const result = checkConnection(
      { source: 'c', sourceHandle: 'c-out', target: 'b', targetHandle: 'b-in' },
      { nodes, edges: [aToB] },
    )
    expect(result).toEqual({ valid: false, reason: 'Input in already has a producer' })
  })

  it('allows one output to fan out to multiple inputs', () => {
    const result = checkConnection(
      { source: 'a', sourceHandle: 'a-out', target: 'c', targetHandle: 'c-num' },
      { nodes, edges: [aToB] },
    )
    expect(result).toEqual({ valid: true })
  })

  it('rejects a connection that closes a cycle', () => {
    const bToC = { source: 'b', sourceHandle: 'b-out', target: 'c', targetHandle: 'c-str' }
    const result = checkConnection(
      { source: 'c', sourceHandle: 'c-out', target: 'b', targetHandle: 'b-in' },
      { nodes, edges: [bToC] },
    )
    expect(result).toEqual({ valid: false, reason: 'Connection would create a cycle' })
  })

  it('rejects connecting a node to itself', () => {
    const result = checkConnection(
      { source: 'c', sourceHandle: 'c-out', target: 'c', targetHandle: 'c-num' },
      { nodes, edges: [] },
    )
    expect(result).toEqual({ valid: false, reason: 'Connection would create a cycle' })
  })
})
