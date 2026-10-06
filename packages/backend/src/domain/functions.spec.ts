import { describe, expect, it } from 'vitest'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY, nodePorts, normalizeFunction, validateFunctionDefinition, type FunctionDefinition, type FunctionLookup } from './functions.ts'
import type { TypeDefinition } from './types.ts'

const types: Record<string, TypeDefinition> = {
  UserId: { parentTypeId: 'system:string' },
  OrderId: { parentTypeId: 'system:string' },
  User: { parentTypeId: 'system:object' },
  AdminUser: { parentTypeId: 'User' },
}
const port = (id: string, typeId: string, name = id) => ({ id, name, typeId })
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId })
const code = (id: string, inputs: ReturnType<typeof port>[], outputs: ReturnType<typeof port>[]) => ({ id, kind: 'code' as const, inputs, outputs })

function check(def: unknown, functions: Record<string, FunctionDefinition> = {}, self = 'self') {
  const functionLookup: FunctionLookup = (id) => (id === self ? normalizeFunction(def) : functions[id])
  return validateFunctionDefinition(self, def, {
    typeLookup: (id) => types[id],
    functionLookup,
    kindOf: (id) => (id in functions ? 'function' : id in types ? 'type' : undefined),
  }).map((d) => d.code)
}

/** input userId -> a(userId) -> b(userId: string) -> output result */
const valid = {
  inputs: [port('p-user', 'UserId', 'userId')],
  outputs: [port('p-out', 'system:string', 'result')],
  nodes: [code('a', [port('a-in', 'UserId')], [port('a-out', 'UserId')]), code('b', [port('b-in', 'system:string')], [port('b-out', 'system:string')])],
  edges: [edge('e1', INPUT_BOUNDARY, 'p-user', 'a', 'a-in'), edge('e2', 'a', 'a-out', 'b', 'b-in'), edge('e3', 'b', 'b-out', OUTPUT_BOUNDARY, 'p-out')],
}

describe('ports', () => {
  it('accepts several named typed ports on a function and a node', () => {
    const def = { ...valid, inputs: [port('p1', 'UserId', 'userId'), port('p2', 'OrderId', 'orderId')], outputs: [port('o1', 'system:string', 'order'), port('o2', 'system:string', 'receipt')], edges: [], nodes: [] }
    expect(check(def)).not.toContain('duplicate_port_name')
    expect(check(def)).toEqual(['unconnected_output', 'unconnected_output'])
  })

  it('rejects duplicate names per direction and duplicate ids', () => {
    expect(check({ ...valid, inputs: [port('p1', 'UserId', 'x'), port('p2', 'OrderId', 'x')] })).toContain('duplicate_port_name')
    expect(check({ ...valid, inputs: [port('p1', 'UserId', 'a'), port('p1', 'OrderId', 'b')] })).toContain('duplicate_port_id')
    expect(check({ ...valid, nodes: [code('a', [port('i', 'UserId', 'same'), port('j', 'UserId', 'same')], [])] })).toContain('duplicate_port_name')
  })

  it('allows the same name as an input and as an output', () => {
    expect(check({ ...valid, nodes: [code('a', [port('a-in', 'UserId', 'value')], [port('a-out', 'UserId', 'value')]), valid.nodes[1]] })).toEqual([])
  })

  it('keeps edges attached when a port is renamed but keeps its id', () => {
    const renamed = { ...valid, inputs: [port('p-user', 'UserId', 'renamedUserId')] }
    expect(check(renamed)).toEqual([])
  })

  it('rejects unknown system types and function ids used as types', () => {
    expect(check({ ...valid, inputs: [port('p', 'system:nope')] })).toContain('unknown_system_type')
    expect(check({ ...valid, inputs: [port('p', 'fn-1')] }, { 'fn-1': normalizeFunction({}) })).toContain('not_a_type')
  })
})

describe('boundary projection', () => {
  it('derives boundary ports from the signature with no stored copies', () => {
    const def = normalizeFunction(valid)
    expect(nodePorts(def, INPUT_BOUNDARY, () => undefined)).toEqual({ inputs: [], outputs: def.inputs })
    expect(nodePorts(def, OUTPUT_BOUNDARY, () => undefined)).toEqual({ inputs: def.outputs, outputs: [] })

    const changed = normalizeFunction({ ...valid, inputs: [...valid.inputs, port('p-new', 'OrderId', 'orderId')] })
    expect(nodePorts(changed, INPUT_BOUNDARY, () => undefined)!.outputs.map((p) => p.id)).toEqual(['p-user', 'p-new'])
  })

  it('reserves the boundary node ids', () => {
    expect(check({ ...valid, nodes: [...valid.nodes, code(INPUT_BOUNDARY, [], [])] })).toContain('reserved_node_id')
  })
})

