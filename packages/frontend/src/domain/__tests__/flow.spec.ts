import { describe, it, expect } from 'vitest'

import type { FunctionDefinition } from '@/api/types'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY, fromFlow, projectFunctionNode, toFlow, type Signature } from '../flow'

const port = (id: string, typeId = 'system:string', name = id) => ({ id, name, typeId })
const child: Signature = { inputs: [port('c-in')], outputs: [port('c-out'), port('c-out2')] }
const signatureOf = (id: string) => (id === 'child' ? child : undefined)

const definition: FunctionDefinition = {
  inputs: [port('p-in', 'system:string', 'x')],
  outputs: [port('p-out', 'system:string', 'y')],
  nodes: [
    { id: 'code', kind: 'code', name: 'Code', code: 'return {}', inputs: [port('k-in')], outputs: [port('k-out')] },
    { id: 'call', kind: 'function', name: 'Call', functionId: 'child' },
  ],
  edges: [
    { id: 'e1', sourceNodeId: INPUT_BOUNDARY, sourcePortId: 'p-in', targetNodeId: 'code', targetPortId: 'k-in' },
    { id: 'e2', sourceNodeId: 'code', sourcePortId: 'k-out', targetNodeId: 'call', targetPortId: 'c-in' },
    { id: 'e3', sourceNodeId: 'call', sourcePortId: 'c-out', targetNodeId: OUTPUT_BOUNDARY, targetPortId: 'p-out' },
  ],
}

describe('function definition <-> flow', () => {
  it('adds boundary nodes whose ports are projected from the signature', () => {
    const { nodes } = toFlow(definition, signatureOf)
    expect(nodes.find((n) => n.id === INPUT_BOUNDARY)!.data).toMatchObject({ kind: 'input', outputs: definition.inputs })
    expect(nodes.find((n) => n.id === OUTPUT_BOUNDARY)!.data).toMatchObject({ kind: 'output', inputs: definition.outputs })
  })

  it('projects a function node from the child signature, never from stored ports', () => {
    const call = toFlow(definition, signatureOf).nodes.find((n) => n.id === 'call')!
    expect(call.data!.inputs.map((p) => p.id)).toEqual(['c-in'])
    expect(call.data!.outputs.map((p) => p.id)).toEqual(['c-out', 'c-out2'])
    expect(projectFunctionNode(call, () => ({ inputs: [], outputs: [] })).data!.outputs).toEqual([])
    expect(toFlow(definition, () => undefined).nodes.find((n) => n.id === 'call')!.data!.outputs).toEqual([])
  })

  it('round-trips through the flow without losing nodes or edges, and saves no function ports', () => {
    const { nodes, edges } = toFlow(definition, signatureOf)
    const back = fromFlow({ inputs: definition.inputs, outputs: definition.outputs }, nodes, edges)
    expect(back.nodes).toEqual([
      { id: 'code', kind: 'code', name: 'Code', code: 'return {}', inputs: [port('k-in')], outputs: [port('k-out')] },
      { id: 'call', kind: 'function', name: 'Call', functionId: 'child' },
    ])
    expect(back.edges).toEqual(definition.edges)
    expect(Object.keys(back.layout!).sort()).toEqual([INPUT_BOUNDARY, OUTPUT_BOUNDARY, 'call', 'code'].sort())
  })

  it('lays nodes out left to right when no layout was saved, and keeps a saved layout', () => {
    const auto = toFlow(definition, signatureOf).nodes
    const x = (id: string) => auto.find((n) => n.id === id)!.position.x
    expect(x(INPUT_BOUNDARY)).toBeLessThan(x('code'))
    expect(x('code')).toBeLessThan(x('call'))
    expect(x('call')).toBeLessThan(x(OUTPUT_BOUNDARY))

    const saved = toFlow({ ...definition, layout: { [INPUT_BOUNDARY]: { x: 5, y: 6 }, code: { x: 50, y: 60 } } }, signatureOf).nodes
    expect(saved.find((n) => n.id === 'code')!.position).toEqual({ x: 50, y: 60 })
  })

  it('keeps edges when a port is renamed but keeps its id', () => {
    const { nodes, edges } = toFlow(definition, signatureOf)
    const renamed = nodes.map((n) => (n.id === 'code' ? { ...n, data: { ...n.data!, inputs: [port('k-in', 'system:string', 'renamed')] } } : n))
    const back = fromFlow({ inputs: definition.inputs, outputs: definition.outputs }, renamed, edges)
    expect(back.edges).toEqual(definition.edges)
    expect(back.nodes[0]!.inputs).toEqual([port('k-in', 'system:string', 'renamed')])
  })
})
