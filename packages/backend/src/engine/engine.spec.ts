import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db/connection.ts'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY } from '../domain/functions.ts'
import { typedPortsValidator } from '../domain/validator.ts'
import { createDefinitionStore } from '../store.ts'
import { ExecutionEngine, InputValidationError, NotExecutableError } from './engine.ts'
import { ChildProcessRunner, type Runner } from './runner.ts'

// Test-only runner: evaluates the code in this process so scheduling can be tested quickly and deterministically.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (ctx: unknown) => Promise<Record<string, unknown>>
const inProcessRunner: Runner = {
  async run({ code, inputs }, { signal } = {}) {
    const aborted = new Promise<'aborted'>((resolve) => signal?.addEventListener('abort', () => resolve('aborted')))
    try {
      const result = await Promise.race([new AsyncFunction('ctx', code)({ inputs, log: () => undefined }), aborted])
      if (result === 'aborted') return { ok: false, error: { kind: 'cancelled', message: 'cancelled' }, logs: [] }
      return { ok: true, outputs: result, logs: [] }
    } catch (error) {
      return { ok: false, error: { kind: 'error', message: (error as Error).message }, logs: [] }
    }
  },
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
;(globalThis as Record<string, unknown>).__wait = wait

const port = (id: string, typeId: string, name = id) => ({ id, name, typeId })
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId })
const codeNode = (id: string, inputs: ReturnType<typeof port>[], outputs: ReturnType<typeof port>[], code: string) => ({ id, kind: 'code' as const, code, inputs, outputs })

function setup(runner: Runner = inProcessRunner) {
  const { db } = openDatabase()
  const store = createDefinitionStore(db, typedPortsValidator)
  const project = store.createProject('p')
  const engine = new ExecutionEngine({ runner })
  const type = (name: string, parentTypeId: string, constraints?: object) =>
    store.createAsset(project.id, { kind: 'type', name, definition: { parentTypeId, ...(constraints ? { constraints } : {}) } }).assetId
  const fn = (name: string, definition: object) => store.createAsset(project.id, { kind: 'function', name, definition })
  const snapshot = () => store.registry(project.id).getSnapshot()
  const run = async (functionId: string, inputs: Record<string, unknown> = {}) => {
    const { executionId, done } = engine.start(snapshot(), functionId, inputs)
    return { executionId, execution: await done }
  }
  const node = (execution: { nodes: Array<{ nodeId: string }> }, id: string) => execution.nodes.find((n) => n.nodeId === id) as import('./executions.ts').NodeExecution
  return { store, project, engine, type, fn, snapshot, run, node }
}

/** input x:string -> a(x) -> output y:string, with `body` as the code of a. */
const single = (body: string, outType = 'system:string', inType = 'system:string') => ({
  inputs: [port('p-x', inType, 'x')],
  outputs: [port('p-y', outType, 'y')],
  nodes: [codeNode('a', [port('a-x', inType, 'x')], [port('a-y', outType, 'y')], body)],
  edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'a', 'a-x'), edge('e2', 'a', 'a-y', OUTPUT_BOUNDARY, 'p-y')],
})