describe('function nodes', () => {
  const child = normalizeFunction({ inputs: [port('c-in', 'UserId'), port('c-in2', 'OrderId')], outputs: [port('c-o1', 'User'), port('c-o2', 'system:string'), port('c-o3', 'system:number')], nodes: [], edges: [] })
  const parent = (edges: ReturnType<typeof edge>[]) => ({
    inputs: [port('p-user', 'UserId'), port('p-order', 'OrderId')],
    outputs: [port('p-out', 'User')],
    nodes: [{ id: 'call', kind: 'function', functionId: 'child' }],
    edges: [edge('e1', INPUT_BOUNDARY, 'p-user', 'call', 'c-in'), edge('e2', INPUT_BOUNDARY, 'p-order', 'call', 'c-in2'), edge('e3', 'call', 'c-o1', OUTPUT_BOUNDARY, 'p-out'), ...edges],
  })

  it('projects the child signature: two inputs and three outputs', () => {
    const ports = nodePorts(normalizeFunction(parent([])), 'call', (id) => (id === 'child' ? child : undefined))!
    expect(ports.inputs.map((p) => p.id)).toEqual(['c-in', 'c-in2'])
    expect(ports.outputs.map((p) => p.id)).toEqual(['c-o1', 'c-o2', 'c-o3'])
    expect(check(parent([]), { child })).toEqual([])
  })

  it('only exposes public ports, not child internals', () => {
    const withInternals = normalizeFunction({ ...child, nodes: [code('secret', [port('s-in', 'UserId')], [port('s-out', 'UserId')])] })
    expect(check(parent([edge('bad', 'call', 's-out', OUTPUT_BOUNDARY, 'p-out')]), { child: withInternals })).toContain('edge_unknown_port')
  })

  it('invalidates parent edges when a child port is removed or retyped, but not after an internal change', () => {
    const removed = normalizeFunction({ ...child, outputs: child.outputs.filter((p) => p.id !== 'c-o1') })
    expect(check(parent([]), { child: removed })).toContain('edge_unknown_port')

    const retyped = normalizeFunction({ ...child, outputs: [port('c-o1', 'system:number'), ...child.outputs.slice(1)] })
    expect(check(parent([]), { child: retyped })).toContain('incompatible_edge')

    const internal = normalizeFunction({ ...child, nodes: [code('x', [], [])] })
    expect(check(parent([]), { child: internal })).toEqual([])
  })

  it('rejects a type used as a function node target and call cycles', () => {
    expect(check({ ...valid, nodes: [{ id: 'x', kind: 'function', functionId: 'User' }] })).toContain('not_a_function')
    const other = normalizeFunction({ nodes: [{ id: 'back', kind: 'function', functionId: 'self' }] })
    expect(check({ nodes: [{ id: 'call', kind: 'function', functionId: 'other' }] }, { other })).toContain('function_call_cycle')
    expect(check({ nodes: [{ id: 'me', kind: 'function', functionId: 'self' }] })).toContain('function_call_cycle')
  })
})

describe('edges', () => {
  it('rejects missing nodes and ports and wrong directions', () => {
    expect(check({ ...valid, edges: [...valid.edges, edge('x', 'ghost', 'o', 'b', 'b-in')] })).toContain('edge_unknown_node')
    expect(check({ ...valid, edges: [...valid.edges.slice(0, 2), edge('e3', 'b', 'nope', OUTPUT_BOUNDARY, 'p-out')] })).toContain('edge_unknown_port')
    expect(check({ ...valid, edges: [edge('e1', INPUT_BOUNDARY, 'p-user', 'a', 'a-in'), edge('e2', 'a', 'a-in', 'b', 'b-in'), valid.edges[2]] })).toContain('edge_wrong_direction')
    expect(check({ ...valid, edges: [edge('e1', INPUT_BOUNDARY, 'p-user', 'a', 'a-out'), valid.edges[1], valid.edges[2]] })).toContain('edge_wrong_direction')
  })

  it('accepts descendant to ancestor and any in both directions, and rejects the rest', () => {
    const flow = (src: string, dst: string) => ({
      inputs: [port('p', src)],
      outputs: [port('o', dst)],
      nodes: [],
      edges: [edge('e', INPUT_BOUNDARY, 'p', OUTPUT_BOUNDARY, 'o')],
    })
    expect(check(flow('AdminUser', 'User'))).toEqual([])
    expect(check(flow('User', 'AdminUser'))).toEqual(['incompatible_edge'])
    expect(check(flow('UserId', 'OrderId'))).toEqual(['incompatible_edge'])
    expect(check(flow('UserId', 'system:any'))).toEqual([])
    expect(check(flow('system:any', 'UserId'))).toEqual([])
  })
})

describe('cardinality and DAG', () => {
  it('rejects several producers for one input but allows fan-out', () => {
    const twoProducers = { ...valid, inputs: [...valid.inputs, port('p2', 'system:string')], edges: [...valid.edges, edge('dup', INPUT_BOUNDARY, 'p2', 'b', 'b-in')] }
    expect(check(twoProducers)).toContain('multiple_producers')

    const fanOut = {
      inputs: [port('p', 'UserId')],
      outputs: [port('o1', 'UserId'), port('o2', 'system:string')],
      nodes: [],
      edges: [edge('e1', INPUT_BOUNDARY, 'p', OUTPUT_BOUNDARY, 'o1'), edge('e2', INPUT_BOUNDARY, 'p', OUTPUT_BOUNDARY, 'o2')],
    }
    expect(check(fanOut)).toEqual([])
  })

  it('rejects unconnected required inputs and function outputs', () => {
    expect(check({ ...valid, edges: [valid.edges[0], valid.edges[2]] })).toContain('unconnected_input')
    expect(check({ ...valid, edges: valid.edges.slice(0, 2) })).toContain('unconnected_output')
  })

  it('detects a cycle derived from port edges', () => {
    const cyclic = {
      inputs: [],
      outputs: [],
      nodes: [code('a', [port('a-in', 'system:string')], [port('a-out', 'system:string')]), code('b', [port('b-in', 'system:string')], [port('b-out', 'system:string')])],
      edges: [edge('e1', 'a', 'a-out', 'b', 'b-in'), edge('e2', 'b', 'b-out', 'a', 'a-in')],
    }
    expect(check(cyclic)).toContain('dag_cycle')
    expect(check(valid)).not.toContain('dag_cycle')
  })

  it('does not throw on malformed drafts', () => {
    expect(() => check({ inputs: 'nope', nodes: [null, 3, { kind: 'x' }], edges: [{}] })).not.toThrow()
    expect(check({ inputs: 'nope' })).toContain('invalid_definition')
    expect(check({})).toEqual([])
  })
})
