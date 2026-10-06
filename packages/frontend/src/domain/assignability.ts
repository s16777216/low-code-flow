export const ANY_TYPE_ID = 'system:any'

/** Ancestry of a Type from itself up to its system base Type; undefined when the Type is unknown. */
export type AncestryOf = (typeId: string) => readonly string[] | undefined

// Nominal assignability (openspec typed-function-ports / nominal-type-system):
// the same Type, a descendant to its ancestor, or `any` on either side. Structure never matters.
export function isAssignable(source: string, target: string, ancestryOf: AncestryOf): boolean {
  if (source === target || source === ANY_TYPE_ID || target === ANY_TYPE_ID) return true
  return ancestryOf(source)?.includes(target) ?? false
}
