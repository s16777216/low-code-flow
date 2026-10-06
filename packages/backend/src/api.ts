import Fastify from 'fastify'
import { BASE_KINDS, SYSTEM_TYPE_IDS, resolveAncestry } from './domain/types.ts'
import { nodePorts, normalizeFunction } from './domain/functions.ts'
import { contextFromSnapshot } from './domain/values.ts'
import { ExecutionEngine, InputValidationError, NotExecutableError } from './engine/engine.ts'
import { NotFoundError, ReferencedError, RevisionConflictError, ValidationError } from './errors.ts'
import type { AssetRecord, AssetRegistrySnapshot } from './registry.ts'
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

/** Everything that depends on the asset, directly or not. */
function impactOf(snapshot: AssetRegistrySnapshot, assetId: string) {
  const seen = new Set<string>()
  const pending = [...(snapshot.dependents.get(assetId) ?? [])]
  while (pending.length) {
    const id = pending.pop()!
    if (id === assetId || seen.has(id)) continue
    seen.add(id)
    pending.push(...(snapshot.dependents.get(id) ?? []))
  }
  return [...seen].sort().map((id) => {
    const r = snapshot.assets.get(id)!
    return { id, kind: r.kind, name: r.name, executable: r.executable }
  })
}

export function buildApp(store: DefinitionStore, engine?: ExecutionEngine) {
  const app = Fastify()

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error instanceof ValidationError) return reply.code(400).send({ error: 'invalid_request', message: error.message })
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: error.message })
    if (error instanceof RevisionConflictError)
      return reply.code(409).send({ error: 'revision_conflict', message: error.message, currentRevision: error.currentRevision })
    if (error instanceof InputValidationError)
      return reply.code(400).send({ error: 'invalid_input', message: error.message, ports: error.ports, unknownKeys: error.unknownKeys })
    if (error instanceof NotExecutableError)
      return reply.code(409).send({ error: 'not_executable', message: error.message, diagnostics: error.diagnostics })
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

  app.get('/system-types', async () => BASE_KINDS.map((kind) => ({ id: SYSTEM_TYPE_IDS[kind], name: kind, rootKind: kind, immutable: true })))

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/types', async (request) => {
    const snapshot = store.registry(request.params.projectId).getSnapshot()
    const { lookup } = contextFromSnapshot(snapshot)
    return [...snapshot.assets.values()]
      .filter((r) => r.kind === 'type')
      .map((r) => {
        const ancestry = resolveAncestry(r.assetId, lookup)
        return { ...summary(r), rootKind: ancestry.ok ? ancestry.root : null, ancestry: ancestry.ok ? ancestry.chain : [] }
      })
  })

  app.get<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/types/:assetId', async (request) => {
    const { projectId, assetId } = request.params
    const snapshot = store.registry(projectId).getSnapshot()
    const record = snapshot.assets.get(assetId)
    if (!record || record.kind !== 'type') throw new NotFoundError(`Type ${assetId} not found`)
    const ancestry = resolveAncestry(assetId, contextFromSnapshot(snapshot).lookup)
    return { ...detail(projectId, record), rootKind: ancestry.ok ? ancestry.root : null, ancestry: ancestry.ok ? ancestry.chain : [] }
  })

  app.get<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/assets/:assetId/impact', async (request) => {
    const { projectId, assetId } = request.params
    const snapshot = store.registry(projectId).getSnapshot()
    if (!snapshot.assets.has(assetId)) throw new NotFoundError(`Asset ${assetId} not found`)
    return { assetId, dependents: impactOf(snapshot, assetId) }
  })

  const functionView = (snapshot: AssetRegistrySnapshot, projectId: string, record: AssetRecord) => {
    const def = normalizeFunction(record.definition)
    const lookupFunction = (id: string) => {
      const asset = snapshot.assets.get(id)
      return asset?.kind === 'function' ? normalizeFunction(asset.definition) : undefined
    }
    return {
      ...detail(projectId, record),
      signature: { inputs: def.inputs, outputs: def.outputs },
      nodes: def.nodes.map((node) => ({ id: node.id, kind: node.kind, name: node.name, ports: nodePorts(def, node.id, lookupFunction) ?? null })),
    }
  }

  app.get<{ Params: { projectId: string } }>('/projects/:projectId/functions', async (request) => {
    const snapshot = store.registry(request.params.projectId).getSnapshot()
    return [...snapshot.assets.values()]
      .filter((r) => r.kind === 'function')
      .map((r) => ({ ...summary(r), signature: (({ inputs, outputs }) => ({ inputs, outputs }))(normalizeFunction(r.definition)) }))
  })

  app.get<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/functions/:assetId', async (request) => {
    const { projectId, assetId } = request.params
    const snapshot = store.registry(projectId).getSnapshot()
    const record = snapshot.assets.get(assetId)
    if (!record || record.kind !== 'function') throw new NotFoundError(`Function ${assetId} not found`)
    return functionView(snapshot, projectId, record)
  })

  if (engine) {
    app.post<{ Params: { projectId: string; assetId: string } }>('/projects/:projectId/functions/:assetId/execute', async (request, reply) => {
      const { projectId, assetId } = request.params
      const inputs = bodyOf(request).inputs
      if (inputs !== undefined && (typeof inputs !== 'object' || inputs === null || Array.isArray(inputs))) throw new ValidationError('inputs must be an object keyed by input port name')
      const { executionId } = engine.start(store.registry(projectId).getSnapshot(), assetId, (inputs ?? {}) as Record<string, unknown>)
      return reply.code(202).send({ executionId })
    })

    app.get<{ Params: { executionId: string } }>('/executions/:executionId', async (request) => {
      const tree = engine.executions.tree(request.params.executionId)
      if (!tree) throw new NotFoundError('Execution not found; it may have been evicted or the server restarted')
      return tree
    })

    app.post<{ Params: { executionId: string } }>('/executions/:executionId/cancel', async (request) => {
      const { executionId } = request.params
      if (!engine.executions.get(executionId)) throw new NotFoundError('Execution not found; it may have been evicted or the server restarted')
      return { cancelled: engine.cancel(executionId) }
    })
  }

  return app
}
