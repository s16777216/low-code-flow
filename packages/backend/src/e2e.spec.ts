import { describe, expect, it } from 'vitest'
import { buildApp } from './api.ts'
import { contentHash } from './canonical.ts'
import { openDatabase } from './db/connection.ts'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY } from './domain/functions.ts'
import { typedPortsValidator } from './domain/validator.ts'
import { ExecutionEngine } from './engine/engine.ts'
import { ExecutionRegistry } from './engine/executions.ts'
import { ChildProcessRunner } from './engine/runner.ts'
import { createDefinitionStore } from './store.ts'

const port = (id: string, typeId: string, name = id) => ({ id, name, typeId })
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId })
const codeNode = (id: string, inputs: ReturnType<typeof port>[], outputs: ReturnType<typeof port>[], code: string) => ({ id, kind: 'code' as const, code, inputs, outputs })

function setup(executions = new ExecutionRegistry()) {
  const { db } = openDatabase()
  const store = createDefinitionStore(db, typedPortsValidator)
  const engine = new ExecutionEngine({ runner: new ChildProcessRunner({ timeoutMs: 20_000 }), executions })
  const app = buildApp(store, engine)
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as object | undefined })
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined }
  }
  const project = store.createProject('e2e')
  const base = `/projects/${project.id}`
  const create = async (kind: 'type' | 'function', name: string, definition: object) => (await call('POST', `${base}/assets`, { kind, name, definition })).body.id as string
  const type = (name: string, parentTypeId: string, constraints?: object) => create('type', name, { parentTypeId, ...(constraints ? { constraints } : {}) })
  const execute = async (functionId: string, inputs: Record<string, unknown>) => {
    const started = await call('POST', `${base}/functions/${functionId}/execute`, { inputs })
    if (started.status !== 202) return started
    for (let i = 0; i < 900; i++) {
      const res = await call('GET', `/executions/${started.body.executionId}`)
      if (res.body.status !== 'running') return res
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    throw new Error('execution did not finish')
  }
  return { call, base, create, type, execute, store, project, executions, db }
}

type TraceNode = { nodeId: string; status: string; error?: { message: string; portId?: string } }
const nodeOf = (trace: { nodes: TraceNode[] }, id: string) => trace.nodes.find((n) => n.nodeId === id)

