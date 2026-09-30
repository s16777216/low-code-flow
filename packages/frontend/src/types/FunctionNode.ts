export interface FunctionPort {
  // Immutable handle ID; edges reference this, so renaming `name` keeps connections intact.
  id: string
  name: string
}

export interface FunctionNode {
  label: string
  inputs?: FunctionPort[]
  outputs?: FunctionPort[]
  code?: string
}

type DefinitionType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

interface InputDefinition {
  name: string
  type: DefinitionType
  required: boolean
  defaultValue?: unknown
}

interface OutputDefinition {
  name: string
  type: DefinitionType
}
