import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db/connection.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { createDefinitionStore } from '../store.ts'
import { INPUT_BOUNDARY, OUTPUT_BOUNDARY } from './functions.ts'
import { typedPortsValidator } from './validator.ts'

const port = (id: string, typeId: string, name = id) => ({ id, name, typeId })
const edge = (id: string, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId })

function setup() {
  const { db } = openDatabase()
  const store = createDefinitionStore(db, typedPortsValidator)
  const project = store.createProject('orders')
  const type = (name: string, parentTypeId: string, constraints?: object) =>
    store.createAsset(project.id, { kind: 'type', name, definition: { parentTypeId, ...(constraints ? { constraints } : {}) } })
  const fn = (name: string, definition: object) => store.createAsset(project.id, { kind: 'function', name, definition })
  return { store, project, type, fn, registry: store.registry(project.id) }
}

/** input(inType) -> code(nodeType in -> out) -> output(outType) */
const passThrough = (inType: string, nodeType = inType, outType = nodeType) => ({
  inputs: [port('p-in', inType)],
  outputs: [port('p-out', outType)],
  nodes: [{ id: 'n', kind: 'code', code: 'return { out: ctx.inputs.in }', inputs: [port('n-in', nodeType, 'in')], outputs: [port('n-out', nodeType, 'out')] }],
  edges: [edge('e1', INPUT_BOUNDARY, 'p-in', 'n', 'n-in'), edge('e2', 'n', 'n-out', OUTPUT_BOUNDARY, 'p-out')],
})

describe('system base types are immutable', () => {
  it('cannot be created, modified or deleted through the store', () => {
    const { store, project } = setup()
    expect(() => store.createAsset(project.id, { id: 'system:string', kind: 'type', name: 'x', definition: { parentTypeId: 'system:object' } })).toThrow(ValidationError)
    expect(() => store.updateAsset(project.id, 'system:string', { name: 'x', definition: {}, expectedRevision: 1 })).toThrow(NotFoundError)
    expect(() => store.deleteAsset(project.id, 'system:string')).toThrow(NotFoundError)
  })

  it('rejects a user type inheriting any and a type with no usable parent', () => {
    const { type, registry } = setup()
    const payload = type('Payload', 'system:any')
    expect(payload.executable).toBe(false)
    expect(registry.getAsset(payload.assetId)!.diagnostics.map((d) => d.code)).toEqual(['any_parent'])
  })
})

describe('type definitions', () => {
  it('accepts a multi-level ancestry and keys the content hash on the definition', () => {
    const { type, store, project, registry } = setup()
    const id = type('Id', 'system:string')
    const userId = type('UserId', id.assetId)
    expect([id, userId].every((t) => t.executable)).toBe(true)
    expect(registry.getDependencies(userId.assetId)).toEqual([id.assetId])

    const before = registry.getAsset(userId.assetId)!.contentHash
    store.updateAsset(project.id, userId.assetId, { name: 'UserId', definition: { parentTypeId: id.assetId, constraints: { minLength: 3 } }, expectedRevision: 1 })
    expect(registry.getAsset(userId.assetId)!.contentHash).not.toBe(before)
  })

  it('reports an inheritance cycle and makes the members non-executable', () => {
    const { type, store, project, registry } = setup()
    const a = type('A', 'system:string')
    const b = type('B', a.assetId)
    store.updateAsset(project.id, a.assetId, { name: 'A', definition: { parentTypeId: b.assetId }, expectedRevision: 1 })
    expect(registry.getAsset(a.assetId)!.diagnostics.map((d) => d.code)).toContain('inheritance_cycle')
    expect(registry.getAsset(b.assetId)!.executable).toBe(false)
  })

  it('revalidates dependent functions immediately when a type changes', () => {
    const { type, fn, store, project, registry } = setup()
    const user = type('User', 'system:object')
    const admin = type('AdminUser', user.assetId)
    const f = fn('Promote', passThrough(admin.assetId, user.assetId))
    expect(f.executable).toBe(true)

    store.updateAsset(project.id, admin.assetId, { name: 'AdminUser', definition: { parentTypeId: 'system:object' }, expectedRevision: 1 })
    expect(registry.getAsset(f.assetId)).toMatchObject({ executable: false })
    expect(registry.getAsset(f.assetId)!.diagnostics.map((d) => d.code)).toContain('incompatible_edge')
  })
})

describe('functions in the registry', () => {
  it('flags incompatible edges and graph errors as diagnostics without blocking the save', () => {
    const { type, fn } = setup()
    const userId = type('UserId', 'system:string')
    const orderId = type('OrderId', 'system:string')
    const bad = fn('Mixup', passThrough(userId.assetId, orderId.assetId))
    expect(bad.executable).toBe(false)
    expect(bad.diagnostics.map((d) => d.code)).toEqual(['incompatible_edge'])
  })

  it('treats a valid multi-port function as executable', () => {
    const { type, fn } = setup()
    const userId = type('UserId', 'system:string')
    expect(fn('Ok', passThrough(userId.assetId, 'system:string')).executable).toBe(true)
    expect(fn('FromAny', passThrough('system:any', userId.assetId)).executable).toBe(true)
    expect(fn('IntoAny', passThrough(userId.assetId, 'system:any')).executable).toBe(true)
  })

  it('invalidates a parent when a child port disappears, and keeps it after an internal change', () => {
    const { type, fn, store, project, registry } = setup()
    const userId = type('UserId', 'system:string')
    const child = fn('Child', passThrough(userId.assetId))
    const parent = fn('Parent', {
      inputs: [port('p-in', userId.assetId)],
      outputs: [port('p-out', userId.assetId)],
      nodes: [{ id: 'call', kind: 'function', functionId: child.assetId }],
      edges: [edge('e1', INPUT_BOUNDARY, 'p-in', 'call', 'p-in'), edge('e2', 'call', 'p-out', OUTPUT_BOUNDARY, 'p-out')],
    })
    expect(parent.executable).toBe(true)

    const internal = { ...passThrough(userId.assetId), nodes: [{ ...passThrough(userId.assetId).nodes[0]!, code: 'return { out: "changed" }' }] }
    store.updateAsset(project.id, child.assetId, { name: 'Child', definition: internal, expectedRevision: 1 })
    expect(registry.getAsset(parent.assetId)).toMatchObject({ executable: true, revision: 1 })

    store.updateAsset(project.id, child.assetId, { name: 'Child', definition: { ...internal, outputs: [] , edges: [internal.edges[0]!] }, expectedRevision: 2 })
    expect(registry.getAsset(parent.assetId)!.executable).toBe(false)
    expect(registry.getAsset(parent.assetId)!.diagnostics.map((d) => d.code)).toContain('edge_unknown_port')
  })

  it('does not let an invalid function become executable through its dependents', () => {
    const { fn, registry } = setup()
    const cyclic = fn('Loop', {
      nodes: [
        { id: 'a', kind: 'code', inputs: [port('a-in', 'system:string')], outputs: [port('a-out', 'system:string')] },
        { id: 'b', kind: 'code', inputs: [port('b-in', 'system:string')], outputs: [port('b-out', 'system:string')] },
      ],
      edges: [edge('e1', 'a', 'a-out', 'b', 'b-in'), edge('e2', 'b', 'b-out', 'a', 'a-in')],
    })
    const caller = fn('Caller', { nodes: [{ id: 'x', kind: 'function', functionId: cyclic.assetId }] })
    expect(registry.getAsset(cyclic.assetId)!.diagnostics.map((d) => d.code)).toContain('dag_cycle')
    expect(registry.getAsset(caller.assetId)!.executable).toBe(false)
  })
})