describe('typing and publishing outputs', () => {
  it('runs a function and labels outputs with the declared port type', async () => {
    const { type, fn, run } = setup()
    const userId = type('UserId', 'system:string')
    const f = fn('F', single('return { y: ctx.inputs.x + "!" }', userId))
    const { execution } = await run(f.assetId, { x: 'a' })
    expect(execution.status).toBe('success')
    expect(execution.outputs[0]!.value).toMatchObject({ typeId: userId, value: 'a!' })
  })

  it('ignores a Type identity claimed by the code', async () => {
    const { type, fn, run, node } = setup()
    const userId = type('UserId', 'system:string')
    const f = fn('F', single('return { y: { typeId: "x", value: "a" } }', userId))
    const { execution } = await run(f.assetId, { x: 'a' })
    expect(execution.status).toBe('failed')
    expect(node(execution, 'a').error!.message).toContain('expected string')

    const g = fn('G', single('return { y: { typeId: "forged", value: "a" } }', 'system:object'))
    const { execution: objectRun } = await run(g.assetId, { x: 'a' })
    expect(objectRun.outputs[0]!.value).toMatchObject({ typeId: 'system:object', value: { typeId: 'forged', value: 'a' } })
  })

  it('fails the node and publishes nothing when an output is missing, extra or invalid', async () => {
    const { fn, run, node } = setup()
    const twoOutputs = (body: string) => ({
      inputs: [],
      outputs: [port('p-a', 'system:string', 'a'), port('p-b', 'system:number', 'b')],
      nodes: [codeNode('n', [], [port('n-a', 'system:string', 'a'), port('n-b', 'system:number', 'b')], body)],
      edges: [edge('e1', 'n', 'n-a', OUTPUT_BOUNDARY, 'p-a'), edge('e2', 'n', 'n-b', OUTPUT_BOUNDARY, 'p-b')],
    })
    for (const [body, message] of [
      ['return { a: "ok" }', 'Output "b" was not returned'],
      ['return { a: "ok", b: 1, c: 2 }', 'Undeclared output "c"'],
      ['return { a: "ok", b: "not a number" }', 'expected number'],
    ] as const) {
      const { execution } = await run(fn('F', twoOutputs(body)).assetId)
      const n = node(execution, 'n')
      expect(n.status).toBe('failed')
      expect(n.error!.message).toContain(message)
      expect(n.outputs.every((o) => o.value === undefined)).toBe(true)
      expect(execution.outputs.every((o) => o.value === undefined)).toBe(true)
      expect(execution.status).toBe('failed')
    }
  })

  it('fails a node when an output exceeds the size limit', async () => {
    const { fn, run, node, engine } = setup()
    Object.assign(engine.executions, { maxOutputBytes: 100 })
    const { execution } = await run(fn('Big', single('return { y: "x".repeat(500) }')).assetId, { x: 'a' })
    expect(node(execution, 'a').error!.message).toContain('larger than')
  })
})

describe('any at run time', () => {
  it('fails the receiving node when a value leaving any does not fit', async () => {
    const { type, fn, run, node } = setup()
    const userId = type('UserId', 'system:string')
    const f = fn('F', {
      inputs: [],
      outputs: [port('p', userId, 'p')],
      nodes: [
        codeNode('loose', [], [port('l-out', 'system:any', 'out')], 'return { out: 42 }'),
        codeNode('strict', [port('s-in', userId, 'in')], [port('s-out', userId, 'out')], 'return { out: ctx.inputs.in }'),
      ],
      edges: [edge('e1', 'loose', 'l-out', 'strict', 's-in'), edge('e2', 'strict', 's-out', OUTPUT_BOUNDARY, 'p')],
    })
    const { execution } = await run(f.assetId)
    expect(node(execution, 'strict')).toMatchObject({ status: 'failed', error: { portId: 's-in' } })
    expect(execution.status).toBe('failed')
  })

  it('relabels a valid value leaving any as the target type', async () => {
    const { type, fn, run } = setup()
    const userId = type('UserId', 'system:string')
    const f = fn('F', {
      inputs: [],
      outputs: [port('p', userId, 'p')],
      nodes: [codeNode('loose', [], [port('l-out', 'system:any', 'out')], 'return { out: "u-1" }')],
      edges: [edge('e1', 'loose', 'l-out', OUTPUT_BOUNDARY, 'p')],
    })
    const { execution } = await run(f.assetId)
    expect(execution.outputs[0]!.value).toMatchObject({ typeId: userId, value: 'u-1' })
  })
})

