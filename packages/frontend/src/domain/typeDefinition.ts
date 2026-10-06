import type { RootKind } from '@/api/types'

export interface PropertyForm {
  name: string
  typeId: string
  required: boolean
}

export interface TypeForm {
  name: string
  parentTypeId: string
  minLength?: number
  maxLength?: number
  pattern: string
  min?: number
  max?: number
  integer: boolean
  /** undefined means "inherit the parent's properties". */
  properties?: PropertyForm[]
  elementTypeId?: string
}

interface RawConstraints {
  minLength?: number
  maxLength?: number
  pattern?: string
  min?: number
  max?: number
  integer?: boolean
  properties?: Array<{ name: string; typeId: string; required?: boolean }>
  elementType?: { typeId: string }
}

export function toForm(name: string, definition: unknown): TypeForm {
  const def = (definition ?? {}) as { parentTypeId?: string; constraints?: RawConstraints }
  const c = def.constraints ?? {}
  return {
    name,
    parentTypeId: def.parentTypeId ?? 'system:object',
    minLength: c.minLength,
    maxLength: c.maxLength,
    pattern: c.pattern ?? '',
    min: c.min,
    max: c.max,
    integer: c.integer === true,
    properties: c.properties?.map((p) => ({ name: p.name, typeId: p.typeId, required: p.required !== false })),
    elementTypeId: c.elementType?.typeId,
  }
}

const isSet = (value: number | undefined | null): value is number => typeof value === 'number' && Number.isFinite(value)

/** Builds the stored definition, keeping only the constraints that apply to the Type's root kind. */
export function toDefinition(form: TypeForm, rootKind: RootKind | null): { parentTypeId: string; constraints?: RawConstraints } {
  const constraints: RawConstraints = {}
  if (rootKind === 'string') {
    if (isSet(form.minLength)) constraints.minLength = form.minLength
    if (isSet(form.maxLength)) constraints.maxLength = form.maxLength
    if (form.pattern) constraints.pattern = form.pattern
  }
  if (rootKind === 'number') {
    if (isSet(form.min)) constraints.min = form.min
    if (isSet(form.max)) constraints.max = form.max
    if (form.integer) constraints.integer = true
  }
  if (rootKind === 'object' && form.properties) {
    constraints.properties = form.properties.map((p) => ({ name: p.name, typeId: p.typeId, ...(p.required ? {} : { required: false }) }))
  }
  if (rootKind === 'array' && form.elementTypeId) constraints.elementType = { typeId: form.elementTypeId }
  return { parentTypeId: form.parentTypeId, ...(Object.keys(constraints).length ? { constraints } : {}) }
}

/** The property list a subtype must repeat: the last list declared on the way down from the base Type. */
export function inheritedProperties(chainDefinitions: unknown[]): PropertyForm[] {
  let found: PropertyForm[] = []
  for (const definition of chainDefinitions) {
    const props = (definition as { constraints?: RawConstraints } | undefined)?.constraints?.properties
    if (props) found = props.map((p) => ({ name: p.name, typeId: p.typeId, required: p.required !== false }))
  }
  return found
}
