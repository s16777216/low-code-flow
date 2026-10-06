import { describe, expect, it } from 'vitest'
import { buildApp } from './api.ts'
import { openDatabase } from './db/connection.ts'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY } from './domain/functions.ts'
import { typedPortsValidator } from './domain/validator.ts'
import { ExecutionEngine } from './engine/engine.ts'
import { ExecutionRegistry } from './engine/executions.ts'
import type { Runner } from './engine/runner.ts'
import { createDefinitionStore } from './store.ts'

const echoRunner: Runner = { run: async ({ inputs }) => ({ ok: true, outputs: { y: inputs.x }, logs: ['ran'] }) }
const slowRunner: Runner = {
  run: ({ inputs }, { signal } = {}) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: true, outputs: { y: inputs.x }, logs: [] }), 3000)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve({ ok: false, error: { kind: 'cancelled', message: 'cancelled' }, logs: [] })
      })
    }),
}

const port = (id: string, typeId: string, name = id) => ({ id, name, typeId })
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId })
const passThrough = (typeId = 'system:string') => ({
  inputs: [port('p-x', typeId, 'x')],
  outputs: [port('p-y', typeId, 'y')],
  nodes: [{ id: 'a', kind: 'code', code: 'return { y: ctx.inputs.x }', inputs: [port('a-x', typeId, 'x')], outputs: [port('a-y', typeId, 'y')] }],
  edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'a', 'a-x'), edge('e2', 'a', 'a-y', OUTPUT_BOUNDARY, 'p-y')],
})

function setup(runner: Runner = echoRunner, executions = new ExecutionRegistry()) {
  const { db } = openDatabase()
  const store = createDefinitionStore(db, typedPortsValidator)
  const engine = new ExecutionEngine({ runner, executions })
  store.onProjectDeleted((id) => engine.cancelProject(id))
  const app = buildApp(store, engine)
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as object | undefined })
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined }
  }
  return { store, call, engine, project: store.createProject('p') }
}