describe('scheduling', () => {
  const diamond = {
    inputs: [],
    outputs: [port('p', 'system:string', 'p')],
    nodes: [
      codeNode('left', [], [port('l', 'system:string', 'v')], 'await globalThis.__wait(150); return { v: "L" }'),
      codeNode('right', [], [port('r', 'system:string', 'v')], 'await globalThis.__wait(150); return { v: "R" }'),
      codeNode('join', [port('j-l', 'system:string', 'l'), port('j-r', 'system:string', 'r')], [port('j-o', 'system:string', 'o')], 'return { o: ctx.inputs.l + ctx.inputs.r }'),
    ],
    edges: [edge('e1', 'left', 'l', 'join', 'j-l'), edge('e2', 'right', 'r', 'join', 'j-r'), edge('e3', 'join', 'j-o', OUTPUT_BOUNDARY, 'p')],
  }

  it('runs independent nodes in parallel and joins only after both inputs arrive', async () => {
    const { fn, run, node } = setup()
    const { execution } = await run(fn('Diamond', diamond).assetId)
    expect(execution.status).toBe('success')
    expect(execution.outputs[0]!.value!.value).toBe('LR')
    const [left, right, join] = ['left', 'right', 'join'].map((id) => node(execution, id))
    expect(Date.parse(right!.startedAt!)).toBeLessThan(Date.parse(left!.completedAt!))
    expect(Date.parse(join!.startedAt!)).toBeGreaterThanOrEqual(Math.max(Date.parse(left!.completedAt!), Date.parse(right!.completedAt!)))
  })

  it('keeps a node pending while one of its inputs is still running', async () => {
    const { fn, engine, snapshot } = setup()
    const f = fn('Diamond', diamond)
    const { done } = engine.start(snapshot(), f.assetId, {})
    await wait(60)
    const mid = [...(engine.executions.rootsOfProject(snapshot().projectId))][0]!
    expect(mid.nodes.find((n) => n.nodeId === 'join')!.status).toBe('pending')
    expect(mid.nodes.find((n) => n.nodeId === 'left')!.status).toBe('running')
    await done
  })

  it('skips downstream nodes after an upstream failure and fails the function', async () => {
    const { fn, run, node } = setup()
    const f = fn('F', {
      inputs: [],
      outputs: [port('p', 'system:string', 'p')],
      nodes: [
        codeNode('bad', [], [port('b', 'system:string', 'v')], 'throw new Error("boom")'),
        codeNode('after', [port('a-in', 'system:string', 'in')], [port('a-out', 'system:string', 'out')], 'return { out: ctx.inputs.in }'),
        codeNode('indep', [], [port('i', 'system:string', 'v')], 'return { v: "fine" }'),
      ],
      edges: [edge('e1', 'bad', 'b', 'after', 'a-in'), edge('e2', 'after', 'a-out', OUTPUT_BOUNDARY, 'p')],
    })
    const { execution } = await run(f.assetId)
    expect(node(execution, 'bad')).toMatchObject({ status: 'failed', error: { message: 'boom' } })
    expect(node(execution, 'after').status).toBe('skipped')
    expect(node(execution, 'indep').status).toBe('success')
    expect(execution).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('bad') } })
  })

  it('cancels a running execution', async () => {
    const { fn, engine, snapshot } = setup()
    const f = fn('Slow', single('await globalThis.__wait(2000); return { y: "late" }'))
    const { executionId, done } = engine.start(snapshot(), f.assetId, { x: 'a' })
    await wait(50)
    expect(engine.cancel(executionId)).toBe(true)
    const execution = await done
    expect(execution.status).toBe('cancelled')
    expect(execution.nodes[0]!.status).toBe('cancelled')
  })
})

