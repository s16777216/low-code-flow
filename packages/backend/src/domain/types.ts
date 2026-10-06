import type { Diagnostic } from '../registry.ts'

export const BASE_KINDS = ['string', 'number', 'date', 'function', 'object', 'boolean', 'array', 'any'] as const
export type RootKind = (typeof BASE_KINDS)[number]

export const SYSTEM_TYPE_IDS: Readonly<Record<RootKind, string>> = Object.freeze(
  Object.fromEntries(BASE_KINDS.map((kind) => [kind, `system:${kind}`])) as Record<RootKind, string>,
)
export const ANY_TYPE_ID = SYSTEM_TYPE_IDS.any

export const baseKindOf = (typeId: string): RootKind | undefined => BASE_KINDS.find((kind) => `system:${kind}` === typeId)

export interface PropertyDefinition {
  name: string
  typeId: string
  required?: boolean
}

/** Constraints are optional per type; an omitted key inherits from the parent. */
export interface TypeConstraints {
  minLength?: number
  maxLength?: number
  pattern?: string
  min?: number
  max?: number
  integer?: boolean
  /** Full property list of an object type, including inherited properties. */
  properties?: PropertyDefinition[]
  elementType?: { typeId: string }
}

export interface TypeDefinition {
  parentTypeId: string
  constraints?: TypeConstraints
}

/** Returns the definition of a user-defined Type; system Types are resolved internally. */
export type TypeLookup = (typeId: string) => TypeDefinition | undefined

export type Ancestry =
  | { ok: true; chain: string[]; root: RootKind }
  | { ok: false; code: 'unknown_type' | 'inheritance_cycle' | 'any_parent' | 'invalid_parent'; message: string }

/** `chain` runs from the Type itself up to its system base Type. */
export function resolveAncestry(typeId: string, lookup: TypeLookup): Ancestry {
  const chain: string[] = []
  const seen = new Set<string>()
  for (let current = typeId; ; ) {
    const root = baseKindOf(current)
    if (root) return { ok: true, chain: [...chain, current], root }
    if (seen.has(current)) return { ok: false, code: 'inheritance_cycle', message: `Inheritance cycle: ${[...chain, current].join(' → ')}` }
    seen.add(current)
    chain.push(current)
    const definition = lookup(current)
    if (!definition) return { ok: false, code: 'unknown_type', message: `Type "${current}" does not exist` }
    const parent = definition.parentTypeId
    if (typeof parent !== 'string' || !parent) return { ok: false, code: 'invalid_parent', message: `Type "${current}" must have exactly one parent` }
    if (parent === ANY_TYPE_ID) return { ok: false, code: 'any_parent', message: `Type "${current}" cannot inherit from any` }
    current = parent
  }
}

/** Nominal: same Type, descendant to ancestor, or either side is `any`. Structure never matters. */
export function isAssignable(source: string, target: string, lookup: TypeLookup): boolean {
  if (source === target || source === ANY_TYPE_ID || target === ANY_TYPE_ID) return true
  const ancestry = resolveAncestry(source, lookup)
  return ancestry.ok && ancestry.chain.includes(target)
}

interface Effective {
  minLength?: number
  maxLength?: number
  patterns: string[]
  min?: number
  max?: number
  integer?: boolean
  properties?: PropertyDefinition[]
  elementTypeId?: string
}

function effectiveConstraints(chain: string[], lookup: TypeLookup): Effective {
  const effective: Effective = { patterns: [] }
  for (const id of [...chain].reverse()) {
    const c = lookup(id)?.constraints
    if (!c) continue
    if (c.minLength !== undefined) effective.minLength = c.minLength
    if (c.maxLength !== undefined) effective.maxLength = c.maxLength
    if (c.pattern !== undefined) effective.patterns.push(c.pattern)
    if (c.min !== undefined) effective.min = c.min
    if (c.max !== undefined) effective.max = c.max
    if (c.integer !== undefined) effective.integer = c.integer
    if (c.properties !== undefined) effective.properties = c.properties
    if (c.elementType !== undefined) effective.elementTypeId = c.elementType.typeId
  }
  return effective
}

const ALLOWED_CONSTRAINTS: Record<RootKind, string[]> = {
  string: ['minLength', 'maxLength', 'pattern'],
  number: ['min', 'max', 'integer'],
  object: ['properties'],
  array: ['elementType'],
  boolean: [],
  date: [],
  function: [],
  any: [],
}

