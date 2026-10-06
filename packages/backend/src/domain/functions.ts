import type { Diagnostic } from '../registry.ts'
import { baseKindOf, isAssignable, isPlainObject, type TypeLookup } from './types.ts'

/** Reserved node IDs for the Function boundary; their ports are projected from the signature. */
export const INPUT_BOUNDARY = '$input'
export const OUTPUT_BOUNDARY = '$output'

export interface PortDefinition {
  id: string
  name: string
  typeId: string
}

export interface CodeNodeDefinition {
  id: string
  kind: 'code'
  name?: string
  code?: string
  inputs: PortDefinition[]
  outputs: PortDefinition[]
}

/** A Function Node stores only the Child ID; its ports always come from the Child's current signature. */
export interface FunctionNodeDefinition {
  id: string
  kind: 'function'
  name?: string
  functionId: string
}

export type NodeDefinition = CodeNodeDefinition | FunctionNodeDefinition

export interface EdgeDefinition {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

export interface FunctionDefinition {
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  nodes: NodeDefinition[]
  edges: EdgeDefinition[]
}

export interface NodePorts {
  inputs: PortDefinition[]
  outputs: PortDefinition[]
}

export type FunctionLookup = (functionId: string) => FunctionDefinition | undefined

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const portsOf = (value: unknown) => list(value).filter(isPlainObject) as unknown as PortDefinition[]

/** Tolerant of drafts: missing or malformed collections become empty. Shape problems are reported by validation. */
export function normalizeFunction(definition: unknown): FunctionDefinition {
  const def = isPlainObject(definition) ? definition : {}
  return {
    inputs: list(def.inputs).filter(isPlainObject) as unknown as PortDefinition[],
    outputs: list(def.outputs).filter(isPlainObject) as unknown as PortDefinition[],
    nodes: list(def.nodes).filter(isPlainObject) as unknown as NodeDefinition[],
    edges: list(def.edges).filter(isPlainObject) as unknown as EdgeDefinition[],
  }
}

export const signatureOf = (def: FunctionDefinition): NodePorts => ({ inputs: def.inputs, outputs: def.outputs })

/** The ports a node exposes; boundary nodes and Function Nodes are projections, never stored copies. */
export function nodePorts(def: FunctionDefinition, nodeId: string, lookupFunction: FunctionLookup): NodePorts | undefined {
  if (nodeId === INPUT_BOUNDARY) return { inputs: [], outputs: def.inputs }
  if (nodeId === OUTPUT_BOUNDARY) return { inputs: def.outputs, outputs: [] }
  const node = def.nodes.find((n) => n.id === nodeId)
  if (!node) return undefined
  if (node.kind === 'function') {
    const child = lookupFunction(node.functionId)
    return child && signatureOf(child)
  }
  return { inputs: portsOf(node.inputs), outputs: portsOf(node.outputs) }
}

export interface FunctionValidationContext {
  typeLookup: TypeLookup
  functionLookup: FunctionLookup
  kindOf: (assetId: string) => string | undefined
}

export function validateFunctionDefinition(id: string, definition: unknown, ctx: FunctionValidationContext): Diagnostic[] {
  const out: Diagnostic[] = []
  const error = (code: string, message: string, assetId?: string) => void out.push({ severity: 'error', code, message, ...(assetId ? { assetId } : {}) })
  const raw = isPlainObject(definition) ? definition : {}
  for (const key of ['inputs', 'outputs', 'nodes', 'edges'])
    if (raw[key] !== undefined && !Array.isArray(raw[key])) error('invalid_definition', `"${key}" must be an array`)
  const def = normalizeFunction(definition)

  const checkPorts = (owner: string, inputs: PortDefinition[], outputs: PortDefinition[]) => {
    const ids = new Set<string>()
    for (const [direction, ports] of [['input', inputs], ['output', outputs]] as const) {
      const names = new Set<string>()
      for (const port of ports) {
        if (typeof port.id !== 'string' || !port.id || typeof port.name !== 'string' || !port.name || typeof port.typeId !== 'string') {
          error('invalid_port', `${owner}: every port needs an id, a name and a typeId`)
          continue
        }
        if (ids.has(port.id)) error('duplicate_port_id', `${owner}: port id "${port.id}" is used twice`)
        ids.add(port.id)
        if (names.has(port.name)) error('duplicate_port_name', `${owner}: ${direction} name "${port.name}" is used twice`)
        names.add(port.name)
        if (port.typeId.startsWith('system:') && !baseKindOf(port.typeId)) error('unknown_system_type', `${owner}: "${port.typeId}" is not a system Type`)
        else if (ctx.kindOf(port.typeId) === 'function') error('not_a_type', `${owner}: "${port.typeId}" is a Function, not a Type`, port.typeId)
      }
    }
  }
  checkPorts('Function', def.inputs, def.outputs)

  const nodeIds = new Set<string>()
  for (const node of def.nodes) {
    if (typeof node.id !== 'string' || !node.id) error('invalid_node', 'Every node needs an id')
    else if (node.id === INPUT_BOUNDARY || node.id === OUTPUT_BOUNDARY) error('reserved_node_id', `Node id "${node.id}" is reserved`)
    else if (nodeIds.has(node.id)) error('duplicate_node_id', `Node id "${node.id}" is used twice`)
    else nodeIds.add(node.id)
    if (node.kind === 'code') checkPorts(`Node ${node.id}`, portsOf(node.inputs), portsOf(node.outputs))
    else if (node.kind === 'function') {
      if (typeof node.functionId !== 'string' || !node.functionId) error('invalid_node', `Function Node ${node.id} needs a functionId`)
      else if (ctx.kindOf(node.functionId) === 'type') error('not_a_function', `Node ${node.id} references a Type, not a Function`, node.functionId)
    } else error('invalid_node', `Node ${String((node as { id?: unknown }).id)} has an unknown kind`)
  }

  const edgeIds = new Set<string>()
  const incoming = new Map<string, number>()
  for (const edge of def.edges) {
    if (edgeIds.has(edge.id)) error('duplicate_edge_id', `Edge id "${edge.id}" is used twice`)
    edgeIds.add(edge.id)
    const source = nodePorts(def, edge.sourceNodeId, ctx.functionLookup)
    const target = nodePorts(def, edge.targetNodeId, ctx.functionLookup)
    const sourceKnown = edge.sourceNodeId === INPUT_BOUNDARY || edge.sourceNodeId === OUTPUT_BOUNDARY || nodeIds.has(edge.sourceNodeId)
    const targetKnown = edge.targetNodeId === INPUT_BOUNDARY || edge.targetNodeId === OUTPUT_BOUNDARY || nodeIds.has(edge.targetNodeId)
    if (!sourceKnown) error('edge_unknown_node', `Edge ${edge.id}: node "${edge.sourceNodeId}" does not exist`)
    if (!targetKnown) error('edge_unknown_node', `Edge ${edge.id}: node "${edge.targetNodeId}" does not exist`)
    const key = `${edge.targetNodeId}\u0000${edge.targetPortId}`
    incoming.set(key, (incoming.get(key) ?? 0) + 1)
    if (!source || !target) continue

    const sourcePort = source.outputs.find((p) => p.id === edge.sourcePortId)
    const targetPort = target.inputs.find((p) => p.id === edge.targetPortId)
    if (!sourcePort)
      error(source.inputs.some((p) => p.id === edge.sourcePortId) ? 'edge_wrong_direction' : 'edge_unknown_port', `Edge ${edge.id}: "${edge.sourcePortId}" is not an output port of ${edge.sourceNodeId}`)
    if (!targetPort)
      error(target.outputs.some((p) => p.id === edge.targetPortId) ? 'edge_wrong_direction' : 'edge_unknown_port', `Edge ${edge.id}: "${edge.targetPortId}" is not an input port of ${edge.targetNodeId}`)
    if (sourcePort && targetPort && !isAssignable(sourcePort.typeId, targetPort.typeId, ctx.typeLookup))
      error('incompatible_edge', `Edge ${edge.id}: Type ${sourcePort.typeId} is not assignable to ${targetPort.typeId}`)
  }

  for (const [key, count] of incoming)
    if (count > 1) error('multiple_producers', `Input ${key.replace('\u0000', '.')} has ${count} producers`)

  const requireProducers = (nodeId: string, ports: PortDefinition[], code: string, label: string) => {
    for (const port of ports) if (!incoming.has(`${nodeId}\u0000${port.id}`)) error(code, `${label} input "${port.name ?? port.id}" has no producer`)
  }
  for (const node of def.nodes) {
    const ports = nodePorts(def, node.id, ctx.functionLookup)
    if (ports) requireProducers(node.id, ports.inputs, 'unconnected_input', `Node ${node.id}`)
  }
  requireProducers(OUTPUT_BOUNDARY, def.outputs, 'unconnected_output', 'Function output')

  const cycle = findNodeCycle(def, nodeIds)
  if (cycle.length) error('dag_cycle', `Nodes form a cycle: ${cycle.join(', ')}`)
  if (callsItself(id, def, ctx.functionLookup)) error('function_call_cycle', 'This Function calls itself, directly or through other Functions')
  return out
}

/** Nodes that remain after repeatedly removing nodes with no unresolved dependencies (Kahn). */
function findNodeCycle(def: FunctionDefinition, nodeIds: Set<string>): string[] {
  const indegree = new Map([...nodeIds].map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of def.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue
    outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId])
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
  }
  const ready = [...indegree].filter(([, n]) => n === 0).map(([id]) => id)
  while (ready.length) {
    const id = ready.pop()!
    indegree.delete(id)
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) ready.push(next)
    }
  }
  return [...indegree.keys()].sort()
}

function callsItself(id: string, def: FunctionDefinition, lookupFunction: FunctionLookup): boolean {
  const seen = new Set<string>()
  const visit = (current: FunctionDefinition): boolean =>
    current.nodes.some((node) => {
      if (node.kind !== 'function' || typeof node.functionId !== 'string') return false
      if (node.functionId === id) return true
      if (seen.has(node.functionId)) return false
      seen.add(node.functionId)
      const child = lookupFunction(node.functionId)
      return child ? visit(child) : false
    })
  return visit(def)
}
