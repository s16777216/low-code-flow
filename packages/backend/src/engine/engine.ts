import { randomUUID } from 'node:crypto'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY, nodePorts, normalizeFunction, type EdgeDefinition, type FunctionDefinition, type PortDefinition } from '../domain/functions.ts'
import { contextFromSnapshot, createTypedValue, transferValue, type TypeContext, type TypedValue } from '../domain/values.ts'
import { NotFoundError } from '../errors.ts'
import type { AssetRegistrySnapshot, Diagnostic } from '../registry.ts'
import { ExecutionRegistry, type FunctionExecution, type NodeExecution, type PinnedDefinition, type PortRecord } from './executions.ts'
import type { Runner } from './runner.ts'

export class InputValidationError extends Error {
  ports: Record<string, string[]>
  unknownKeys: string[]
  constructor(ports: Record<string, string[]>, unknownKeys: string[]) {
    super('The inputs do not match the function signature')
    this.ports = ports
    this.unknownKeys = unknownKeys
  }
}

export class NotExecutableError extends Error {
  diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super('The function is not executable')
    this.diagnostics = diagnostics
  }
}

export interface EngineOptions {
  runner: Runner
  executions?: ExecutionRegistry
  now?: () => Date
}

interface RunContext {
  snapshot: AssetRegistrySnapshot
  types: TypeContext
  signal: AbortSignal
  rootId: string
  projectId: string
  source: 'editor' | 'http'
  definitions: PinnedDefinition[]
}

const key = (nodeId: string, portId: string) => `${nodeId}\u0000${portId}`
const portRecord = (port: PortDefinition, value?: TypedValue, error?: string): PortRecord => ({
  portId: port.id,
  portName: port.name,
  typeId: port.typeId,
  ...(value ? { value } : {}),
  ...(error ? { error } : {}),
})

type NodeResult = { ok: true; outputs: Record<string, TypedValue>; logs?: string[] } | { ok: false; status: 'failed' | 'cancelled'; message: string; portId?: string; logs?: string[] }

export class ExecutionEngine {
  readonly executions: ExecutionRegistry
  private runner: Runner
  private now: () => Date
  private controllers = new Map<string, AbortController>()

  constructor(options: EngineOptions) {
    this.runner = options.runner
    this.executions = options.executions ?? new ExecutionRegistry()
    this.now = options.now ?? (() => new Date())
  }

  /** Validates, pins the definitions, then runs in the background. Throws before any execution exists. */
  start(snapshot: AssetRegistrySnapshot, functionId: string, rawInputs: Record<string, unknown>, options: { source?: 'editor' | 'http' } = {}) {
    const record = snapshot.assets.get(functionId)
    if (!record || record.kind !== 'function') throw new NotFoundError(`Function ${functionId} not found`)
    if (!record.executable) throw new NotExecutableError(record.diagnostics)

    const def = normalizeFunction(record.definition)
    const types = contextFromSnapshot(snapshot)
    const boundary: Record<string, TypedValue> = {}
    const portErrors: Record<string, string[]> = {}
    for (const port of def.inputs) {
      if (!(port.name in rawInputs)) {
        portErrors[port.name] = ['required input is missing']
        continue
      }
      const typed = createTypedValue(port.typeId, rawInputs[port.name], types)
      if (typed.ok) boundary[port.id] = typed.value
      else portErrors[port.name] = typed.errors
    }
    const unknownKeys = Object.keys(rawInputs).filter((name) => !def.inputs.some((p) => p.name === name))
    if (Object.keys(portErrors).length || unknownKeys.length) throw new InputValidationError(portErrors, unknownKeys)

    const controller = new AbortController()
    const rootId = randomUUID()
    const ctx: RunContext = {
      snapshot,
      types,
      signal: controller.signal,
      rootId,
      projectId: snapshot.projectId,
      source: options.source ?? 'editor',
      definitions: this.pin(snapshot, functionId),
    }
    this.controllers.set(rootId, controller)
    const execution = this.createExecution(ctx, functionId, rootId)
    const done = this.runFunction(ctx, execution, def, boundary)
      .catch((error: unknown) => {
        execution.status = 'failed'
        execution.error = { message: error instanceof Error ? error.message : String(error) }
      })
      .then(() => {
        execution.completedAt = this.now().toISOString()
        this.controllers.delete(rootId)
        this.executions.finish(rootId)
        return execution
      })
    return { executionId: rootId, done }
  }