const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function validRegExp(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

/** Design-time diagnostics for one Type definition. `lookup` must also resolve the Type being checked. */
export function validateTypeDefinition(id: string, definition: unknown, lookup: TypeLookup, kindOf: (assetId: string) => string | undefined): Diagnostic[] {
  const out: Diagnostic[] = []
  const error = (code: string, message: string) => void out.push({ severity: 'error', code, message })
  const def = (definition ?? {}) as Partial<TypeDefinition>

  if (Array.isArray(def.parentTypeId)) return [{ severity: 'error', code: 'multiple_parents', message: 'A Type has exactly one parent' }]
  if (typeof def.parentTypeId !== 'string' || !def.parentTypeId) return [{ severity: 'error', code: 'missing_parent', message: 'A Type must inherit from a system base Type or another Type' }]
  const parent = def.parentTypeId
  if (parent === ANY_TYPE_ID) return [{ severity: 'error', code: 'any_parent', message: 'A Type cannot inherit from any' }]
  if (parent.startsWith('system:') && !baseKindOf(parent)) return [{ severity: 'error', code: 'unknown_system_type', message: `"${parent}" is not a system Type` }]
  if (kindOf(parent) === 'function') return [{ severity: 'error', code: 'parent_not_a_type', message: `"${parent}" is a Function, not a Type` }]

  const ancestry = resolveAncestry(id, lookup)
  if (!ancestry.ok) return ancestry.code === 'unknown_type' ? [] : [{ severity: 'error', code: ancestry.code, message: ancestry.message }]

  const constraints = def.constraints ?? {}
  const root = ancestry.root
  for (const key of Object.keys(constraints))
    if (!ALLOWED_CONSTRAINTS[root].includes(key)) error('inapplicable_constraint', `"${key}" does not apply to ${root} types`)

  const inherited = effectiveConstraints(ancestry.chain.slice(1), lookup)
  const merged = effectiveConstraints(ancestry.chain, lookup)

  if (root === 'string') {
    if (constraints.minLength !== undefined && !isNonNegativeInteger(constraints.minLength)) error('invalid_constraint', 'minLength must be a non-negative integer')
    if (constraints.maxLength !== undefined && !isNonNegativeInteger(constraints.maxLength)) error('invalid_constraint', 'maxLength must be a non-negative integer')
    if (constraints.pattern !== undefined && (typeof constraints.pattern !== 'string' || !validRegExp(constraints.pattern))) error('invalid_constraint', 'pattern is not a valid regular expression')
    if (constraints.minLength !== undefined && inherited.minLength !== undefined && constraints.minLength < inherited.minLength) error('widened_constraint', `minLength ${constraints.minLength} is looser than the inherited ${inherited.minLength}`)
    if (constraints.maxLength !== undefined && inherited.maxLength !== undefined && constraints.maxLength > inherited.maxLength) error('widened_constraint', `maxLength ${constraints.maxLength} is looser than the inherited ${inherited.maxLength}`)
    if (merged.minLength !== undefined && merged.maxLength !== undefined && merged.minLength > merged.maxLength) error('empty_range', 'minLength is greater than maxLength')
  }

  if (root === 'number') {
    if (constraints.min !== undefined && !isFiniteNumber(constraints.min)) error('invalid_constraint', 'min must be a finite number')
    if (constraints.max !== undefined && !isFiniteNumber(constraints.max)) error('invalid_constraint', 'max must be a finite number')
    if (constraints.min !== undefined && inherited.min !== undefined && constraints.min < inherited.min) error('widened_constraint', `min ${constraints.min} is looser than the inherited ${inherited.min}`)
    if (constraints.max !== undefined && inherited.max !== undefined && constraints.max > inherited.max) error('widened_constraint', `max ${constraints.max} is looser than the inherited ${inherited.max}`)
    if (constraints.integer === false && inherited.integer === true) error('widened_constraint', 'integer cannot be relaxed')
    if (merged.min !== undefined && merged.max !== undefined && merged.min > merged.max) error('empty_range', 'min is greater than max')
  }

  if (root === 'object' && constraints.properties !== undefined) {
    const props = constraints.properties
    if (!Array.isArray(props)) error('invalid_constraint', 'properties must be an array')
    else {
      const names = new Set<string>()
      for (const prop of props) {
        if (!prop || typeof prop.name !== 'string' || !prop.name || typeof prop.typeId !== 'string') error('invalid_constraint', 'every property needs a name and a typeId')
        else if (names.has(prop.name)) error('duplicate_property', `Property "${prop.name}" is declared twice`)
        else names.add(prop.name)
        if (prop?.typeId?.startsWith('system:') && !baseKindOf(prop.typeId)) error('unknown_system_type', `"${prop.typeId}" is not a system Type`)
      }
      for (const inheritedProp of inherited.properties ?? []) {
        const own = props.find((p) => p?.name === inheritedProp.name)
        if (!own) error('removed_property', `Inherited property "${inheritedProp.name}" cannot be removed`)
        else {
          if (!isAssignable(own.typeId, inheritedProp.typeId, lookup)) error('incompatible_property', `Property "${own.name}" must stay assignable to ${inheritedProp.typeId}`)
          if (inheritedProp.required !== false && own.required === false) error('relaxed_property', `Inherited required property "${own.name}" cannot become optional`)
        }
      }
    }
  }

  if (root === 'array') {
    if (constraints.elementType !== undefined && typeof constraints.elementType?.typeId !== 'string') error('invalid_constraint', 'elementType needs a typeId')
    else if (constraints.elementType?.typeId.startsWith('system:') && !baseKindOf(constraints.elementType.typeId)) error('unknown_system_type', `"${constraints.elementType.typeId}" is not a system Type`)
    else if (constraints.elementType === undefined && inherited.elementTypeId === undefined) error('missing_element_type', 'An array Type must define its element Type')
    else if (constraints.elementType !== undefined && inherited.elementTypeId !== undefined && !isAssignable(constraints.elementType.typeId, inherited.elementTypeId, lookup))
      error('incompatible_element_type', `Element Type must stay assignable to ${inherited.elementTypeId}`)
  }
  return out
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export const isDateTransport = (value: unknown): value is { $kind: 'date'; iso: string } =>
  isPlainObject(value) && value.$kind === 'date' && typeof value.iso === 'string' && ISO_WITH_ZONE.test(value.iso) && !Number.isNaN(Date.parse(value.iso))

export const isFunctionRef = (value: unknown): value is { $kind: 'function-ref'; functionId: string } =>
  isPlainObject(value) && value.$kind === 'function-ref' && typeof value.functionId === 'string' && value.functionId.length > 0

/** Reasons a raw value cannot cross a process boundary as JSON (closures, undefined, NaN, ...). */
export function nonJsonErrors(value: unknown, path = '$'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return []
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path}: ${String(value)} is not a JSON number`]
  if (typeof value === 'function') return [`${path}: functions and closures cannot be transported`]
  if (Array.isArray(value)) return value.flatMap((item, i) => nonJsonErrors(item, `${path}[${i}]`))
  if (isPlainObject(value)) return Object.entries(value).flatMap(([k, v]) => nonJsonErrors(v, `${path}.${k}`))
  return [`${path}: ${typeof value} cannot be transported`]
}

function checkRoot(root: RootKind, value: unknown, path: string): string[] {
  switch (root) {
    case 'string': return typeof value === 'string' ? [] : [`${path}: expected string`]
    case 'number': return isFiniteNumber(value) ? [] : [`${path}: expected number`]
    case 'boolean': return typeof value === 'boolean' ? [] : [`${path}: expected boolean`]
    case 'date': return isDateTransport(value) ? [] : [`${path}: expected an ISO 8601 date with a time zone`]
    case 'function': return isFunctionRef(value) ? [] : [`${path}: expected a function reference`]
    case 'array': return Array.isArray(value) ? [] : [`${path}: expected array`]
    case 'object': return isPlainObject(value) && !('$kind' in value) ? [] : [`${path}: expected object`]
    case 'any': return nonJsonErrors(value, path)
  }
}

function checkConstraints(root: RootKind, c: TypeConstraints, value: unknown, path: string, lookup: TypeLookup): string[] {
  const errors: string[] = []
  if (root === 'string' && typeof value === 'string') {
    if (c.minLength !== undefined && value.length < c.minLength) errors.push(`${path}: shorter than ${c.minLength}`)
    if (c.maxLength !== undefined && value.length > c.maxLength) errors.push(`${path}: longer than ${c.maxLength}`)
    if (c.pattern !== undefined && validRegExp(c.pattern) && !new RegExp(c.pattern).test(value)) errors.push(`${path}: does not match ${c.pattern}`)
  }
  if (root === 'number' && typeof value === 'number') {
    if (c.min !== undefined && value < c.min) errors.push(`${path}: below ${c.min}`)
    if (c.max !== undefined && value > c.max) errors.push(`${path}: above ${c.max}`)
    if (c.integer && !Number.isInteger(value)) errors.push(`${path}: expected an integer`)
  }
  if (root === 'object' && isPlainObject(value)) {
    for (const prop of c.properties ?? []) {
      const child = value[prop.name]
      if (child === undefined) {
        if (prop.required !== false) errors.push(`${path}.${prop.name}: required property is missing`)
      } else errors.push(...validateValue(prop.typeId, child, lookup, `${path}.${prop.name}`))
    }
  }
  if (root === 'array' && Array.isArray(value) && c.elementType)
    value.forEach((item, i) => errors.push(...validateValue(c.elementType!.typeId, item, lookup, `${path}[${i}]`)))
  return errors
}

/** Validates a transport-form value against a Type and every ancestor's constraints. Returns error messages. */
export function validateValue(typeId: string, value: unknown, lookup: TypeLookup, path = '$'): string[] {
  const ancestry = resolveAncestry(typeId, lookup)
  if (!ancestry.ok) return [`${path}: ${ancestry.message}`]
  const rootErrors = checkRoot(ancestry.root, value, path)
  if (rootErrors.length) return rootErrors
  const errors = [...ancestry.chain].reverse().flatMap((id) => {
    const constraints = lookup(id)?.constraints
    return constraints ? checkConstraints(ancestry.root, constraints, value, path, lookup) : []
  })
  return [...new Set(errors)]
}
