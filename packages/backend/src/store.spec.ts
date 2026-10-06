import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { canonicalize, contentHash } from './canonical.ts'
import { openDatabase } from './db/connection.ts'
import { ReferencedError, RevisionConflictError, ValidationError } from './errors.ts'
import type { AssetValidator, RegistryChange } from './registry.ts'
import { createDefinitionStore } from './store.ts'

// Stand-in for the typed-function-ports validator: flags drafts and edges into missing child ports.
const validate: AssetValidator = ({ definition }, lookup) => {
  const def = definition as { incomplete?: boolean; calls?: Array<{ functionId: string; port: string }> }
  const out = def.incomplete ? [{ severity: 'error' as const, code: 'incomplete', message: 'draft is incomplete' }] : []
  for (const call of def.calls ?? []) {
    const child = lookup(call.functionId)?.definition as { outputs?: string[] } | undefined
    if (child && !child.outputs?.includes(call.port))
      out.push({ severity: 'error', code: 'missing_port', message: `${call.functionId} has no output ${call.port}` })
  }
  return out
}

function setup() {
  const { db, close } = openDatabase()
  const store = createDefinitionStore(db, validate)
  return { store, project: store.createProject('orders'), db, close }
}

describe('document validation', () => {
  it('rejects malformed documents without changing existing content', () => {
    const { store, project } = setup()
    const user = store.createAsset(project.id, { kind: 'type', name: 'User', definition: { a: 1 } })
    const bad = [
      { kind: 'nope', name: 'x', definition: {} },
      { kind: 'type', name: '  ', definition: {} },
      { kind: 'type', name: 'x', definition: [] },
      { kind: 'type', name: 'x', schemaVersion: 99, definition: {} },
      { kind: 'type', name: 'x', definition: {}, id: 'system:string' },
      { kind: 'type', name: 'x', definition: {}, id: 42 },
      { kind: 'type', name: 'x', definition: {}, id: user.assetId },
    ]
    for (const doc of bad) expect(() => store.createAsset(project.id, doc)).toThrow(ValidationError)
    expect(() => store.updateAsset(project.id, user.assetId, { name: 'x', definition: 'oops', expectedRevision: 1 })).toThrow(ValidationError)

    expect(store.registry(project.id).getSnapshot().assets.size).toBe(1)
    expect(store.registry(project.id).getAsset(user.assetId)).toMatchObject({ revision: 1, definition: { a: 1 } })
  })
})

describe('references and hashes', () => {
  it('indexes type parent, port type and child function references, ignoring system types', () => {
    const { store, project } = setup()
    const base = store.createAsset(project.id, { kind: 'type', name: 'Base', definition: { parentTypeId: 'system:object' } })
    const child = store.createAsset(project.id, { kind: 'type', name: 'Child', definition: { parentTypeId: base.assetId } })
    const leaf = store.createAsset(project.id, { kind: 'function', name: 'Leaf', definition: {} })
    const fn = store.createAsset(project.id, {
      kind: 'function',
      name: 'Root',
      definition: { inputs: [{ typeId: child.assetId }, { typeId: 'system:string' }], nodes: [{ functionId: leaf.assetId }] },
    })

    const registry = store.registry(project.id)
    expect(registry.getDependencies(child.assetId)).toEqual([base.assetId])
    expect(registry.getDependencies(fn.assetId)).toEqual([child.assetId, leaf.assetId].sort())
    expect(registry.getDependents(base.assetId)).toEqual([child.assetId])
    expect(registry.getDependents(leaf.assetId)).toEqual([fn.assetId])
  })

  it('treats an id from another project as unresolved', () => {
    const { store, project } = setup()
    const other = store.createProject('other')
    const foreign = store.createAsset(other.id, { kind: 'type', name: 'Foreign', definition: {} })
    const fn = store.createAsset(project.id, { kind: 'function', name: 'F', definition: { inputs: [{ typeId: foreign.assetId }] } })

    expect(fn.executable).toBe(false)
    expect(fn.diagnostics[0]).toMatchObject({ code: 'unresolved_reference', assetId: foreign.assetId })
  })

  it('ignores key order and whitespace in the content hash', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize(JSON.parse('{ "a": {"c":3,\n "d":2}, "b": 1 }')))
    expect(contentHash('type', { a: 1, b: [1, 2] })).toBe(contentHash('type', { b: [1, 2], a: 1 }))
    expect(contentHash('type', { a: 1 })).not.toBe(contentHash('function', { a: 1 }))
  })
})