describe('nested functions', () => {
  function withChild(setupResult: ReturnType<typeof setup>, childBody: string) {
    const { fn, type } = setupResult
    const userId = type('UserId', 'system:string')
    const child = fn('Child', {
      inputs: [port('c-a', userId, 'a'), port('c-b', 'system:number', 'b')],
      outputs: [port('c-o1', 'system:string', 'o1'), port('c-o2', 'system:number', 'o2')],
      nodes: [codeNode('inner', [port('i-a', userId, 'a'), port('i-b', 'system:number', 'b')], [port('i-o1', 'system:string', 'o1'), port('i-o2', 'system:number', 'o2')], childBody)],
      edges: [edge('e1', INPUT_BOUNDARY, 'c-a', 'inner', 'i-a'), edge('e2', INPUT_BOUNDARY, 'c-b', 'inner', 'i-b'), edge('e3', 'inner', 'i-o1', OUTPUT_BOUNDARY, 'c-o1'), edge('e4', 'inner', 'i-o2', OUTPUT_BOUNDARY, 'c-o2')],
    })
    const parent = fn('Parent', {
      inputs: [port('p-a', userId, 'a'), port('p-b', 'system:number', 'b')],
      outputs: [port('p-o1', 'system:string', 'o1'), port('p-o2', 'system:number', 'o2')],
      nodes: [{ id: 'call', kind: 'function', functionId: child.assetId }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-a', 'call', 'c-a'), edge('e2', INPUT_BOUNDARY, 'p-b', 'call', 'c-b'), edge('e3', 'call', 'c-o1', OUTPUT_BOUNDARY, 'p-o1'), edge('e4', 'call', 'c-o2', OUTPUT_BOUNDARY, 'p-o2')],
    })
    return { child, parent }
  }

  it('runs one child execution per function node with all ports at once', async () => {
    const ctx = setup()
    const { parent, child } = withChild(ctx, 'return { o1: ctx.inputs.a + "-done", o2: ctx.inputs.b * 2 }')
    const { execution } = await ctx.run(parent.assetId, { a: 'u', b: 21 })
    expect(execution.status).toBe('success')
    expect(execution.outputs.map((o) => o.value!.value)).toEqual(['u-done', 42])

    const callNode = ctx.node(execution, 'call')
    const tree = ctx.engine.executions.tree(execution.id)!
    expect(callNode.childExecutionId).toBeDefined()
    expect(tree.nodes[0]!.child).toMatchObject({ functionId: child.assetId, parentExecutionId: execution.id, rootExecutionId: execution.id, status: 'success' })
    expect(tree.nodes[0]!.child!.inputs.map((i) => i.value!.value)).toEqual(['u', 21])
  })

  it('fails the function node and skips what follows when the child fails', async () => {
    const ctx = setup()
    const { parent } = withChild(ctx, 'throw new Error("child broke")')
    const { execution } = await ctx.run(parent.assetId, { a: 'u', b: 1 })
    expect(ctx.node(execution, 'call')).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('child broke') } })
    const child = ctx.engine.executions.get(ctx.node(execution, 'call').childExecutionId!)!
    expect(child.status).toBe('failed')
    expect(execution.status).toBe('failed')
  })

  it('does not publish partial child outputs', async () => {
    const ctx = setup()
    const { parent } = withChild(ctx, 'return { o1: "only one" }')
    const { execution } = await ctx.run(parent.assetId, { a: 'u', b: 1 })
    expect(ctx.node(execution, 'call').status).toBe('failed')
    expect(execution.outputs.every((o) => o.value === undefined)).toBe(true)
  })
})

describe('pinned definitions', () => {
  it('keeps using the definitions it started with and records their hashes', async () => {
    const ctx = setup()
    const slowChild = ctx.fn('Child', single('await globalThis.__wait(200); return { y: "v1" }'))
    const parent = ctx.fn('Parent', {
      inputs: [port('p-x', 'system:string', 'x')],
      outputs: [port('p-y', 'system:string', 'y')],
      nodes: [{ id: 'call', kind: 'function', functionId: slowChild.assetId }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'call', 'p-x'), edge('e2', 'call', 'p-y', OUTPUT_BOUNDARY, 'p-y')],
    })
    const { executionId, done } = ctx.engine.start(ctx.snapshot(), parent.assetId, { x: 'a' })
    await wait(40)
    ctx.store.updateAsset(ctx.project.id, slowChild.assetId, { name: 'Child', definition: single('return { y: "v2" }'), expectedRevision: 1 })

    const first = await done
    expect(first.outputs[0]!.value!.value).toBe('v1')
    expect(first.definitions.map((d) => d.assetId).sort()).toEqual([parent.assetId, slowChild.assetId].sort())
    expect(first.definitions.find((d) => d.assetId === slowChild.assetId)).toMatchObject({ revision: 1, definitionHash: slowChild.contentHash })

    const second = await ctx.run(parent.assetId, { x: 'a' })
    expect(second.execution.outputs[0]!.value!.value).toBe('v2')
    expect(second.execution.definitions.find((d) => d.assetId === slowChild.assetId)!.revision).toBe(2)
    expect(executionId).not.toBe(second.executionId)
  })
})

