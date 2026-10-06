import { assertNotReserved, ValidationError } from './errors.ts'
import type { AssetKind } from './registry.ts'

export const SUPPORTED_SCHEMA_VERSIONS = [1]

export interface AssetDocument {
  id?: unknown
  kind: unknown
  name: unknown
  schemaVersion?: unknown
  definition: unknown
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Structural checks only; semantic problems are reported as diagnostics instead. */
export function validateDocument(doc: AssetDocument, options: { requireKind?: boolean } = {}) {
  if (doc.id !== undefined && (typeof doc.id !== 'string' || !doc.id)) throw new ValidationError('id must be a non-empty string')
  assertNotReserved(doc.id)
  if (options.requireKind !== false && doc.kind !== 'type' && doc.kind !== 'function')
    throw new ValidationError('kind must be "type" or "function"')
  if (typeof doc.name !== 'string' || !doc.name.trim()) throw new ValidationError('name must be a non-empty string')
  const schemaVersion = doc.schemaVersion ?? SUPPORTED_SCHEMA_VERSIONS[0]
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as number))
    throw new ValidationError(`schemaVersion ${String(schemaVersion)} is not supported`)
  if (!isPlainObject(doc.definition)) throw new ValidationError('definition must be a JSON object')
  return {
    kind: doc.kind as AssetKind,
    name: doc.name.trim(),
    schemaVersion: schemaVersion as number,
    definition: doc.definition,
  }
}
