import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './api.ts'
import { openDatabase } from './db/connection.ts'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY } from './domain/functions.ts'
import { typedPortsValidator } from './domain/validator.ts'
import { ExecutionEngine } from './engine/engine.ts'
import { ChildProcessRunner, type Runner, type RunnerResponse } from './engine/runner.ts'
import { createDefinitionStore } from './store.ts'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const passThrough = (types: Record<string, string> = { x: 'system:string' }) => {
  const ports = Object.entries(types).map(([name, typeId]) => ({ id: name, name, typeId }))
  return { inputs: ports.map((port) => ({ ...port, id: `in-${port.id}` })), outputs: ports.map((port) => ({ ...port, id: `out-${port.id}` })), nodes: [], edges: ports.map((port) => ({ id: port.id, sourceNodeId: INPUT_BOUNDARY, sourcePortId: `in-${port.id}`, targetNodeId: OUTPUT_BOUNDARY, targetPortId: `out-${port.id}` })) }
}
const codeFunction = (code: string) => ({
  inputs: [{ id: 'x', name: 'x', typeId: 'system:string' }], outputs: [{ id: 'y', name: 'y', typeId: 'system:string' }],
  nodes: [{ id: 'code', name: 'Code', kind: 'code', code, inputs: [{ id: 'x', name: 'x', typeId: 'system:string' }], outputs: [{ id: 'y', name: 'y', typeId: 'system:string' }] }],
  edges: [{ id: 'a', sourceNodeId: INPUT_BOUNDARY, sourcePortId: 'x', targetNodeId: 'code', targetPortId: 'x' }, { id: 'b', sourceNodeId: 'code', sourcePortId: 'y', targetNodeId: OUTPUT_BOUNDARY, targetPortId: 'y' }],
})
function setup(runner: Runner = new ChildProcessRunner({ timeoutMs: 20_000 }), timeoutMs = 30_000) {
  const database = openDatabase()
  cleanups.push(() => { database.close() })
  const store = createDefinitionStore(database.db, typedPortsValidator)
  const engine = new ExecutionEngine({ runner })
  store.onProjectDeleted((id) => engine.cancelProject(id))
  const app = buildApp(store, engine, { timeoutMs, publicBaseUrl: 'https://flows.example.test' })
  cleanups.push(() => app.close())
  const project = store.createProject('p')
  const create = (definition: object = passThrough(), name = 'F') => store.createAsset(project.id, { kind: 'function', name, definition })
  const attach = (definition: object = passThrough()) => {
    const fn = create(definition)
    store.setEndpoint(project.id, fn.assetId, 'orders/checkout')
    return { fn, url: `/run/${project.id}/orders/checkout`, config: `/projects/${project.id}/assets/${fn.assetId}/endpoint` }
  }
  return { store, engine, app, project, create, attach }
}

