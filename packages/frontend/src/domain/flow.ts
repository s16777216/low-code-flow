import type { Edge, Node } from '@vue-flow/core'
import type { EdgeDefinition, FunctionDefinition, NodeDefinition, PortDefinition } from '@/api/types'
import type { PortView } from './connection'

export const INPUT_BOUNDARY = '$input'
export const OUTPUT_BOUNDARY = '$output'

export interface Signature {
  inputs: PortDefinition[]
  outputs: PortDefinition[]
}

export interface FlowNodeData {
  kind: 'code' | 'function' | 'input' | 'output'
  label: string
  inputs: PortView[]
  outputs: PortView[]
  code?: string
  functionId?: string
}

export type FlowNode = Node<FlowNodeData>
export type SignatureOf = (functionId: string) => Signature | undefined

export function boundaryNodes(signature: Signature, layout: FunctionDefinition['layout'] = {}): FlowNode[] {
  return [
    { id: INPUT_BOUNDARY, type: 'function', position: layout[INPUT_BOUNDARY] ?? { x: 0, y: 0 }, deletable: false, data: { kind: 'input', label: 'Inputs', inputs: [], outputs: signature.inputs } },
    { id: OUTPUT_BOUNDARY, type: 'function', position: layout[OUTPUT_BOUNDARY] ?? { x: 600, y: 0 }, deletable: false, data: { kind: 'output', label: 'Outputs', inputs: signature.outputs, outputs: [] } },
  ]
}

/** A Function Node never stores ports: they are always the Child's current signature. */
export function projectFunctionNode(node: FlowNode, signatureOf: SignatureOf): FlowNode {
  if (node.data?.kind !== 'function' || !node.data.functionId) return node
  const child = signatureOf(node.data.functionId)
  return { ...node, data: { ...node.data, inputs: child?.inputs ?? [], outputs: child?.outputs ?? [] } }
}

/** Left-to-right layers by longest path from the input boundary, used when no layout was saved. */
function autoLayout(nodeIds: string[], edges: EdgeDefinition[]): Record<string, { x: number; y: number }> {
  const level = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  for (let pass = 0; pass < nodeIds.length; pass++)
    for (const edge of edges) {
      const next = (level.get(edge.sourceNodeId) ?? 0) + 1
      if (next > (level.get(edge.targetNodeId) ?? 0) && next <= nodeIds.length) level.set(edge.targetNodeId, next)
    }
  const rows = new Map<number, number>()
  return Object.fromEntries(
    nodeIds.map((id) => {
      const column = level.get(id) ?? 0
      const row = rows.get(column) ?? 0
      rows.set(column, row + 1)
      return [id, { x: column * 280, y: row * 170 }]
    }),
  )
}

export function toFlow(def: FunctionDefinition, signatureOf: SignatureOf): { nodes: FlowNode[]; edges: Edge[] } {
  const signature = { inputs: def.inputs ?? [], outputs: def.outputs ?? [] }
  const ids = [INPUT_BOUNDARY, ...(def.nodes ?? []).map((n) => n.id), OUTPUT_BOUNDARY]
  const layout = def.layout && Object.keys(def.layout).length ? def.layout : autoLayout(ids, def.edges ?? [])
  const position = (id: string) => layout[id] ?? { x: 0, y: 0 }

  const nodes: FlowNode[] = [
    ...boundaryNodes(signature, layout).map((n) => ({ ...n, position: position(n.id) })),
    ...(def.nodes ?? []).map((node): FlowNode =>
      projectFunctionNode(
        {
          id: node.id,
          type: 'function',
          position: position(node.id),
          data: {
            kind: node.kind,
            label: node.name ?? node.id,
            inputs: node.inputs ?? [],
            outputs: node.outputs ?? [],
            ...(node.code !== undefined ? { code: node.code } : {}),
            ...(node.functionId ? { functionId: node.functionId } : {}),
          },
        },
        signatureOf,
      ),
    ),
  ]
  const edges: Edge[] = (def.edges ?? []).map((e) => ({ id: e.id, source: e.sourceNodeId, sourceHandle: e.sourcePortId, target: e.targetNodeId, targetHandle: e.targetPortId }))
  return { nodes, edges }
}

export function fromFlow(signature: Signature, nodes: FlowNode[], edges: Edge[]): FunctionDefinition {
  const definitionNodes: NodeDefinition[] = nodes
    .filter((n) => n.data?.kind === 'code' || n.data?.kind === 'function')
    .map((n) => {
      const data = n.data!
      return data.kind === 'function'
        ? { id: n.id, kind: 'function', name: data.label, functionId: data.functionId }
        : { id: n.id, kind: 'code', name: data.label, code: data.code ?? '', inputs: data.inputs, outputs: data.outputs }
    })
  return {
    inputs: signature.inputs,
    outputs: signature.outputs,
    nodes: definitionNodes,
    edges: edges.map((e) => ({ id: e.id, sourceNodeId: e.source, sourcePortId: e.sourceHandle ?? '', targetNodeId: e.target, targetPortId: e.targetHandle ?? '' })),
    layout: Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])),
  }
}