  /** Cancels the whole execution tree that `executionId` belongs to. */
  cancel(executionId: string): boolean {
    const execution = this.executions.get(executionId)
    const controller = execution && this.controllers.get(execution.rootExecutionId)
    controller?.abort()
    return Boolean(controller)
  }

  cancelProject(projectId: string): void {
    for (const root of this.executions.rootsOfProject(projectId)) this.controllers.get(root.id)?.abort()
  }

  /** The function, everything it depends on, and their hashes, as of this moment. */
  private pin(snapshot: AssetRegistrySnapshot, functionId: string): PinnedDefinition[] {
    const seen = new Set<string>()
    const pending = [functionId]
    while (pending.length) {
      const id = pending.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      pending.push(...(snapshot.assets.get(id)?.dependencies ?? []))
    }
    return [...seen].sort().flatMap((id) => {
      const asset = snapshot.assets.get(id)
      return asset ? [{ assetId: id, kind: asset.kind, name: asset.name, revision: asset.revision, definitionHash: asset.contentHash }] : []
    })
  }

  private createExecution(ctx: RunContext, functionId: string, id: string, parent?: { executionId: string; nodeId: string }): FunctionExecution {
    const record = ctx.snapshot.assets.get(functionId)!
    const execution: FunctionExecution = {
      id,
      projectId: ctx.projectId,
      functionId,
      functionName: record.name,
      status: 'running',
      source: ctx.source,
      inputs: [],
      outputs: [],
      nodes: [],
      ...(parent ? { parentExecutionId: parent.executionId, parentNodeId: parent.nodeId } : {}),
      rootExecutionId: ctx.rootId,
      definitions: ctx.definitions,
      startedAt: this.now().toISOString(),
    }
    this.executions.add(execution)
    return execution
  }

