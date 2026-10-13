import { expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import Database from 'better-sqlite3'
import { openDatabase } from './connection.ts'
import { createDefinitionStore } from '../store.ts'
import { setEndpoint } from './endpoints.ts'

it('enforces path uniqueness in the database, even when bypassing the store', () => {
  const database = openDatabase()
  try {
    const store = createDefinitionStore(database.db)
    const project = store.createProject('P')
    const first = store.createAsset(project.id, { kind: 'function', name: 'First', definition: {} })
    const second = store.createAsset(project.id, { kind: 'function', name: 'Second', definition: {} })
    setEndpoint(database.db, project.id, first.assetId, 'same-path')
    expect(() => setEndpoint(database.db, project.id, second.assetId, 'same-path')).toThrow('UNIQUE constraint failed')
  } finally { database.close() }
})

it('migrates an existing database without losing data and retains endpoints on restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'flow-endpoints-'))
  const file = join(folder, 'definitions.db')
  try {
    const migrationFolder = join(folder, 'old-migrations')
    mkdirSync(join(migrationFolder, 'meta'), { recursive: true })
    writeFileSync(join(migrationFolder, '0000_curious_venom.sql'), readFileSync(new URL('../../drizzle/0000_curious_venom.sql', import.meta.url)))
    const journal = JSON.parse(readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'))
    journal.entries = journal.entries.slice(0, 1)
    writeFileSync(join(migrationFolder, 'meta/_journal.json'), JSON.stringify(journal))
    const old = new Database(file)
    try {
      migrate(drizzle(old), { migrationsFolder: migrationFolder })
      old.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run('existing', 'Existing', 'now', 'now')
    } finally { old.close() }
    const database = openDatabase(file)
    let functionId: string
    try {
      const store = createDefinitionStore(database.db)
      expect(store.listProjects()[0]!.name).toBe('Existing')
      const fn = store.createAsset('existing', { kind: 'function', name: 'F', definition: {} })
      functionId = fn.assetId
      store.setEndpoint('existing', functionId, 'persisted')
    } finally { database.close() }
    const restarted = openDatabase(file)
    try {
      const store = createDefinitionStore(restarted.db)
      expect(store.getEndpoint('existing', functionId)?.path).toBe('persisted')
      store.deleteProject('existing')
      expect(restarted.db.all('SELECT * FROM endpoints')).toEqual([])
    } finally { restarted.close() }
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