describe('typed multi-port workflow', () => {
  it('passes nominally compatible data through parallel and join paths', async () => {
    const { type, create, execute } = setup()
    const userId = await type('UserId', 'system:string')
    const orderId = await type('OrderId', 'system:string')
    const money = await type('Money', 'system:number', { min: 0 })
    const entity = await type('Entity', 'system:object', { properties: [{ name: 'id', typeId: 'system:string' }] })
    const user = await type('User', entity, { properties: [{ name: 'id', typeId: 'system:string' }, { name: 'name', typeId: 'system:string' }] })
    const order = await type('Order', 'system:object', { properties: [{ name: 'id', typeId: orderId }, { name: 'total', typeId: money }] })

    const checkout = await create('function', 'Checkout', {
      inputs: [port('p-user', userId, 'userId'), port('p-order', orderId, 'orderId'), port('p-rate', 'system:number', 'rate')],
      outputs: [port('p-summary', 'system:string', 'summary'), port('p-entity', entity, 'entity'), port('p-due', 'system:date', 'due')],
      nodes: [
        codeNode('fetchUser', [port('u-in', userId, 'userId')], [port('u-out', user, 'user')], 'return { user: { id: ctx.inputs.userId, name: "Ann" } }'),
        codeNode('fetchOrder', [port('o-in', orderId, 'orderId'), port('o-rate', 'system:number', 'rate')], [port('o-out', order, 'order')], 'return { order: { id: ctx.inputs.orderId, total: 100 * ctx.inputs.rate } }'),
        codeNode(
          'join',
          [port('j-user', user, 'user'), port('j-order', order, 'order')],
          [port('j-summary', 'system:string', 'summary'), port('j-due', 'system:date', 'due')],
          'return { summary: `${ctx.inputs.user.name} owes ${ctx.inputs.order.total}`, due: new Date(Date.UTC(2026, 9, 31)) }',
        ),
      ],
      edges: [
        edge('e1', INPUT_BOUNDARY, 'p-user', 'fetchUser', 'u-in'),
        edge('e2', INPUT_BOUNDARY, 'p-order', 'fetchOrder', 'o-in'),
        edge('e3', INPUT_BOUNDARY, 'p-rate', 'fetchOrder', 'o-rate'),
        edge('e4', 'fetchUser', 'u-out', 'join', 'j-user'),
        edge('e5', 'fetchOrder', 'o-out', 'join', 'j-order'),
        edge('e6', 'join', 'j-summary', OUTPUT_BOUNDARY, 'p-summary'),
        edge('e7', 'fetchUser', 'u-out', OUTPUT_BOUNDARY, 'p-entity'),
        edge('e8', 'join', 'j-due', OUTPUT_BOUNDARY, 'p-due'),
      ],
    })

    const result = await execute(checkout, { userId: 'u-1', orderId: 'o-1', rate: 1.5 })
    expect(result.body.status).toBe('success')
    const byName = Object.fromEntries(result.body.outputs.map((o: { portName: string; value: { typeId: string; value: unknown } }) => [o.portName, o.value]))
    expect(byName.summary).toMatchObject({ typeId: 'system:string', value: 'Ann owes 150' })
    expect(byName.entity).toMatchObject({ typeId: user, value: { id: 'u-1', name: 'Ann' } })
    expect(byName.due).toMatchObject({ typeId: 'system:date', value: { $kind: 'date', iso: '2026-10-31T00:00:00.000Z' } })
  })

  it('records pinned type and function hashes on nested executions', async () => {
    const { type, create, execute, store, project } = setup()
    const userId = await type('UserId', 'system:string')
    const child = await create('function', 'Child', {
      inputs: [port('c-in', userId, 'id')],
      outputs: [port('c-out', 'system:string', 'label'), port('c-out2', 'system:number', 'length')],
      nodes: [codeNode('n', [port('n-in', userId, 'id')], [port('n-a', 'system:string', 'label'), port('n-b', 'system:number', 'length')], 'return { label: ctx.inputs.id.toUpperCase(), length: ctx.inputs.id.length }')],
      edges: [edge('e1', INPUT_BOUNDARY, 'c-in', 'n', 'n-in'), edge('e2', 'n', 'n-a', OUTPUT_BOUNDARY, 'c-out'), edge('e3', 'n', 'n-b', OUTPUT_BOUNDARY, 'c-out2')],
    })
    const parent = await create('function', 'Parent', {
      inputs: [port('p-in', userId, 'id')],
      outputs: [port('p-label', 'system:string', 'label'), port('p-len', 'system:number', 'length')],
      nodes: [{ id: 'call', kind: 'function', functionId: child }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-in', 'call', 'c-in'), edge('e2', 'call', 'c-out', OUTPUT_BOUNDARY, 'p-label'), edge('e3', 'call', 'c-out2', OUTPUT_BOUNDARY, 'p-len')],
    })

    const result = await execute(parent, { id: 'abc' })
    expect(result.body.status).toBe('success')
    expect(result.body.outputs.map((o: { value: { value: unknown } }) => o.value.value)).toEqual(['ABC', 3])
    const childTrace = result.body.nodes[0].child
    expect(childTrace).toMatchObject({ functionId: child, parentExecutionId: result.body.id, status: 'success' })

    const snapshot = store.registry(project.id).getSnapshot()
    for (const id of [parent, child, userId])
      expect(result.body.definitions.find((d: { assetId: string }) => d.assetId === id)).toMatchObject({ definitionHash: snapshot.assets.get(id)!.contentHash })
    expect(childTrace.outputs[0].value.typeDefinitionHash).toBe(contentHash('type', { system: 'system:string' }))
  })
})

describe('negative cases fail at the specified boundary', () => {
  const identity = (inType: string, nodeType = inType, outType = nodeType) => ({
    inputs: [port('p-x', inType, 'x')],
    outputs: [port('p-y', outType, 'y')],
    nodes: [codeNode('a', [port('a-x', nodeType, 'x')], [port('a-y', outType, 'y')], 'return { y: ctx.inputs.x }')],
    edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'a', 'a-x'), edge('e2', 'a', 'a-y', OUTPUT_BOUNDARY, 'p-y')],
  })

  it('refuses sibling-type edges at validation (409)', async () => {
    const { type, create, execute } = setup()
    const userId = await type('UserId', 'system:string')
    const orderId = await type('OrderId', 'system:string')
    const f = await create('function', 'Mixup', identity(userId, orderId))
    expect(await execute(f, { x: 'a' })).toMatchObject({ status: 409, body: { error: 'not_executable', diagnostics: [{ code: 'incompatible_edge' }] } })
  })

  it('refuses missing inputs at the input boundary (400)', async () => {
    const { create, execute } = setup()
    const f = await create('function', 'F', identity('system:string'))
    expect(await execute(f, {})).toMatchObject({ status: 400, body: { error: 'invalid_input', ports: { x: ['required input is missing'] } } })
  })

  it('fails the node at run time for an invalid or missing output, publishing nothing', async () => {
    const { create, execute } = setup()
    const wrongType = await create('function', 'Wrong', { ...identity('system:string', 'system:string', 'system:number'), nodes: [codeNode('a', [port('a-x', 'system:string', 'x')], [port('a-y', 'system:number', 'y')], 'return { y: "not a number" }')] })
    const missing = await create('function', 'Missing', { ...identity('system:string'), nodes: [codeNode('a', [port('a-x', 'system:string', 'x')], [port('a-y', 'system:string', 'y')], 'return {}')] })

    for (const id of [wrongType, missing]) {
      const trace = (await execute(id, { x: 'a' })).body
      expect(trace.status).toBe('failed')
      expect(nodeOf(trace, 'a')).toMatchObject({ status: 'failed', error: { portId: 'a-y' } })
      expect(trace.outputs.every((o: { value?: unknown }) => o.value === undefined)).toBe(true)
    }
  })

  it('refuses inheritance cycles and DAG cycles at validation (409)', async () => {
    const { call, base, type, create, execute } = setup()
    const a = await type('A', 'system:string')
    const b = await type('B', a)
    await call('PUT', `${base}/assets/${a}`, { name: 'A', definition: { parentTypeId: b }, expectedRevision: 1 })
    const usesCycle = await create('function', 'UsesCycle', identity(a))
    expect((await execute(usesCycle, { x: 'a' })).body.diagnostics.map((d: { code: string }) => d.code)).toContain('dependency_not_executable')

    const cyclic = await create('function', 'Loop', {
      inputs: [],
      outputs: [],
      nodes: [codeNode('p', [port('p-in', 'system:string', 'in')], [port('p-out', 'system:string', 'out')], ''), codeNode('q', [port('q-in', 'system:string', 'in')], [port('q-out', 'system:string', 'out')], '')],
      edges: [edge('e1', 'p', 'p-out', 'q', 'q-in'), edge('e2', 'q', 'q-out', 'p', 'p-in')],
    })
    expect((await execute(cyclic, {})).body.diagnostics.map((d: { code: string }) => d.code)).toContain('dag_cycle')
  })

  it('refuses a parent whose edge points at a port the child no longer has (409)', async () => {
    const { call, base, create, execute } = setup()
    const child = await create('function', 'Child', identity('system:string'))
    const parent = await create('function', 'Parent', {
      inputs: [port('p-x', 'system:string', 'x')],
      outputs: [port('p-y', 'system:string', 'y')],
      nodes: [{ id: 'call', kind: 'function', functionId: child }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'call', 'p-x'), edge('e2', 'call', 'p-y', OUTPUT_BOUNDARY, 'p-y')],
    })
    expect((await execute(parent, { x: 'a' })).body.status).toBe('success')

    await call('PUT', `${base}/assets/${child}`, { name: 'Child', definition: { inputs: [port('p-x', 'system:string', 'x')], outputs: [], nodes: [], edges: [] }, expectedRevision: 1 })
    expect(await execute(parent, { x: 'a' })).toMatchObject({ status: 409, body: { diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'edge_unknown_port' })]) } })
  })
})

describe('runtime lifecycle', () => {
  it('does not restore executions after a restart', async () => {
    const first = setup()
    const f = await first.create('function', 'F', { inputs: [], outputs: [], nodes: [], edges: [] })
    const done = await first.execute(f, {})
    expect(done.body.status).toBe('success')

    const restarted = new ExecutionEngine({ runner: new ChildProcessRunner() })
    const app = buildApp(first.store, restarted)
    expect((await app.inject({ method: 'GET', url: `/executions/${done.body.id}` })).statusCode).toBe(404)
  })

  it('keeps finished traces only within the retention limits', async () => {
    const clock = { now: 0 }
    const ctx = setup(new ExecutionRegistry({ maxTerminalRoots: 2, now: () => clock.now }))
    const f = await ctx.create('function', 'F', { inputs: [], outputs: [], nodes: [], edges: [] })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      clock.now += 10
      ids.push((await ctx.execute(f, {})).body.id)
    }
    const statuses = await Promise.all(ids.map(async (id) => (await ctx.call('GET', `/executions/${id}`)).status))
    expect(statuses).toEqual([404, 200, 200])
  })
})
