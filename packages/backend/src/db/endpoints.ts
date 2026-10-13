import { and, eq } from 'drizzle-orm'
import type { Db } from './connection.ts'
import { endpoints } from './schema.ts'

export const getEndpoint = (db: Db, functionId: string) => db.select().from(endpoints).where(eq(endpoints.functionId, functionId)).get()
export const findEndpoint = (db: Db, projectId: string, path: string) => db.select().from(endpoints).where(and(eq(endpoints.projectId, projectId), eq(endpoints.path, path))).get()
export const listEndpoints = (db: Db, projectId: string) => db.select().from(endpoints).where(eq(endpoints.projectId, projectId)).all()
export const removeEndpoint = (db: Db, functionId: string) => db.delete(endpoints).where(eq(endpoints.functionId, functionId)).run()
export function setEndpoint(db: Db, projectId: string, functionId: string, path: string) {
  const at = new Date().toISOString()
  return db.insert(endpoints).values({ projectId, functionId, path, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({ target: endpoints.functionId, set: { path, updatedAt: at } }).returning().get()
}