describe('endpoint settings and lifecycle', () => {
  it('persists settings, lists URLs and does not change the definition or revision', async () => {
    const { app, store, project, attach } = setup()
    const { fn, config, url } = attach()
    expect((await app.inject({ method: 'GET', url: `/projects/${project.id}/endpoints` })).json()).toEqual([{ functionId: fn.assetId, path: 'orders/checkout', url: `https://flows.example.test${url}` }])
    const changed = await app.inject({ method: 'PUT', url: config, payload: { path: 'new-path' } })
    expect(changed.statusCode).toBe(200)
    expect(store.registry(project.id).getAsset(fn.assetId)).toEqual(fn)
    const detail = (await app.inject({ method: 'GET', url: `/projects/${project.id}/assets/${fn.assetId}` })).json()
    expect(detail.endpoint.path).toBe('new-path')
    expect((await app.inject({ method: 'POST', url, payload: { x: 'a' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: config })).statusCode).toBe(204)
    expect((await app.inject({ method: 'POST', url: `/run/${project.id}/new-path`, payload: { x: 'a' } })).statusCode).toBe(404)
  })
  it('rejects duplicates with the conflicting function and permits other projects', async () => {
    const { app, store, project, attach, create } = setup()
    const { fn } = attach()
    const second = create(passThrough(), 'Second')
    const conflict = await app.inject({ method: 'PUT', url: `/projects/${project.id}/assets/${second.assetId}/endpoint`, payload: { path: 'orders/checkout' } })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ error: 'endpoint_conflict', functionId: fn.assetId, functionName: 'F' })
    const other = store.createProject('Other')
    const otherFn = store.createAsset(other.id, { kind: 'function', name: 'Other', definition: passThrough() })
    store.setEndpoint(other.id, otherFn.assetId, 'orders/checkout')
    expect(store.listEndpoints(other.id)).toHaveLength(1)
    expect((await app.inject({ method: 'POST', url: `/run/${other.id}/orders/checkout`, payload: { x: 'other' } })).json()).toEqual({ x: 'other' })
  })
  it.each(['A', 'with space', '..', 'a//b', '/a', 'a/', 'a--b', '', 'x'.repeat(129)])('rejects path %s', async (path) => {
    const { app, attach } = setup()
    const { config } = attach()
    expect((await app.inject({ method: 'PUT', url: config, payload: { path } })).statusCode).toBe(400)
  })
  it('only accepts Functions within the requested project', async () => {
    const { app, store, project, attach } = setup()
    const { fn } = attach()
    const type = store.createAsset(project.id, { kind: 'type', name: 'T', definition: { parentTypeId: 'system:string' } })
    expect((await app.inject({ method: 'PUT', url: `/projects/${project.id}/assets/${type.assetId}/endpoint`, payload: { path: 'type' } })).statusCode).toBe(400)
    const other = store.createProject('Other')
    expect((await app.inject({ method: 'PUT', url: `/projects/${other.id}/assets/${fn.assetId}/endpoint`, payload: { path: 'wrong' } })).statusCode).toBe(404)
  })
  it('blocks Function deletion but cascades endpoints when deleting a Project', async () => {
    const { app, store, project, attach } = setup()
    const { fn, config, url } = attach()
    const assetUrl = `/projects/${project.id}/assets/${fn.assetId}`
    expect((await app.inject({ method: 'DELETE', url: assetUrl })).json()).toMatchObject({ error: 'endpoint_attached' })
    await app.inject({ method: 'DELETE', url: config })
    expect((await app.inject({ method: 'DELETE', url: assetUrl })).statusCode).toBe(204)
    attach()
    expect((await app.inject({ method: 'DELETE', url: `/projects/${project.id}` })).statusCode).toBe(204)
    expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404)
    expect(() => store.listEndpoints(project.id)).toThrow(`Project ${project.id} not found`)
  })
})