const poll = async (call: ReturnType<typeof setup>['call'], executionId: string) => {
  for (let i = 0; i < 100; i++) {
    const res = await call('GET', `/executions/${executionId}`)
    if (res.body?.status && res.body.status !== 'running') return res
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('execution did not finish')
}

describe('type and impact API', () => {
  it('lists the immutable system types', async () => {
    const { call } = setup()
    const { body } = await call('GET', '/system-types')
    expect(body.map((t: { id: string }) => t.id).sort()).toEqual(['any', 'array', 'boolean', 'date', 'function', 'number', 'object', 'string'].map((k) => `system:${k}`))
    expect(body.every((t: { immutable: boolean }) => t.immutable)).toBe(true)
  })

  it('returns root kind and ancestry for project types and 404 for others', async () => {
    const { call, project } = setup()
    const id = (await call('POST', `/projects/${project.id}/assets`, { kind: 'type', name: 'Id', definition: { parentTypeId: 'system:string' } })).body.id
    const userId = (await call('POST', `/projects/${project.id}/assets`, { kind: 'type', name: 'UserId', definition: { parentTypeId: id } })).body.id

    const detail = await call('GET', `/projects/${project.id}/types/${userId}`)
    expect(detail.body).toMatchObject({ rootKind: 'string', ancestry: [userId, id, 'system:string'] })
    const list = await call('GET', `/projects/${project.id}/types`)
    expect(list.body.map((t: { name: string; rootKind: string }) => [t.name, t.rootKind]).sort()).toEqual([['Id', 'string'], ['UserId', 'string']])
    expect((await call('GET', `/projects/${project.id}/types/nope`)).status).toBe(404)
  })

  it('reports every function affected by a type change and revalidates them immediately', async () => {
    const { call, project } = setup()
    const base = `/projects/${project.id}`
    const user = (await call('POST', `${base}/assets`, { kind: 'type', name: 'User', definition: { parentTypeId: 'system:object' } })).body.id
    const admin = (await call('POST', `${base}/assets`, { kind: 'type', name: 'Admin', definition: { parentTypeId: user } })).body.id
    const fnDef = { inputs: [port('p', admin, 'in')], outputs: [port('o', user, 'out')], nodes: [], edges: [edge('e', INPUT_BOUNDARY, 'p', OUTPUT_BOUNDARY, 'o')] }
    const fn = (await call('POST', `${base}/assets`, { kind: 'function', name: 'Promote', definition: fnDef })).body
    expect(fn.executable).toBe(true)

    const impact = await call('GET', `${base}/assets/${user}/impact`)
    expect(impact.body.dependents.map((d: { id: string }) => d.id).sort()).toEqual([admin, fn.id].sort())

    await call('PUT', `${base}/assets/${admin}`, { name: 'Admin', definition: { parentTypeId: 'system:object' }, expectedRevision: 1 })
    const after = await call('GET', `${base}/functions/${fn.id}`)
    expect(after.body.executable).toBe(false)
    expect(after.body.diagnostics.map((d: { code: string }) => d.code)).toContain('incompatible_edge')
    expect((await call('GET', `${base}/assets/nope/impact`)).status).toBe(404)
  })
})

describe('function API', () => {
  it('shows the signature and the projected ports of function nodes without child internals', async () => {
    const { call, project } = setup()
    const base = `/projects/${project.id}`
    const child = (await call('POST', `${base}/assets`, { kind: 'function', name: 'Child', definition: passThrough() })).body.id
    const parent = (
      await call('POST', `${base}/assets`, {
        kind: 'function',
        name: 'Parent',
        definition: {
          inputs: [port('p-x', 'system:string', 'x')],
          outputs: [port('p-y', 'system:string', 'y')],
          nodes: [{ id: 'call', kind: 'function', functionId: child }],
          edges: [edge('e1', INPUT_BOUNDARY, 'p-x', 'call', 'p-x'), edge('e2', 'call', 'p-y', OUTPUT_BOUNDARY, 'p-y')],
        },
      })
    ).body.id

    const view = (await call('GET', `${base}/functions/${parent}`)).body
    expect(view.signature.inputs).toEqual([port('p-x', 'system:string', 'x')])
    expect(view.nodes[0].ports).toEqual({ inputs: [port('p-x', 'system:string', 'x')], outputs: [port('p-y', 'system:string', 'y')] })
    expect(JSON.stringify(view.nodes)).not.toContain('a-x')
    expect((await call('GET', `${base}/functions`)).body).toHaveLength(2)
  })
})

describe('execution API', () => {
  async function withFunction(runner?: Runner, executions?: ExecutionRegistry) {
    const ctx = setup(runner, executions)
    const fn = (await ctx.call('POST', `/projects/${ctx.project.id}/assets`, { kind: 'function', name: 'F', definition: passThrough() })).body.id
    return { ...ctx, fn, url: `/projects/${ctx.project.id}/functions/${fn}/execute` }
  }

  it('starts an execution from raw inputs and exposes the finished trace', async () => {
    const { call, url } = await withFunction()
    const started = await call('POST', url, { inputs: { x: 'hello' } })
    expect(started.status).toBe(202)
    const finished = await poll(call, started.body.executionId)
    expect(finished.body).toMatchObject({ status: 'success', outputs: [{ portName: 'y', value: { typeId: 'system:string', value: 'hello' } }] })
    expect(finished.body.nodes[0]).toMatchObject({ status: 'success', logs: ['ran'] })
  })

  it('rejects invalid inputs per port without creating an execution', async () => {
    const { call, url, engine, project } = await withFunction()
    const bad = await call('POST', url, { inputs: { x: 5, extra: 1 } })
    expect(bad).toMatchObject({ status: 400, body: { error: 'invalid_input', ports: { x: ['$: expected string'] }, unknownKeys: ['extra'] } })
    expect((await call('POST', url, { inputs: [] })).status).toBe(400)
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })

  it('blocks a function that is not executable and reports unknown functions', async () => {
    const { call, project } = setup()
    const broken = (await call('POST', `/projects/${project.id}/assets`, { kind: 'function', name: 'Broken', definition: { nodes: [{ id: 'n', kind: 'code', inputs: [port('i', 'system:string')], outputs: [] }] } })).body.id
    const blocked = await call('POST', `/projects/${project.id}/functions/${broken}/execute`, { inputs: {} })
    expect(blocked).toMatchObject({ status: 409, body: { error: 'not_executable', diagnostics: [{ code: 'unconnected_input' }] } })
    expect((await call('POST', `/projects/${project.id}/functions/nope/execute`, {})).status).toBe(404)
  })

  it('cancels a running execution', async () => {
    const { call, url } = await withFunction(slowRunner)
    const { executionId } = (await call('POST', url, { inputs: { x: 'a' } })).body
    expect((await call('GET', `/executions/${executionId}`)).body.status).toBe('running')
    expect((await call('POST', `/executions/${executionId}/cancel`)).body).toEqual({ cancelled: true })
    expect((await poll(call, executionId)).body.status).toBe('cancelled')
  })

  it('cancels running executions when their project is deleted', async () => {
    const { call, url, project, engine } = await withFunction(slowRunner)
    const { executionId } = (await call('POST', url, { inputs: { x: 'a' } })).body
    await call('DELETE', `/projects/${project.id}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(engine.executions.get(executionId)!.status).toBe('cancelled')
  })

  it('answers 404 once a finished execution has been evicted, or for an unknown id', async () => {
    const clock = { now: 0 }
    const { call, url } = await withFunction(echoRunner, new ExecutionRegistry({ ttlMs: 1000, now: () => clock.now }))
    const { executionId } = (await call('POST', url, { inputs: { x: 'a' } })).body
    expect((await poll(call, executionId)).status).toBe(200)

    clock.now += 5000
    expect((await call('GET', `/executions/${executionId}`)).status).toBe(404)
    expect((await call('POST', `/executions/${executionId}/cancel`)).status).toBe(404)
    expect((await call('GET', '/executions/never-existed')).status).toBe(404)
  })
})
