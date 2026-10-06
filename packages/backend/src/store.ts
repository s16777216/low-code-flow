import type { Db } from './db/connection.ts'
import * as repo from './db/repo.ts'
import { NotFoundError, ReferencedError, RevisionConflictError, ValidationError } from './errors.ts'
import { MutableRegistry, type AssetInput, type AssetRecord, type AssetValidator, type ProjectAssetRegistry } from './registry.ts'
import { validateDocument, type AssetDocument } from './validation.ts'

const toInput = (row: repo.AssetRow): AssetInput => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  schemaVersion: row.schemaVersion,
  definition: row.definition,
  revision: row.revision,
  updatedAt: row.updatedAt,
})

export function createDefinitionStore(db: Db, validate?: AssetValidator) {
  const registries = new Map<string, MutableRegistry>()
  const projectDeleted: Array<(projectId: string) => void> = []
  const inputsOf = (projectId: string) => repo.listAssets(db, projectId).map(toInput)
  const open = (projectId: string) => registries.set(projectId, new MutableRegistry(projectId, inputsOf(projectId), validate))
  for (const project of repo.listProjects(db)) open(project.id)

  const registryOf = (projectId: string) => {
    const registry = registries.get(projectId)
    if (!registry) throw new NotFoundError(`Project ${projectId} not found`)
    return registry
  }
  const rowOf = (projectId: string, assetId: string) => {
    const row = repo.getAsset(db, assetId)
    if (!row || row.projectId !== projectId) throw new NotFoundError(`Asset ${assetId} not found`)
    return row
  }
  const published = (projectId: string, assetId: string): AssetRecord => {
    registryOf(projectId).reload(inputsOf(projectId), [assetId])
    return registryOf(projectId).getAsset(assetId)!
  }

  return {
    listProjects: () => repo.listProjects(db),

    createProject(name: string) {
      if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name must be a non-empty string')
      const project = repo.createProject(db, name.trim())
      open(project.id)
      return project
    },

    renameProject(projectId: string, name: string) {
      if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name must be a non-empty string')
      const project = repo.renameProject(db, projectId, name.trim())
      if (!project) throw new NotFoundError(`Project ${projectId} not found`)
      return project
    },

    deleteProject(projectId: string) {
      if (!repo.deleteProject(db, projectId)) throw new NotFoundError(`Project ${projectId} not found`)
      registries.delete(projectId)
      for (const listener of projectDeleted) listener(projectId)
    },

    /** Lets the execution module cancel running executions of a deleted project. */
    onProjectDeleted: (listener: (projectId: string) => void) => void projectDeleted.push(listener),

    registry: (projectId: string): ProjectAssetRegistry => registryOf(projectId),

    createAsset(projectId: string, doc: AssetDocument): AssetRecord {
      registryOf(projectId)
      const valid = validateDocument(doc)
      if (doc.id !== undefined && repo.getAsset(db, doc.id as string)) throw new ValidationError(`ID "${String(doc.id)}" already exists`)
      const row = repo.createAsset(db, { id: doc.id as string | undefined, projectId, ...valid })
      return published(projectId, row.id)
    },

    updateAsset(projectId: string, assetId: string, doc: Omit<AssetDocument, 'kind' | 'id'> & { expectedRevision: number }): AssetRecord {
      const row = rowOf(projectId, assetId)
      if (!Number.isInteger(doc.expectedRevision)) throw new ValidationError('expectedRevision must be an integer')
      const valid = validateDocument({ ...doc, kind: row.kind }, { requireKind: false })
      const result = repo.updateAsset(db, { id: assetId, expectedRevision: doc.expectedRevision, ...valid })
      if (result.status === 'conflict') throw new RevisionConflictError(result.currentRevision)
      if (result.status === 'not_found') throw new NotFoundError(`Asset ${assetId} not found`)
      return published(projectId, assetId)
    },

    deleteAsset(projectId: string, assetId: string) {
      rowOf(projectId, assetId)
      const referrers = registryOf(projectId).getDependents(assetId).filter((id) => id !== assetId)
      if (referrers.length) throw new ReferencedError(referrers)
      repo.deleteAsset(db, assetId)
      registryOf(projectId).reload(inputsOf(projectId), [assetId])
    },
  }
}

export type DefinitionStore = ReturnType<typeof createDefinitionStore>
