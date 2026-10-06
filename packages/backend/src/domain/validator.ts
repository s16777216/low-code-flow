import type { AssetValidator } from '../registry.ts'
import { normalizeFunction, validateFunctionDefinition, type FunctionLookup } from './functions.ts'
import { validateTypeDefinition, type TypeDefinition, type TypeLookup } from './types.ts'

/** Semantic validation for Types and Functions, plugged into the Registry. */
export const typedPortsValidator: AssetValidator = ({ id, kind, definition }, lookup) => {
  const typeLookup: TypeLookup = (typeId) => {
    const asset = lookup(typeId)
    return asset?.kind === 'type' ? (asset.definition as TypeDefinition) : undefined
  }
  const kindOf = (assetId: string) => lookup(assetId)?.kind
  if (kind === 'type') return validateTypeDefinition(id, definition, typeLookup, kindOf)

  const functionLookup: FunctionLookup = (functionId) => {
    const asset = lookup(functionId)
    return asset?.kind === 'function' ? normalizeFunction(asset.definition) : undefined
  }
  return validateFunctionDefinition(id, definition, { typeLookup, functionLookup, kindOf })
}
