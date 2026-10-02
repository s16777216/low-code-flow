export interface FunctionPort {
  id: string
  name: string
  type: PrimitiveType
}

export interface FunctionNode {
  label: string
  inputs?: FunctionPort[]
  outputs?: FunctionPort[]
  code?: string
}

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'function' | 'any';