describe('executability', () => {
  it('propagates a non-executable draft to dependents and recovers when fixed', () => {
    const { store, project } = setup()
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: { incomplete: true } })
    const checkout = store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { nodes: [{ functionId: getUser.assetId }] } })
    const app = store.createAsset(project.id, { kind: 'function', name: 'App', definition: { nodes: [{ functionId: checkout.assetId }] } })

    expect(getUser.executable).toBe(false)
    const registry = store.registry(project.id)
    expect(registry.getAsset(checkout.assetId)).toMatchObject({ executable: false })
    expect(registry.getAsset(checkout.assetId)!.diagnostics).toContainEqual(expect.objectContaining({ code: 'dependency_not_executable', assetId: getUser.assetId }))
    expect(registry.getAsset(app.assetId)!.executable).toBe(false)

    store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: {}, expectedRevision: 1 })
    expect(registry.getAsset(app.assetId)!.executable).toBe(true)
  })

  it('always resolves the latest child definition and reflects a removed port immediately', () => {
    const { store, project } = setup()
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: { outputs: ['user'], code: 'v1' } })
    const checkout = store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { calls: [{ functionId: getUser.assetId, port: 'user' }] } })
    const registry = store.registry(project.id)
    expect(checkout.executable).toBe(true)

    store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: { outputs: ['user'], code: 'v2' }, expectedRevision: 1 })
    expect((registry.getAsset(getUser.assetId)!.definition as { code: string }).code).toBe('v2')
    expect(registry.getAsset(checkout.assetId)).toMatchObject({ executable: true, revision: 1 })

    store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: { outputs: [], code: 'v3' }, expectedRevision: 2 })
    expect(registry.getAsset(checkout.assetId)!.executable).toBe(false)
    expect(registry.getAsset(checkout.assetId)!.diagnostics.map((d) => d.code)).toContain('missing_port')
  })
})

describe('snapshots and notifications', () => {
  it('rebuilds the same snapshot after restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backend-store-'))
    const file = join(dir, 'test.db')
    const first = openDatabase(file)
    const store = createDefinitionStore(first.db, validate)
    const project = store.createProject('orders')
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: { incomplete: true } })
    store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { nodes: [{ functionId: getUser.assetId }] } })
    const strip = (s: ReturnType<typeof store.registry>) => canonicalize([...s.getSnapshot().assets.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)))
    const before = strip(store.registry(project.id))
    first.close()

    const second = openDatabase(file)
    const reopened = createDefinitionStore(second.db, validate)
    expect(strip(reopened.registry(project.id))).toBe(before)
    second.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps held snapshots stable, leaves the snapshot alone on a failed write, and notifies with dependents', () => {
    const { store, project } = setup()
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: {} })
    const checkout = store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { nodes: [{ functionId: getUser.assetId }] } })
    const unrelated = store.createAsset(project.id, { kind: 'function', name: 'Other', definition: {} })
    const registry = store.registry(project.id)
    const listener = vi.fn<(change: RegistryChange) => void>()
    registry.subscribe(listener)

    const held = registry.getSnapshot()
    store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: { v: 2 }, expectedRevision: 1 })
    expect(held.assets.get(getUser.assetId)!.revision).toBe(1)
    expect(registry.getSnapshot().assets.get(getUser.assetId)!.revision).toBe(2)
    expect(listener).toHaveBeenCalledWith({
      previousSnapshotId: held.snapshotId,
      snapshotId: registry.getSnapshot().snapshotId,
      changedAssetIds: [checkout.assetId, getUser.assetId].sort(),
    })
    expect(listener.mock.calls[0]![0].changedAssetIds).not.toContain(unrelated.assetId)

    const current = registry.getSnapshot()
    expect(() => store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: { v: 3 }, expectedRevision: 1 })).toThrow(RevisionConflictError)
    expect(registry.getSnapshot()).toBe(current)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not let a throwing subscriber break the write', () => {
    const { store, project } = setup()
    store.registry(project.id).subscribe(() => {
      throw new Error('boom')
    })
    expect(() => store.createAsset(project.id, { kind: 'type', name: 'A', definition: {} })).not.toThrow()
  })
})

