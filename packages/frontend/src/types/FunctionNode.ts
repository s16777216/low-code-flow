import type { LucideIcon } from "@lucide/vue";

export interface FunctionNode {
  label: string;
  inputs?: string[];
  outputs?: string[];
  code?: string;
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


