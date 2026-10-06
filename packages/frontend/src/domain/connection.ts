import { isAssignable, type AncestryOf } from './assignability'

export interface PortView {
  id: string
  name: string
  typeId: string
}

// Structurally compatible with Vue Flow's Connection and Edge.
export interface PortConnection {
  /** Present when an existing edge is being re-validated; the edge must not count against itself. */
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface PortGraph {
  nodes: { id: string; data?: { inputs?: PortView[]; outputs?: PortView[] } }[]
  edges: PortConnection[]
}

export type ConnectionCheck = { valid: true } | { valid: false; reason: string }

export function checkConnection(
  connection: PortConnection,
  graph: PortGraph,
  ancestryOf: AncestryOf,
  typeName: (typeId: string) => string = (id) => id,
): ConnectionCheck {
  const sourceNode = graph.nodes.find((node) => node.id === connection.source)
  const targetNode = graph.nodes.find((node) => node.id === connection.target)
  const sourcePort = sourceNode?.data?.outputs?.find((port) => port.id === connection.sourceHandle)
  const targetPort = targetNode?.data?.inputs?.find((port) => port.id === connection.targetHandle)

  if (!sourcePort) return { valid: false, reason: 'Source must be an existing output port' }
  if (!targetPort) return { valid: false, reason: 'Target must be an existing input port' }

  if (!isAssignable(sourcePort.typeId, targetPort.typeId, ancestryOf)) {
    return {
      valid: false,
      reason: `${typeName(sourcePort.typeId)} is not assignable to ${typeName(targetPort.typeId)}: only the same Type or a subtype can connect`,
    }
  }

  const others = connection.id ? graph.edges.filter((edge) => edge.id !== connection.id) : graph.edges
  const inputTaken = others.some(
    (edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle,
  )
  if (inputTaken) {
    return { valid: false, reason: `Input ${targetPort.name} already has a producer` }
  }

  if (createsCycle(connection.source, connection.target, others)) {
    return { valid: false, reason: 'Connection would create a cycle' }
  }

  return { valid: true }
}

// Adding source -> target closes a cycle iff source is already reachable from target.
function createsCycle(source: string, target: string, edges: PortConnection[]): boolean {
  const visited = new Set<string>()
  const pending = [target]
  while (pending.length > 0) {
    const nodeId = pending.pop()!
    if (nodeId === source) return true
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    for (const edge of edges) {
      if (edge.source === nodeId) pending.push(edge.target)
    }
  }
  return false
}
