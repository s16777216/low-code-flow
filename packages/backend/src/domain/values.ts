import { contentHash } from '../canonical.ts'
import type { AssetRegistrySnapshot } from '../registry.ts'
import { ANY_TYPE_ID, baseKindOf, isAssignable, isDateTransport, isFunctionRef, nonJsonErrors, validateValue, type TypeDefinition, type TypeLookup } from './types.ts'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** A value in transport form together with its nominal Type identity. */
export interface TypedValue {
  typeId: string
  typeDefinitionHash: string
  value: JsonValue
}

export interface TypeContext {
  lookup: TypeLookup
  hashOf: (typeId: string) => string
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export function contextFromSnapshot(snapshot: AssetRegistrySnapshot): TypeContext {
  return {
    lookup: (id) => {
      const asset = snapshot.assets.get(id)
      return asset?.kind === 'type' ? (asset.definition as TypeDefinition) : undefined
    },
    hashOf: (id) => {
      if (baseKindOf(id)) return contentHash('type', { system: id })
      const asset = snapshot.assets.get(id)
      if (!asset) throw new Error(`Type "${id}" is not in the snapshot`)
      return asset.contentHash
    },
  }
}

/** The only way a value gets a nominal Type: validate against the declared Type, then label it. */
export function createTypedValue(typeId: string, raw: unknown, ctx: TypeContext): Result<TypedValue> {
  const errors = validateValue(typeId, raw, ctx.lookup)
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { typeId, typeDefinitionHash: ctx.hashOf(typeId), value: raw as JsonValue } }
}

/** Moves a value onto a port of `targetTypeId`: nominal assignability, with `any` as the only escape hatch. */
export function transferValue(typed: TypedValue, targetTypeId: string, ctx: TypeContext): Result<TypedValue> {
  if (targetTypeId === ANY_TYPE_ID) return { ok: true, value: typed }
  if (typed.typeId === ANY_TYPE_ID) return createTypedValue(targetTypeId, typed.value, ctx)
  if (isAssignable(typed.typeId, targetTypeId, ctx.lookup)) return { ok: true, value: typed }
  return { ok: false, errors: [`Type ${typed.typeId} is not assignable to ${targetTypeId}`] }
}

export const encodeDate = (date: Date) => ({ $kind: 'date' as const, iso: date.toISOString() })

export function decodeDate(value: unknown): Date {
  if (!isDateTransport(value)) throw new Error('Not a date with a time zone')
  return new Date(value.iso)
}

export const encodeFunctionRef = (functionId: string) => ({ $kind: 'function-ref' as const, functionId })

export function decodeFunctionRef(value: unknown): string {
  if (!isFunctionRef(value)) throw new Error('Not a function reference')
  return value.functionId
}

export function assertTransportable(value: unknown): void {
  const errors = nonJsonErrors(value)
  if (errors.length) throw new Error(errors.join('; '))
}

/** Prefers the definition pinned in the execution snapshot; otherwise falls back to the latest one. */
export function resolveFunctionReference(
  functionId: string,
  pinned: ReadonlyMap<string, { hash: string }>,
  latest: (functionId: string) => { hash: string } | undefined,
): { source: 'snapshot' | 'latest'; hash: string } | undefined {
  const fromSnapshot = pinned.get(functionId)
  if (fromSnapshot) return { source: 'snapshot', hash: fromSnapshot.hash }
  const fromLatest = latest(functionId)
  return fromLatest && { source: 'latest', hash: fromLatest.hash }
}
