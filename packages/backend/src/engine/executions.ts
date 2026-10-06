import type { TypedValue } from '../domain/values.ts'

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'cancelled'
export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'

/** One port at execution time: the immutable id plus the display name and Type it had then. */
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
  status: NodeStatus
  inputs: PortRecord[]
  outputs: PortRecord[]
  error?: { message: string; portId?: string }
  logs: string[]
  childExecutionId?: string
  startedAt?: string
  completedAt?: string
}

export interface PinnedDefinition {
  assetId: string
  kind: 'type' | 'function'
  name: string
  revision: number
  definitionHash: string
}

export interface FunctionExecution {
  id: string
  projectId: string
  functionId: string
  functionName: string
  status: ExecutionStatus
  source: 'editor' | 'http'
  inputs: PortRecord[]
  outputs: PortRecord[]
  error?: { message: string }
  nodes: NodeExecution[]
  parentExecutionId?: string
  parentNodeId?: string
  rootExecutionId: string
  definitions: PinnedDefinition[]
  startedAt: string
  completedAt?: string
}

export type ExecutionTree = Omit<FunctionExecution, 'nodes'> & { nodes: Array<NodeExecution & { child?: ExecutionTree }> }

export interface ExecutionRegistryOptions {
  /** How long a finished execution tree stays queryable. */
  ttlMs?: number
  /** Most finished execution trees kept at once; the oldest are evicted first. */
  maxTerminalRoots?: number
  /** Most bytes of log text kept per node. */
  maxLogBytes?: number
  /** Most JSON bytes a single node output may have. */
  maxOutputBytes?: number
  now?: () => number
}

/** Bounded, in-memory only: nothing here survives a restart and running executions are never evicted. */
export class ExecutionRegistry {
  readonly maxOutputBytes: number
  private ttlMs: number
  private maxTerminalRoots: number
  private maxLogBytes: number
  private now: () => number
  private executions = new Map<string, FunctionExecution>()
  private children = new Map<string, string[]>()
  private finishedAt = new Map<string, number>()

  constructor(options: ExecutionRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000
    this.maxTerminalRoots = options.maxTerminalRoots ?? 100
    this.maxLogBytes = options.maxLogBytes ?? 64 * 1024
    this.maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024
    this.now = options.now ?? Date.now
  }

  add(execution: FunctionExecution): void {
    this.sweep()
    this.executions.set(execution.id, execution)
    if (execution.parentExecutionId) this.children.set(execution.rootExecutionId, [...(this.children.get(execution.rootExecutionId) ?? []), execution.id])
  }

  get(id: string): FunctionExecution | undefined {
    this.sweep()
    return this.executions.get(id)
  }

  /** Marks a root execution as finished, which starts its retention clock. */
  finish(rootId: string): void {
    this.finishedAt.set(rootId, this.now())
    this.sweep()
  }

  tree(id: string): ExecutionTree | undefined {
    const execution = this.get(id)
    if (!execution) return undefined
    return {
      ...execution,
      nodes: execution.nodes.map((node) => ({ ...node, ...(node.childExecutionId ? { child: this.tree(node.childExecutionId) } : {}) })),
    }
  }

  truncateLogs(logs: string[]): string[] {
    const kept: string[] = []
    let bytes = 0
    for (const line of logs) {
      bytes += Buffer.byteLength(line)
      if (bytes > this.maxLogBytes) {
        kept.push(`[logs truncated after ${this.maxLogBytes} bytes]`)
        break
      }
      kept.push(line)
    }
    return kept
  }

  rootsOfProject(projectId: string): FunctionExecution[] {
    return [...this.executions.values()].filter((e) => e.projectId === projectId && e.rootExecutionId === e.id)
  }

  clear(): void {
    this.executions.clear()
    this.children.clear()
    this.finishedAt.clear()
  }

  private sweep(): void {
    const now = this.now()
    for (const [root, at] of this.finishedAt) if (now - at > this.ttlMs) this.evict(root)
    const overflow = this.finishedAt.size - this.maxTerminalRoots
    if (overflow > 0) for (const [root] of [...this.finishedAt].sort((a, b) => a[1] - b[1]).slice(0, overflow)) this.evict(root)
  }

  private evict(root: string): void {
    for (const id of this.children.get(root) ?? []) this.executions.delete(id)
    this.children.delete(root)
    this.executions.delete(root)
    this.finishedAt.delete(root)
  }
}
