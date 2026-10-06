export type RootKind = 'string' | 'number' | 'date' | 'function' | 'object' | 'boolean' | 'array' | 'any'

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  assetId?: string
}

export interface AssetSummary {
  id: string
  kind: 'type' | 'function'
  name: string
  revision: number
  updatedAt: string
  executable: boolean
  diagnostics: { errors: number; warnings: number }
}

export interface AssetDetail extends Omit<AssetSummary, 'diagnostics'> {
  projectId: string
  schemaVersion: number
  definition: unknown
  contentHash: string
  diagnostics: Diagnostic[]
}

export interface SystemType {
  id: string
  name: string
  rootKind: RootKind
  immutable: true
}

export interface TypeInfo extends AssetSummary {
  rootKind: RootKind | null
  ancestry: string[]
}

export interface PortDefinition {
  id: string
  name: string
  typeId: string
}

export interface NodeDefinition {
  id: string
  kind: 'code' | 'function'
  name?: string
  code?: string
  inputs?: PortDefinition[]
  outputs?: PortDefinition[]
  functionId?: string
}

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
  layout?: Record<string, { x: number; y: number }>
}

export interface FunctionSummary extends AssetSummary {
  signature: { inputs: PortDefinition[]; outputs: PortDefinition[] }
}

export interface TypedValue {
  typeId: string
  typeDefinitionHash: string
  value: unknown
}

export interface PortRecord {
  portId: string
  portName: string
  typeId: string
  value?: TypedValue
  error?: string
}

export interface NodeExecution {
  nodeId: string
  nodeName: string
  kind: 'code' | 'function'
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'
  inputs: PortRecord[]
  outputs: PortRecord[]
  error?: { message: string; portId?: string }
  logs: string[]
  childExecutionId?: string
  child?: ExecutionTree
  startedAt?: string
  completedAt?: string
}

export interface ExecutionTree {
  id: string
  functionId: string
  functionName: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  inputs: PortRecord[]
  outputs: PortRecord[]
  error?: { message: string }
  nodes: NodeExecution[]
  definitions: Array<{ assetId: string; kind: 'type' | 'function'; name: string; revision: number; definitionHash: string }>
  startedAt: string
  completedAt?: string
}
