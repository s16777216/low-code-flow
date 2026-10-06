import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './connection.ts'
import * as repo from './repo.ts'

const fnDefinition = { inputs: [{ id: 'p1', typeId: 'system:string' }], nodes: [{ id: 'n1', code: 'return { a: 1 }' }] }

describe('database connection', () => {
  it('applies migrations to a fresh in-memory database', () => {
    const { db, close } = openDatabase()
    expect(repo.listProjects(db)).toEqual([])
    close()
  })

  it('applies migrations again to an already migrated file database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backend-db-'))
    const file = join(dir, 'test.db')
    const first = openDatabase(file)
    first.close()
    const second = openDatabase(file)
    expect(repo.listProjects(second.db)).toEqual([])
    second.close()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('project repository', () => {
  it('creates, renames and lists projects', () => {
    const { db } = openDatabase()
    const project = repo.createProject(db, 'orders')
    expect(repo.renameProject(db, project.id, 'billing')?.name).toBe('billing')
    expect(repo.listProjects(db).map((p) => p.name)).toEqual(['billing'])
  })

  it('deleting a project deletes its assets', () => {
    const { db } = openDatabase()
    const project = repo.createProject(db, 'orders')
    const asset = repo.createAsset(db, { projectId: project.id, kind: 'type', name: 'User', schemaVersion: 1, definition: {} })
    expect(repo.deleteProject(db, project.id)).toBe(true)
    expect(repo.getAsset(db, asset.id)).toBeUndefined()
  })
})

describe('asset repository', () => {
  it('generates ids and reads back identical definitions after reopening the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'backend-db-'))
    const file = join(dir, 'test.db')
    const first = openDatabase(file)
    const project = repo.createProject(first.db, 'orders')
    const created = repo.createAsset(first.db, { projectId: project.id, kind: 'function', name: 'GetUser', schemaVersion: 1, definition: fnDefinition })
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.revision).toBe(1)
    first.close()

    const second = openDatabase(file)
    expect(repo.getAsset(second.db, created.id)?.definition).toEqual(fnDefinition)
    second.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an id with the reserved system: prefix', () => {
    const { db } = openDatabase()
    const project = repo.createProject(db, 'p')
    expect(() =>
      repo.createAsset(db, { id: 'system:string', projectId: project.id, kind: 'type', name: 'X', schemaVersion: 1, definition: {} }),
    ).toThrow(/reserved/)
    expect(repo.listAssets(db, project.id)).toEqual([])
  })

  it('increments the revision when the expected revision matches', () => {
    const { db } = openDatabase()
    const project = repo.createProject(db, 'p')
    const asset = repo.createAsset(db, { projectId: project.id, kind: 'type', name: 'A', schemaVersion: 1, definition: {} })
    const result = repo.updateAsset(db, { id: asset.id, expectedRevision: 1, name: 'B', schemaVersion: 1, definition: { x: 1 } })
    expect(result).toMatchObject({ status: 'updated', asset: { revision: 2, name: 'B' } })
  })

  it('rejects a stale revision without changing anything', () => {
    const { db } = openDatabase()
    const project = repo.createProject(db, 'p')
    const asset = repo.createAsset(db, { projectId: project.id, kind: 'type', name: 'A', schemaVersion: 1, definition: { v: 'first' } })
    repo.updateAsset(db, { id: asset.id, expectedRevision: 1, name: 'A', schemaVersion: 1, definition: { v: 'second' } })

    const stale = repo.updateAsset(db, { id: asset.id, expectedRevision: 1, name: 'A', schemaVersion: 1, definition: { v: 'stale' } })
    expect(stale).toEqual({ status: 'conflict', currentRevision: 2 })
    expect(repo.getAsset(db, asset.id)?.definition).toEqual({ v: 'second' })
  })

  it('reports a missing asset on update', () => {
    const { db } = openDatabase()
    expect(repo.updateAsset(db, { id: 'nope', expectedRevision: 1, name: 'A', schemaVersion: 1, definition: {} })).toEqual({ status: 'not_found' })
  })
})
