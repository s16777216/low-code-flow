import type { PrimitiveType } from '@/types/FunctionNode'

// Nominal assignability (openspec typed-function-ports / nominal-type-system).
// `any` is assignable in both directions; values leaving `any` are validated at runtime.
// User-defined Types and inheritance are not modelled yet, so only identical base Types match.
export function isAssignable(source: PrimitiveType, target: PrimitiveType): boolean {
  return source === target || source === 'any' || target === 'any'
}