describe('concurrent edits', () => {
  it('rejects the second of two saves based on the same revision', () => {
    const { store, project } = setup()
    const fn = store.createAsset(project.id, { kind: 'function', name: 'F', definition: { by: 'nobody' } })
    store.updateAsset(project.id, fn.assetId, { name: 'F', definition: { by: 'first' }, expectedRevision: fn.revision })
    let error: unknown
    try {
      store.updateAsset(project.id, fn.assetId, { name: 'F', definition: { by: 'second' }, expectedRevision: fn.revision })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(RevisionConflictError)
    expect((error as RevisionConflictError).currentRevision).toBe(2)
    expect(store.registry(project.id).getAsset(fn.assetId)!.definition).toEqual({ by: 'first' })
  })
})

describe('deletion', () => {
  it('refuses to delete a referenced asset and lists the referrers, but deletes an unreferenced one', () => {
    const { store, project } = setup()
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: {} })
    const checkout = store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { nodes: [{ functionId: getUser.assetId }] } })

    let error: unknown
    try {
      store.deleteAsset(project.id, getUser.assetId)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ReferencedError)
    expect((error as ReferencedError).referencedBy).toEqual([checkout.assetId])
    expect(store.registry(project.id).getAsset(getUser.assetId)).toBeDefined()

    store.deleteAsset(project.id, checkout.assetId)
    store.deleteAsset(project.id, getUser.assetId)
    expect(store.registry(project.id).getSnapshot().assets.size).toBe(0)
  })

  it('deletes a project, releases its registry and fires the deletion hook', () => {
    const { store, project } = setup()
    store.createAsset(project.id, { kind: 'type', name: 'A', definition: {} })
    const hook = vi.fn<(projectId: string) => void>()
    store.onProjectDeleted(hook)

    store.deleteProject(project.id)
    expect(hook).toHaveBeenCalledWith(project.id)
    expect(() => store.registry(project.id)).toThrow(/not found/)
    expect(store.listProjects()).toEqual([])
  })
})

describe('end to end', () => {
  it('walks a multi-level project through draft, fix and delete', () => {
    const { store, project } = setup()
    const base = store.createAsset(project.id, { kind: 'type', name: 'Id', definition: { parentTypeId: 'system:string' } })
    const userId = store.createAsset(project.id, { kind: 'type', name: 'UserId', definition: { parentTypeId: base.assetId } })
    const getUser = store.createAsset(project.id, { kind: 'function', name: 'GetUser', definition: { inputs: [{ typeId: userId.assetId }], outputs: ['user'], incomplete: true } })
    const checkout = store.createAsset(project.id, { kind: 'function', name: 'Checkout', definition: { calls: [{ functionId: getUser.assetId, port: 'user' }] } })
    const app = store.createAsset(project.id, { kind: 'function', name: 'App', definition: { nodes: [{ functionId: checkout.assetId }] } })
    const registry = store.registry(project.id)

    expect([base, userId].every((a) => registry.getAsset(a.assetId)!.executable)).toBe(true)
    expect([getUser, checkout, app].every((a) => !registry.getAsset(a.assetId)!.executable)).toBe(true)

    store.updateAsset(project.id, getUser.assetId, { name: 'GetUser', definition: { inputs: [{ typeId: userId.assetId }], outputs: ['user'] }, expectedRevision: 1 })
    expect([getUser, checkout, app].every((a) => registry.getAsset(a.assetId)!.executable)).toBe(true)

    expect(() => store.deleteAsset(project.id, userId.assetId)).toThrow(ReferencedError)
    store.deleteAsset(project.id, app.assetId)
    store.deleteAsset(project.id, checkout.assetId)
    store.deleteAsset(project.id, getUser.assetId)
    store.deleteAsset(project.id, userId.assetId)
    store.deleteAsset(project.id, base.assetId)
    expect(registry.getSnapshot().assets.size).toBe(0)
  })
})