describe('HTTP execution', () => {
  it('exercises all five outcomes with multi-port date values over a real HTTP connection', async () => {
    let finish!: (response: RunnerResponse) => void
    const runner: Runner = { run: async ({ inputs }) => {
      if (inputs.text === 'fail') return { ok: false, error: { kind: 'error', message: 'boom' }, logs: [] }
      if (inputs.text === 'slow') return new Promise((resolve) => { finish = resolve })
      return { ok: true, outputs: inputs, logs: [] }
    } }
    const { app, store, engine, project, attach } = setup(runner, 150)
    const boundary = passThrough({ text: 'system:string', at: 'system:date' })
    const nodeInputs = boundary.inputs.map((port) => ({ ...port, id: `node-${port.id}` }))
    const nodeOutputs = boundary.outputs.map((port) => ({ ...port, id: `node-${port.id}` }))
    const definition = { ...boundary, nodes: [{ id: 'code', kind: 'code', code: 'return ctx.inputs', inputs: nodeInputs, outputs: nodeOutputs }], edges: [
      ...boundary.inputs.map((port, i) => ({ id: `i-${i}`, sourceNodeId: INPUT_BOUNDARY, sourcePortId: port.id, targetNodeId: 'code', targetPortId: nodeInputs[i]!.id })),
      ...boundary.outputs.map((port, i) => ({ id: `o-${i}`, sourceNodeId: 'code', sourcePortId: nodeOutputs[i]!.id, targetNodeId: OUTPUT_BOUNDARY, targetPortId: port.id })),
    ] }
    const { fn, url } = attach(definition)
    expect(fn.executable).toBe(true)
    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address() as { port: number }
    const origin = `http://127.0.0.1:${address.port}`
    const at = '2026-10-13T00:00:00Z'
    const call = (body: object) => fetch(`${origin}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const success = await call({ text: 'hello', at })
    expect(success.status).toBe(200)
    expect(await success.json()).toEqual({ text: 'hello', at })
    const trace = await fetch(`${origin}/executions/${success.headers.get('x-execution-id')}`)
    expect(await trace.json()).toMatchObject({ source: 'http', endpointPath: 'orders/checkout', status: 'success' })
    expect((await call({ text: 42, at })).status).toBe(400)
    store.updateAsset(project.id, fn.assetId, { name: 'F', definition: { ...definition, edges: [] }, expectedRevision: 1 })
    expect((await call({ text: 'hello', at })).status).toBe(409)
    store.updateAsset(project.id, fn.assetId, { name: 'F', definition, expectedRevision: 2 })
    const failed = await call({ text: 'fail', at })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toMatchObject({ nodeId: 'code', executionId: failed.headers.get('x-execution-id') })
    const timeout = await call({ text: 'slow', at })
    expect(timeout.status).toBe(504)
    const id = timeout.headers.get('x-execution-id')!
    expect(engine.executions.get(id)?.status).toBe('running')
    finish({ ok: true, outputs: { text: 'done', at: { $kind: 'date', iso: at } }, logs: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(engine.executions.get(id)?.status).toBe('success')
  })
  it('returns multi-port outputs including date and function references and exposes the HTTP trace', async () => {
    const { app, engine, project, create, attach } = setup()
    const ref = create({}, 'Referenced')
    const { url } = attach(passThrough({ text: 'system:string', count: 'system:number', at: 'system:date', callback: 'system:function' }))
    const payload = { text: 'hello', count: 2, at: '2026-10-13T00:00:00Z', callback: ref.assetId }
    const response = await app.inject({ method: 'POST', url, payload })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(payload)
    const id = response.headers['x-execution-id'] as string
    expect(engine.executions.rootsOfProject(project.id)).toHaveLength(1)
    expect((await app.inject({ method: 'GET', url: `/executions/${id}` })).json()).toMatchObject({ id, source: 'http', endpointPath: 'orders/checkout', status: 'success' })
  })
  it('reports missing, unknown and invalid ports without creating executions', async () => {
    const { app, engine, project, attach } = setup()
    const { url } = attach(passThrough({ text: 'system:string', count: 'system:number', at: 'system:date', callback: 'system:function' }))
    const bad = await app.inject({ method: 'POST', url, payload: { count: 'two', at: '2026-10-13T00:00:00', callback: 'other-project-function', extra: true } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ error: 'invalid_input', ports: { text: expect.any(Array), count: expect.any(Array), at: expect.any(Array), callback: expect.any(Array) }, unknownKeys: ['extra'] })
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })
  it('rejects another project Function ID and tagged date input', async () => {
    const { app, store, project, engine, attach } = setup()
    const other = store.createProject('Other')
    const fn = store.createAsset(other.id, { kind: 'function', name: 'Other', definition: {} })
    const { url } = attach(passThrough({ at: 'system:date', callback: 'system:function' }))
    const response = await app.inject({ method: 'POST', url, payload: { at: { $kind: 'date', iso: '2026-10-13T00:00:00Z' }, callback: fn.assetId } })
    expect(response.statusCode).toBe(400)
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })
  it('does not infer special types in any ports', async () => {
    const { app, attach } = setup()
    const { url } = attach(passThrough({ value: 'system:any' }))
    const value = { date: '2026-10-13T00:00:00Z', id: 'some-function' }
    expect((await app.inject({ method: 'POST', url, payload: { value } })).json()).toEqual({ value })
  })
  it('accepts empty bodies without Content-Type only for functions without inputs; GET remains 405', async () => {
    const { app, attach } = setup()
    const { url } = attach({})
    for (const request of [{}, { headers: { 'content-type': 'application/json' } }, { payload: {} }]) {
      const response = await app.inject({ method: 'POST', url, ...request })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({})
    }
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(405)
    // Use a separate application for the Function requiring an input.
    const ctx = setup()
    const required = ctx.attach()
    expect((await ctx.app.inject({ method: 'POST', url: required.url })).statusCode).toBe(415)
  })
  it('returns 404 for unknown paths/projects and 405 with Allow for existing endpoints', async () => {
    const { app, engine, project, attach } = setup()
    const { url } = attach()
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const) {
      const response = await app.inject({ method, url })
      expect(response.statusCode).toBe(405)
      expect(response.headers.allow).toBe('POST')
    }
    for (const unknown of [`/run/${project.id}/missing`, '/run/unknown/orders/checkout', `${url}/`, url.replace('checkout', 'Checkout')])
      expect((await app.inject({ method: 'POST', url: unknown, payload: {} })).statusCode).toBe(404)
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })
  it('rejects non-JSON, malformed, non-object and oversized bodies before execution', async () => {
    const { app, engine, project, attach } = setup()
    const { url } = attach()
    expect((await app.inject({ method: 'POST', url, headers: { 'content-type': 'text/plain' }, payload: '{}' })).statusCode).toBe(415)
    expect((await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: '{' })).statusCode).toBe(400)
    for (const payload of ['[]', 'null', '42', '"text"'])
      expect((await app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url, payload: { x: 'a'.repeat(1024 * 1024) } })).statusCode).toBe(413)
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })
  it('checks executability before port validation, including invalid dependencies', async () => {
    const { app, store, project, engine, attach, create } = setup()
    const child = create(passThrough(), 'Child')
    const { fn, url } = attach({
      inputs: [{ id: 'parent-in', name: 'x', typeId: 'system:string' }],
      outputs: [{ id: 'parent-out', name: 'x', typeId: 'system:string' }],
      nodes: [{ id: 'call', kind: 'function', functionId: child.assetId }],
      edges: [{ id: 'a', sourceNodeId: INPUT_BOUNDARY, sourcePortId: 'parent-in', targetNodeId: 'call', targetPortId: 'in-x' }, { id: 'b', sourceNodeId: 'call', sourcePortId: 'out-x', targetNodeId: OUTPUT_BOUNDARY, targetPortId: 'parent-out' }],
    })
    expect(fn.executable).toBe(true)
    store.updateAsset(project.id, child.assetId, { name: 'Child', expectedRevision: 1, definition: { nodes: [{ id: 'n', kind: 'code', inputs: [{ id: 'x', name: 'x', typeId: 'system:string' }], outputs: [] }] } })
    const response = await app.inject({ method: 'POST', url, payload: { wrong: true } })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: 'not_executable', diagnostics: expect.any(Array) })
    expect(engine.executions.rootsOfProject(project.id)).toEqual([])
  })
  it('times out without cancellation and retains the completed result', async () => {
    let finish!: (value: RunnerResponse) => void
    const runner: Runner = { run: () => new Promise((resolve) => { finish = resolve }) }
    const { app, engine, attach } = setup(runner, 20)
    const { url } = attach(codeFunction('return { y: ctx.inputs.x }'))
    const response = await app.inject({ method: 'POST', url, payload: { x: 'hello' } })
    expect(response.statusCode).toBe(504)
    const id = response.json().executionId
    expect(response.headers['x-execution-id']).toBe(id)
    expect(engine.executions.get(id)?.status).toBe('running')
    finish({ ok: true, outputs: { y: 'hello' }, logs: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((await app.inject({ method: 'GET', url: `/executions/${id}` })).json()).toMatchObject({ status: 'success', outputs: [{ value: { value: 'hello' } }] })
  })
  it('executes real code, uses the latest definition and returns execution failure details over HTTP', async () => {
    const { app, store, project, attach } = setup()
    const { fn, url } = attach(codeFunction('return { y: ctx.inputs.x + "-v1" }'))
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address() as { port: number }
    const call = () => fetch(`http://127.0.0.1:${address.port}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a' }) })
    expect(await (await call()).json()).toEqual({ y: 'a-v1' })
    store.updateAsset(project.id, fn.assetId, { name: 'F', expectedRevision: 1, definition: codeFunction('return { y: ctx.inputs.x + "-v2" }') })
    expect(await (await call()).json()).toEqual({ y: 'a-v2' })
    store.updateAsset(project.id, fn.assetId, { name: 'F', expectedRevision: 2, definition: codeFunction('throw new Error("boom")') })
    const failed = await call()
    expect(failed.status).toBe(500)
    expect(await failed.json()).toMatchObject({ error: 'execution_failed', executionId: failed.headers.get('x-execution-id'), nodeId: 'code', message: expect.stringContaining('boom') })
  }, 30_000)
})
