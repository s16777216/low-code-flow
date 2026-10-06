import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { assertNotReserved } from '../errors.ts'
import type { Db } from './connection.ts'
import { assets, projects } from './schema.ts'

export type AssetKind = 'type' | 'function'
export type ProjectRow = typeof projects.$inferSelect
export type AssetRow = typeof assets.$inferSelect

const now = () => new Date().toISOString()

export function createProject(db: Db, name: string): ProjectRow {
  const at = now()
  return db.insert(projects).values({ id: randomUUID(), name, createdAt: at, updatedAt: at }).returning().get()
}

export const listProjects = (db: Db): ProjectRow[] => db.select().from(projects).all()

export const getProject = (db: Db, id: string): ProjectRow | undefined =>
  db.select().from(projects).where(eq(projects.id, id)).get()

export function renameProject(db: Db, id: string, name: string): ProjectRow | undefined {
  return db.update(projects).set({ name, updatedAt: now() }).where(eq(projects.id, id)).returning().get()
}

export function deleteProject(db: Db, id: string): boolean {
  return db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id }).all().length > 0
}

export interface NewAsset {
  id?: string
  projectId: string
  kind: AssetKind
  name: string
  schemaVersion: number
  definition: unknown
}

export function createAsset(db: Db, input: NewAsset): AssetRow {
  assertNotReserved(input.id)
  const at = now()
  return db
    .insert(assets)
    .values({ ...input, id: input.id ?? randomUUID(), revision: 1, createdAt: at, updatedAt: at })
    .returning()
    .get()
}

export const getAsset = (db: Db, id: string): AssetRow | undefined =>
  db.select().from(assets).where(eq(assets.id, id)).get()

export const listAssets = (db: Db, projectId: string): AssetRow[] =>
  db.select().from(assets).where(eq(assets.projectId, projectId)).all()

export type UpdateResult =
  | { status: 'updated'; asset: AssetRow }
  | { status: 'conflict'; currentRevision: number }
  | { status: 'not_found' }

export function updateAsset(
  db: Db,
  input: { id: string; expectedRevision: number; name: string; schemaVersion: number; definition: unknown },
): UpdateResult {
  const updated = db
    .update(assets)
    .set({
      name: input.name,
      schemaVersion: input.schemaVersion,
      definition: input.definition,
      revision: sql`${assets.revision} + 1`,
      updatedAt: now(),
    })
    .where(and(eq(assets.id, input.id), eq(assets.revision, input.expectedRevision)))
    .returning()
    .get()
  if (updated) return { status: 'updated', asset: updated }
  const current = getAsset(db, input.id)
  return current ? { status: 'conflict', currentRevision: current.revision } : { status: 'not_found' }
}

export function deleteAsset(db: Db, id: string): boolean {
  return db.delete(assets).where(eq(assets.id, id)).returning({ id: assets.id }).all().length > 0
}
