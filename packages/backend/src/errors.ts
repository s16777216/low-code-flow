export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export class RevisionConflictError extends Error {
  currentRevision: number
  constructor(currentRevision: number) {
    super('The asset was modified by someone else')
    this.currentRevision = currentRevision
  }
}

export class ReferencedError extends Error {
  referencedBy: string[]
  constructor(referencedBy: string[]) {
    super('The asset is referenced by other assets')
    this.referencedBy = referencedBy
  }
}

export const RESERVED_ID_PREFIX = 'system:'

export function assertNotReserved(id: unknown) {
  if (typeof id === 'string' && id.startsWith(RESERVED_ID_PREFIX)) throw new ValidationError(`ID "${id}" uses the reserved "${RESERVED_ID_PREFIX}" prefix`)
}