  private async runFunction(ctx: RunContext, execution: FunctionExecution, def: FunctionDefinition, boundary: Record<string, TypedValue>): Promise<void> {
    const functionLookup = (id: string) => {
      const asset = ctx.snapshot.assets.get(id)
      return asset?.kind === 'function' ? normalizeFunction(asset.definition) : undefined
    }
    const portsOf = (nodeId: string) => nodePorts(def, nodeId, functionLookup)!
    const nodeById = new Map(def.nodes.map((node) => [node.id, node]))
    const values = new Map<string, TypedValue>()
    const failedInputs = new Map<string, { portId: string; message: string }>()
    const edgesFrom = new Map<string, EdgeDefinition[]>()
    const producers = new Map<string, Set<string>>()
    for (const edge of def.edges) {
      edgesFrom.set(key(edge.sourceNodeId, edge.sourcePortId), [...(edgesFrom.get(key(edge.sourceNodeId, edge.sourcePortId)) ?? []), edge])
      if (edge.sourceNodeId !== INPUT_BOUNDARY) producers.set(edge.targetNodeId, (producers.get(edge.targetNodeId) ?? new Set()).add(edge.sourceNodeId))
    }

    const nodeExec = new Map<string, NodeExecution>()
    for (const node of def.nodes) {
      const ports = portsOf(node.id)
      const entry: NodeExecution = {
        nodeId: node.id,
        nodeName: node.name ?? node.id,
        kind: node.kind,
        status: 'pending',
        inputs: ports.inputs.map((p) => portRecord(p)),
        outputs: ports.outputs.map((p) => portRecord(p)),
        logs: [],
      }
      nodeExec.set(node.id, entry)
      execution.nodes.push(entry)
    }
    execution.inputs = def.inputs.map((p) => portRecord(p, boundary[p.id]))
    execution.outputs = def.outputs.map((p) => portRecord(p))

    // Moving a value along an edge is where nominal assignability and any-relabelling are applied.
    const publish = (sourceNodeId: string, outputs: Record<string, TypedValue>) => {
      for (const [portId, value] of Object.entries(outputs))
        for (const edge of edgesFrom.get(key(sourceNodeId, portId)) ?? []) {
          const target = portsOf(edge.targetNodeId).inputs.find((p) => p.id === edge.targetPortId)!
          const moved = transferValue(value, target.typeId, ctx.types)
          if (moved.ok) values.set(key(edge.targetNodeId, edge.targetPortId), moved.value)
          else if (!failedInputs.has(edge.targetNodeId)) failedInputs.set(edge.targetNodeId, { portId: edge.targetPortId, message: moved.errors.join('; ') })
        }
    }
    publish(INPUT_BOUNDARY, boundary)

    const finish = (id: string, status: NodeExecution['status'], error?: { message: string; portId?: string }) => {
      const entry = nodeExec.get(id)!
      entry.status = status
      entry.completedAt = this.now().toISOString()
      if (error) entry.error = error
    }

    const runNode = async (id: string): Promise<void> => {
      const node = nodeById.get(id)!
      const entry = nodeExec.get(id)!
      entry.status = 'running'
      entry.startedAt = this.now().toISOString()
      const ports = portsOf(id)
      entry.inputs = ports.inputs.map((p) => portRecord(p, values.get(key(id, p.id))))
      let result: NodeResult
      try {
        result =
          node.kind === 'code'
            ? await this.runCode(ctx, node.code ?? '', ports.inputs, ports.outputs, values, id)
            : await this.runChild(ctx, execution, entry, node.functionId, id, values)
      } catch (error) {
        result = { ok: false, status: 'failed', message: error instanceof Error ? error.message : String(error) }
      }
      if (result.logs) entry.logs = this.executions.truncateLogs(result.logs)
      if (!result.ok) {
        const failedPort = result.portId
        if (failedPort) entry.outputs = entry.outputs.map((o) => (o.portId === failedPort ? { ...o, error: result.message } : o))
        return finish(id, result.status, { message: result.message, ...(result.portId ? { portId: result.portId } : {}) })
      }
      entry.outputs = ports.outputs.map((p) => portRecord(p, result.outputs[p.id]))
      finish(id, 'success')
      publish(id, result.outputs)
    }

    const pending = new Set(nodeById.keys())
    const running = new Map<string, Promise<void>>()
    const advance = () => {
      let changed = true
      while (changed) {
        changed = false
        for (const id of pending) {
          const ports = portsOf(id)
          const failedInput = failedInputs.get(id)
          if (ctx.signal.aborted) {
            pending.delete(id)
            finish(id, 'cancelled')
          } else if (failedInput) {
            pending.delete(id)
            nodeExec.get(id)!.inputs = ports.inputs.map((p) => portRecord(p, values.get(key(id, p.id)), p.id === failedInput.portId ? failedInput.message : undefined))
            finish(id, 'failed', { message: failedInput.message, portId: failedInput.portId })
            changed = true
          } else if ([...(producers.get(id) ?? [])].some((p) => ['failed', 'skipped', 'cancelled'].includes(nodeExec.get(p)?.status ?? ''))) {
            pending.delete(id)
            finish(id, 'skipped', { message: 'An upstream node did not succeed' })
            changed = true
          } else if (ports.inputs.every((p) => values.has(key(id, p.id)))) {
            pending.delete(id)
            const promise = runNode(id).finally(() => running.delete(id))
            running.set(id, promise)
          }
        }
      }
    }
    advance()
    while (running.size) {
      await Promise.race(running.values())
      advance()
    }
    for (const id of pending) finish(id, 'skipped', { message: 'Inputs never became available' })

    const outputs = def.outputs.map((p) => portRecord(p, values.get(key(OUTPUT_BOUNDARY, p.id))))
    execution.outputs = outputs
    const states = [...nodeExec.values()]
    const failed = states.find((n) => n.status === 'failed')
    if (ctx.signal.aborted) execution.status = 'cancelled'
    else if (failed) {
      execution.status = 'failed'
      execution.error = { message: `Node "${failed.nodeName}" failed: ${failed.error?.message ?? 'unknown error'}` }
    } else if (outputs.some((o) => !o.value) || states.some((n) => n.status !== 'success')) {
      execution.status = 'failed'
      execution.error = { message: 'The function did not produce all of its outputs' }
    } else execution.status = 'success'
  }

