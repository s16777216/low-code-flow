import Fastify from 'fastify'
import { NotFoundError, ReferencedError, RevisionConflictError, ValidationError } from './errors.ts'
import type { AssetRecord } from './registry.ts'
import type { DefinitionStore } from './store.ts'

type Body = Record<string, unknown>
const bodyOf = (request: { body: unknown }): Body => (request.body && typeof request.body === 'object' ? (request.body as Body) : {})

const summary = (r: AssetRecord) => ({
  id: r.assetId,
  kind: r.kind,
  name: r.name,
  revision: r.revision,
  updatedAt: r.updatedAt,
  executable: r.executable,
  diagnostics: {
    errors: r.diagnostics.filter((d) => d.severity === 'error').length,
    warnings: r.diagnostics.filter((d) => d.severity === 'warning').length,
  },
})

const detail = (projectId: string, r: AssetRecord) => ({
  ...summary(r),
  projectId,
  schemaVersion: r.schemaVersion,
  definition: r.definition,
  contentHash: r.contentHash,
  diagnostics: r.diagnostics,
})

export function buildApp(store: DefinitionStore) {
  const app = Fastify()

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ValidationError) return reply.code(400).send({ error: 'invalid_request', message: error.message })
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: error.message })
    if (error instanceof RevisionConflictError)
      return reply.code(409).send({ error: 'revision_conflict', message: error.message, currentRevision: error.currentRevision })
    if (error instanceof ReferencedError)
      return reply.code(409).send({ error: 'referenced', message: error.message, referencedBy: error.referencedBy })
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ error: 'bad_request', message: error.message })
    return reply.code(500).send({ error: 'internal_error' })
  })

  app.get('/projects', async () => store.listProjects())
  app.post('/projects', async (request, reply) => reply.code(201).send(store.createProject(bodyOf(request).name as string)))
  app.patch<{ Params: { projectId: string } }>('/projects/:projectId', async (request) =>
    store.renameProject(request.params.projectId, bodyOf(request).name as string),
  )
  app.delete<{ Params: { projectId: string } }>('/projects/:projectId', async (request, reply) => {
    store.deleteProject(request.params.projectId)
    return reply.code(204).send()
  })

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/assets', async (request) =>
    [...store.registry(request.params.projectId).getSnapshot().assets.values()].map(summary),
  )
  app.post<{ Params: { projectId: string } }>('/projects/:projectId/assets', async (request, reply) => {
    const { projectId } = request.params
    const body = bodyOf(request)
    const record = store.createAsset(projectId, { id: body.id, kind: body.kind, name: body.name, schemaVersion: body.schemaVersion, definition: body.definition })
    return reply.code(201).send(detail(projectId, record))
  })
  app.get<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/assets/:assetId', async (request) => {
    const { projectId, assetId } = request.params
    const record = store.registry(projectId).getAsset(assetId)
    if (!record) throw new NotFoundError(`Asset ${assetId} not found`)
    return detail(projectId, record)
  })
  app.put<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/assets/:assetId', async (request) => {
    const { projectId, assetId } = request.params
    const body = bodyOf(request)
    const record = store.updateAsset(projectId, assetId, {
      name: body.name,
      schemaVersion: body.schemaVersion,
      definition: body.definition,
      expectedRevision: body.expectedRevision as number,
    })
    return detail(projectId, record)
  })
  app.delete<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/assets/:assetId', async (request, reply) => {
    store.deleteAsset(request.params.projectId, request.params.assetId)
    return reply.code(204).send()
  })

  return app
}
