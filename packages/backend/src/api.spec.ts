import { describe, expect, it } from 'vitest'
import { buildApp } from './api.ts'
import { openDatabase } from './db/connection.ts'
import { createDefinitionStore } from './store.ts'

function setup() {
  const { db } = openDatabase()
  const app = buildApp(createDefinitionStore(db, ({ definition }) => ((definition as { draft?: boolean }).draft ? [{ severity: 'error', code: 'draft', message: 'draft' }] : [])))
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as object | undefined })
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined }
  }
  return { call }
}

describe('project API', () => {
  it('creates, lists, renames and deletes projects', async () => {
    const { call } = setup()
    const created = await call('POST', '/projects', { name: 'orders' })
    expect(created.status).toBe(201)
    expect((await call('PATCH', `/projects/${created.body.id}`, { name: 'billing' })).body.name).toBe('billing')
    expect((await call('GET', '/projects')).body.map((p: { name: string }) => p.name)).toEqual(['billing'])
    expect((await call('DELETE', `/projects/${created.body.id}`)).status).toBe(204)
    expect((await call('GET', '/projects')).body).toEqual([])
  })

  it('returns 400 for a missing name and 404 for an unknown project', async () => {
    const { call } = setup()
    expect((await call('POST', '/projects', {})).status).toBe(400)
    expect((await call('GET', '/projects/nope/assets')).status).toBe(404)
    expect((await call('DELETE', '/projects/nope')).status).toBe(404)
  })
})

describe('asset API', () => {
  async function withProject() {
    const ctx = setup()
    const project = (await ctx.call('POST', '/projects', { name: 'p' })).body
    return { ...ctx, base: `/projects/${project.id}/assets` }
  }

  it('creates, reads, lists, updates and deletes an asset', async () => {
    const { call, base } = await withProject()
    const created = await call('POST', base, { kind: 'function', name: 'GetUser', definition: { draft: true } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ revision: 1, executable: false, diagnostics: [{ code: 'draft' }] })

    const read = await call('GET', `${base}/${created.body.id}`)
    expect(read.body.definition).toEqual({ draft: true })
    expect((await call('GET', base)).body[0]).toMatchObject({ id: created.body.id, executable: false, diagnostics: { errors: 1, warnings: 0 } })

    const updated = await call('PUT', `${base}/${created.body.id}`, { name: 'GetUser', definition: {}, expectedRevision: 1 })
    expect(updated.body).toMatchObject({ revision: 2, executable: true })

    expect((await call('DELETE', `${base}/${created.body.id}`)).status).toBe(204)
    expect((await call('GET', `${base}/${created.body.id}`)).status).toBe(404)
  })

  it('returns 400 for structurally invalid documents and unparsable JSON', async () => {
    const { call, base } = await withProject()
    const bad = await call('POST', base, { kind: 'function', name: 'x', definition: [] })
    expect(bad).toMatchObject({ status: 400, body: { error: 'invalid_request' } })
    expect((await call('POST', base, { kind: 'type', name: 'x', definition: {}, id: 'system:string' })).status).toBe(400)
  })

  it('returns 409 with the current revision when a second client saves a stale revision', async () => {
    const { call, base } = await withProject()
    const created = (await call('POST', base, { kind: 'type', name: 'T', definition: { v: 0 } })).body
    const url = `${base}/${created.id}`
    expect((await call('PUT', url, { name: 'T', definition: { v: 1 }, expectedRevision: 1 })).status).toBe(200)

    const stale = await call('PUT', url, { name: 'T', definition: { v: 2 }, expectedRevision: 1 })
    expect(stale).toMatchObject({ status: 409, body: { error: 'revision_conflict', currentRevision: 2 } })
    expect((await call('GET', url)).body.definition).toEqual({ v: 1 })
  })

  it('returns 409 listing referrers when deleting a referenced asset', async () => {
    const { call, base } = await withProject()
    const child = (await call('POST', base, { kind: 'function', name: 'Child', definition: {} })).body
    const parent = (await call('POST', base, { kind: 'function', name: 'Parent', definition: { nodes: [{ functionId: child.id }] } })).body

    const blocked = await call('DELETE', `${base}/${child.id}`)
    expect(blocked).toMatchObject({ status: 409, body: { error: 'referenced', referencedBy: [parent.id] } })
  })

  it('does not expose another project\'s asset', async () => {
    const ctx = await withProject()
    const asset = (await ctx.call('POST', ctx.base, { kind: 'type', name: 'T', definition: {} })).body
    const other = (await ctx.call('POST', '/projects', { name: 'other' })).body
    expect((await ctx.call('GET', `/projects/${other.id}/assets/${asset.id}`)).status).toBe(404)
  })
})