  private async runCode(ctx: RunContext, code: string, inputs: PortDefinition[], outputs: PortDefinition[], values: Map<string, TypedValue>, nodeId: string): Promise<NodeResult> {
    const raw = Object.fromEntries(inputs.map((p) => [p.name, values.get(key(nodeId, p.id))!.value]))
    const response = await this.runner.run({ code, inputs: raw }, { signal: ctx.signal })
    if (!response.ok) return { ok: false, status: response.error.kind === 'cancelled' ? 'cancelled' : 'failed', message: response.error.message, logs: response.logs }

    // The declared ports are the only source of Type identity; whatever the code claims about types is just data.
    const returned = response.outputs
    const undeclared = Object.keys(returned).find((name) => !outputs.some((p) => p.name === name))
    if (undeclared) return { ok: false, status: 'failed', message: `Undeclared output "${undeclared}"`, logs: response.logs }
    const typed: Record<string, TypedValue> = {}
    for (const port of outputs) {
      if (!(port.name in returned)) return { ok: false, status: 'failed', message: `Output "${port.name}" was not returned`, portId: port.id, logs: response.logs }
      const created = createTypedValue(port.typeId, returned[port.name], ctx.types)
      if (!created.ok) return { ok: false, status: 'failed', message: `Output "${port.name}": ${created.errors.join('; ')}`, portId: port.id, logs: response.logs }
      if (JSON.stringify(created.value.value).length > this.executions.maxOutputBytes)
        return { ok: false, status: 'failed', message: `Output "${port.name}" is larger than ${this.executions.maxOutputBytes} bytes`, portId: port.id, logs: response.logs }
      typed[port.id] = created.value
    }
    return { ok: true, outputs: typed, logs: response.logs }
  }

  private async runChild(ctx: RunContext, parent: FunctionExecution, entry: NodeExecution, functionId: string, nodeId: string, values: Map<string, TypedValue>): Promise<NodeResult> {
    const record = ctx.snapshot.assets.get(functionId)
    if (!record || record.kind !== 'function') return { ok: false, status: 'failed', message: `Function ${functionId} is not available` }
    const childDef = normalizeFunction(record.definition)
    const childInputs = Object.fromEntries(childDef.inputs.map((p) => [p.id, values.get(key(nodeId, p.id))!]))

    const child = this.createExecution(ctx, functionId, randomUUID(), { executionId: parent.id, nodeId })
    entry.childExecutionId = child.id
    try {
      await this.runFunction(ctx, child, childDef, childInputs)
    } catch (error) {
      child.status = 'failed'
      child.error = { message: error instanceof Error ? error.message : String(error) }
    }
    child.completedAt = this.now().toISOString()
    if (child.status === 'success') return { ok: true, outputs: Object.fromEntries(child.outputs.map((o) => [o.portId, o.value!])) }
    return { ok: false, status: child.status === 'cancelled' ? 'cancelled' : 'failed', message: child.error?.message ?? 'The child execution did not succeed' }
  }
}
