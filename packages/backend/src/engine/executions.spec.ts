import { describe, expect, it } from 'vitest'
import { ExecutionRegistry, type FunctionExecution } from './executions.ts'

let counter = 0
function execution(overrides: Partial<FunctionExecution> = {}): FunctionExecution {
  const id = overrides.id ?? `e${++counter}`
  return { id, projectId: 'p', functionId: 'f', functionName: 'F', status: 'running', source: 'editor', inputs: [], outputs: [], nodes: [], rootExecutionId: id, definitions: [], startedAt: 'now', ...overrides }
}

function setup(options: ConstructorParameters<typeof ExecutionRegistry>[0] = {}) {
  const clock = { now: 1_000 }
  return { clock, registry: new ExecutionRegistry({ ...options, now: () => clock.now }) }
}

describe('execution registry retention', () => {
  it('keeps running executions and recently finished ones', () => {
    const { registry, clock } = setup({ ttlMs: 1000 })
    const running = execution()
    const done = execution()
    registry.add(running)
    registry.add(done)
    registry.finish(done.id)
    clock.now += 500
    expect(registry.get(running.id)).toBe(running)
    expect(registry.get(done.id)).toBe(done)
  })

  it('evicts a finished execution after the TTL, but never a running one', () => {
    const { registry, clock } = setup({ ttlMs: 1000 })
    const running = execution()
    const done = execution()
    registry.add(running)
    registry.add(done)
    registry.finish(done.id)
    clock.now += 60_000
    expect(registry.get(done.id)).toBeUndefined()
    expect(registry.get(running.id)).toBe(running)
  })

  it('evicts the oldest finished executions first when over the count limit, never running ones', () => {
    const { registry, clock } = setup({ maxTerminalRoots: 2, ttlMs: 1e9 })
    const running = execution()
    registry.add(running)
    const finished = [execution(), execution(), execution()]
    for (const e of finished) {
      registry.add(e)
      clock.now += 10
      registry.finish(e.id)
    }
    expect(registry.get(finished[0]!.id)).toBeUndefined()
    expect(registry.get(finished[1]!.id)).toBeDefined()
    expect(registry.get(finished[2]!.id)).toBeDefined()
    expect(registry.get(running.id)).toBe(running)
  })

  it('evicts a nested execution tree together with its root', () => {
    const { registry, clock } = setup({ ttlMs: 100 })
    const root = execution()
    const child = execution({ rootExecutionId: root.id, parentExecutionId: root.id, parentNodeId: 'call' })
    root.nodes.push({ nodeId: 'call', nodeName: 'call', kind: 'function', status: 'success', inputs: [], outputs: [], logs: [], childExecutionId: child.id })
    registry.add(root)
    registry.add(child)
    expect(registry.tree(root.id)!.nodes[0]!.child!.id).toBe(child.id)

    registry.finish(root.id)
    clock.now += 1000
    expect(registry.get(child.id)).toBeUndefined()
    expect(registry.tree(root.id)).toBeUndefined()
  })

  it('forgets everything on clear, as a restart would', () => {
    const { registry } = setup()
    const e = execution()
    registry.add(e)
    registry.clear()
    expect(registry.get(e.id)).toBeUndefined()
  })
})

describe('execution registry limits', () => {
  it('truncates logs beyond the byte limit with a marker', () => {
    const { registry } = setup({ maxLogBytes: 20 })
    expect(registry.truncateLogs(['12345', '12345', '12345', '12345', '12345'])).toEqual(['12345', '12345', '12345', '12345', '[logs truncated after 20 bytes]'])
    expect(registry.truncateLogs(['short'])).toEqual(['short'])
  })

  it('exposes the output size limit used by the engine', () => {
    expect(setup({ maxOutputBytes: 123 }).registry.maxOutputBytes).toBe(123)
  })
})
