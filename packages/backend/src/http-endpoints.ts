import type { FastifyInstance } from 'fastify'
import { normalizeFunction } from './domain/functions.ts'
import { isPlainObject, resolveAncestry, validateValue } from './domain/types.ts'
import { contextFromSnapshot, encodeFunctionRef } from './domain/values.ts'
import { ExecutionEngine, InputValidationError, NotExecutableError } from './engine/engine.ts'
import { NotFoundError, ValidationError } from './errors.ts'
import type { DefinitionStore } from './store.ts'

export interface HttpEndpointOptions {
  timeoutMs?: number
  publicBaseUrl?: string
}

/** The HTTP adapter owns wire representation and waiting; the engine owns validation and execution. */
export function registerHttpEndpoints(app: FastifyInstance, store: DefinitionStore, engine: ExecutionEngine, options: HttpEndpointOptions) {
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Endpoint timeout must be a positive number')
  app.register(async (routes) => {
    routes.removeAllContentTypeParsers()
    routes.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (request, body, done) => {
      // Runs before route lookup, so bad bodies get 415/400 even for unknown endpoints (still no execution). Empty JSON is intentionally accepted here.
      // Wrong methods only perform route lookup.
      if (request.method !== 'POST' || body.length === 0) return done(null, undefined)
      if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
        return done(Object.assign(new Error('Content-Type must be application/json'), { statusCode: 415 }))
      try { done(null, JSON.parse(body.toString())) }
      catch { done(Object.assign(new Error('Body must be valid JSON'), { statusCode: 400 })) }
    })

    routes.all<{ Params: { projectId: string; '*': string } }>('/run/:projectId/*', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
      const { projectId } = request.params
      const path = request.params['*']
      const endpoint = store.findEndpoint(projectId, path)
      if (!endpoint) throw new NotFoundError('Endpoint not found')
      if (request.method !== 'POST') return reply.header('Allow', 'POST').code(405).send({ error: 'method_not_allowed' })
      const snapshot = store.registry(projectId).getSnapshot()
      const record = snapshot.assets.get(endpoint.functionId)!
      const definition = normalizeFunction(record.definition)
      const empty = request.body === undefined
      const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
      if (contentType !== 'application/json' && !(empty && !contentType && definition.inputs.length === 0))
        return reply.code(415).send({ error: 'unsupported_media_type', message: 'Content-Type must be application/json' })
      if (!empty && !isPlainObject(request.body)) throw new ValidationError('Body must be a JSON object keyed by input port name')
      if (!record.executable) throw new NotExecutableError(record.diagnostics)

      const raw = (request.body ?? {}) as Record<string, unknown>
      const inputs = { ...raw }
      const { lookup } = contextFromSnapshot(snapshot)
      const conversionErrors: Record<string, string[]> = {}
      for (const port of definition.inputs) {
        if (!Object.hasOwn(raw, port.name)) continue
        const ancestry = resolveAncestry(port.typeId, lookup)
        if (!ancestry.ok) continue
        if (ancestry.root === 'date') {
          if (typeof raw[port.name] !== 'string') conversionErrors[port.name] = ['expected an ISO 8601 string with a time zone']
          else inputs[port.name] = { $kind: 'date', iso: raw[port.name] }
        }
        if (ancestry.root === 'function') {
          const id = raw[port.name]
          if (typeof id !== 'string' || snapshot.assets.get(id)?.kind !== 'function')
            conversionErrors[port.name] = ['expected a Function ID from this Project']
          else inputs[port.name] = encodeFunctionRef(id)
        }
      }
      // Collect ordinary port errors alongside conversion errors, without starting an execution.
      if (Object.keys(conversionErrors).length) {
        for (const port of definition.inputs) {
          if (conversionErrors[port.name]) continue
          const errors = Object.hasOwn(inputs, port.name) ? validateValue(port.typeId, inputs[port.name], lookup) : ['required input is missing']
          if (errors.length) conversionErrors[port.name] = errors
        }
        throw new InputValidationError(conversionErrors, Object.keys(raw).filter((key) => !definition.inputs.some((port) => port.name === key)))
      }
      const { executionId, done } = engine.start(snapshot, endpoint.functionId, inputs, { source: 'http', endpointPath: path })
      reply.header('X-Execution-Id', executionId)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const execution = await Promise.race([done, new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs) })])
        if (!execution) return reply.code(504).send({ error: 'execution_timeout', executionId })
        if (execution.status !== 'success') {
          const failed = execution.nodes.find((node) => node.status === 'failed')
          return reply.code(500).send({ error: 'execution_failed', executionId, nodeId: failed?.nodeId ?? null, message: execution.error?.message ?? 'Execution was cancelled' })
        }
        const outputs = Object.fromEntries(execution.outputs.map((port) => {
          const ancestry = resolveAncestry(port.typeId, lookup)
          const value = port.value!.value
          const wire = ancestry.ok && isPlainObject(value)
            ? ancestry.root === 'date' ? value.iso : ancestry.root === 'function' ? value.functionId : value
            : value
          return [port.portName, wire]
        }))
        return reply.send(outputs)
      } finally { if (timer) clearTimeout(timer) }
    })
  })
}
