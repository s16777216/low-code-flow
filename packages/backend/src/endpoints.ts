import { ValidationError } from './errors.ts'

export class EndpointConflictError extends Error {
  functionId: string
  functionName: string
  constructor(functionId: string, functionName: string) {
    super(`Path is already used by Function "${functionName}"`)
    this.functionId = functionId
    this.functionName = functionName
  }
}

export class EndpointAttachedError extends Error {
  path: string
  constructor(path: string) {
    super('Remove the endpoint before deleting this Function')
    this.path = path
  }
}

export function validateEndpointPath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || path.length > 128 || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(path))
    throw new ValidationError('Path must contain lowercase letters, numbers and single hyphens in slash-separated segments, at most 128 characters')
}