describe('starting an execution', () => {
  it('rejects bad inputs per port without creating an execution', async () => {
    const { fn, engine, snapshot, project, type } = setup()
    const userId = type('UserId', 'system:string', { minLength: 3 })
    const f = fn('F', {
      inputs: [port('p1', userId, 'id'), port('p2', 'system:number', 'n')],
      outputs: [],
      nodes: [],
      edges: [],
    })
    const attempt = (inputs: Record<string, unknown>) => {
      try {
        engine.start(snapshot(), f.assetId, inputs)
      } catch (error) {
        return error
      }
    }
    const error = attempt({ id: 'ab', extra: 1 }) as InputValidationError
    expect(error).toBeInstanceOf(InputValidationError)
    expect(error.ports).toEqual({ id: ['$: shorter than 3'], n: ['required input is missing'] })
    expect(error.unknownKeys).toEqual(['extra'])
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
    expect(attempt({ id: 'abc', n: 1 })).toBeUndefined()
  })

  it('refuses a function that is not executable', () => {
    const { fn, engine, snapshot } = setup()
    const broken = fn('Broken', { nodes: [codeNode('a', [port('a-in', 'system:string', 'in')], [], '')] })
    expect(() => engine.start(snapshot(), broken.assetId, {})).toThrow(NotExecutableError)
  })
})

describe('with the sandboxed runner', () => {
  it('executes a nested multi-port workflow end to end', async () => {
    const ctx = setup(new ChildProcessRunner({ timeoutMs: 8000 }))
    const userId = ctx.type('UserId', 'system:string')
    const child = ctx.fn('Child', {
      inputs: [port('c-id', userId, 'id'), port('c-at', 'system:date', 'at')],
      outputs: [port('c-label', 'system:string', 'label'), port('c-next', 'system:date', 'next')],
      nodes: [codeNode('inner', [port('i-id', userId, 'id'), port('i-at', 'system:date', 'at')], [port('i-label', 'system:string', 'label'), port('i-next', 'system:date', 'next')],
        'return { label: `${ctx.inputs.id}@${ctx.inputs.at.getUTCFullYear()}`, next: new Date(ctx.inputs.at.getTime() + 86400000) }')],
      edges: [edge('e1', INPUT_BOUNDARY, 'c-id', 'inner', 'i-id'), edge('e2', INPUT_BOUNDARY, 'c-at', 'inner', 'i-at'), edge('e3', 'inner', 'i-label', OUTPUT_BOUNDARY, 'c-label'), edge('e4', 'inner', 'i-next', OUTPUT_BOUNDARY, 'c-next')],
    })
    const parent = ctx.fn('Parent', {
      inputs: [port('p-id', userId, 'id'), port('p-at', 'system:date', 'at')],
      outputs: [port('p-label', 'system:string', 'label'), port('p-next', 'system:date', 'next')],
      nodes: [{ id: 'call', kind: 'function', functionId: child.assetId }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-id', 'call', 'c-id'), edge('e2', INPUT_BOUNDARY, 'p-at', 'call', 'c-at'), edge('e3', 'call', 'c-label', OUTPUT_BOUNDARY, 'p-label'), edge('e4', 'call', 'c-next', OUTPUT_BOUNDARY, 'p-next')],
    })
    const { execution } = await ctx.run(parent.assetId, { id: 'u-1', at: { $kind: 'date', iso: '2026-10-02T00:00:00.000Z' } })
    expect(execution.status).toBe('success')
    expect(execution.outputs.map((o) => o.value!.value)).toEqual(['u-1@2026', { $kind: 'date', iso: '2026-10-03T00:00:00.000Z' }])
    expect(execution.outputs[1]!.value!.typeId).toBe('system:date')
  })
})
