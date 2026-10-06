import { contentHash } from './canonical.ts'
import { extractReferences } from './references.ts'

export type AssetKind = 'type' | 'function'

export interface Diagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  assetId?: string
}

export interface AssetInput {
  id: string
  kind: AssetKind
  name: string
  schemaVersion: number
  definition: unknown
  revision: number
  updatedAt: string
}

export interface AssetRecord {
  assetId: string
  kind: AssetKind
  name: string
  schemaVersion: number
  revision: number
  updatedAt: string
  contentHash: string
  definition: unknown
  dependencies: string[]
  diagnostics: Diagnostic[]
  executable: boolean
}

export interface AssetRegistrySnapshot {
  snapshotId: string
  projectId: string
  assets: ReadonlyMap<string, AssetRecord>
  dependents: ReadonlyMap<string, ReadonlySet<string>>
}

export interface RegistryChange {
  previousSnapshotId: string
  snapshotId: string
  changedAssetIds: string[]
}

export interface ProjectAssetRegistry {
  getSnapshot(): AssetRegistrySnapshot
  getAsset(assetId: string): AssetRecord | undefined
  getDependencies(assetId: string): readonly string[]
  getDependents(assetId: string): readonly string[]
  subscribe(listener: (change: RegistryChange) => void): () => void
}

/** Semantic validation plug-in: returns diagnostics for one asset. */
export type AssetValidator = (
  asset: { id: string; kind: AssetKind; definition: unknown },
  lookup: (assetId: string) => AssetInput | undefined,
) => Diagnostic[]

export function buildSnapshot(
  projectId: string,
  snapshotId: string,
  inputs: AssetInput[],
  validate: AssetValidator = () => [],
): AssetRegistrySnapshot {
  const byId = new Map(inputs.map((input) => [input.id, input]))
  const lookup = (id: string) => byId.get(id)

  const dependencies = new Map<string, string[]>()
  const diagnostics = new Map<string, Diagnostic[]>()
  for (const input of inputs) {
    const refs = extractReferences(input.definition)
    dependencies.set(input.id, refs.filter((ref) => byId.has(ref)))
    diagnostics.set(input.id, [
      ...refs
        .filter((ref) => !byId.has(ref))
        .map((ref): Diagnostic => ({ severity: 'error', code: 'unresolved_reference', message: `Reference "${ref}" does not exist in this project`, assetId: ref })),
      ...validate({ id: input.id, kind: input.kind, definition: input.definition }, lookup),
    ])
  }

  const executable = new Map(inputs.map((input) => [input.id, !diagnostics.get(input.id)!.some((d) => d.severity === 'error')]))
  for (let changed = true; changed; ) {
    changed = false
    for (const input of inputs) {
      if (executable.get(input.id) && dependencies.get(input.id)!.some((dep) => dep !== input.id && !executable.get(dep))) {
        executable.set(input.id, false)
        changed = true
      }
    }
  }

  const dependents = new Map<string, Set<string>>()
  const assets = new Map<string, AssetRecord>()
  for (const input of inputs) {
    const deps = dependencies.get(input.id)!
    for (const dep of deps) dependents.set(dep, (dependents.get(dep) ?? new Set()).add(input.id))
    const failing = deps.filter((dep) => dep !== input.id && !executable.get(dep))
    const derived: Diagnostic[] = failing.length
      ? [{ severity: 'error', code: 'dependency_not_executable', message: `Depends on non-executable assets: ${failing.join(', ')}`, assetId: failing[0] }]
      : []
    assets.set(input.id, {
      assetId: input.id,
      kind: input.kind,
      name: input.name,
      schemaVersion: input.schemaVersion,
      revision: input.revision,
      updatedAt: input.updatedAt,
      contentHash: contentHash(input.kind, input.definition),
      definition: input.definition,
      dependencies: deps,
      diagnostics: [...diagnostics.get(input.id)!, ...derived],
      executable: executable.get(input.id)!,
    })
  }
  return { snapshotId, projectId, assets, dependents }
}

function withDependents(snapshot: AssetRegistrySnapshot, seeds: Iterable<string>, into: Set<string>) {
  const pending = [...seeds]
  while (pending.length) {
    const id = pending.pop()!
    if (into.has(id)) continue
    into.add(id)
    pending.push(...(snapshot.dependents.get(id) ?? []))
  }
}

export class MutableRegistry implements ProjectAssetRegistry {
  private snapshot: AssetRegistrySnapshot
  private counter = 0
  private listeners = new Set<(change: RegistryChange) => void>()
  private projectId: string
  private validate: AssetValidator

  constructor(projectId: string, inputs: AssetInput[], validate?: AssetValidator) {
    this.projectId = projectId
    this.validate = validate ?? (() => [])
    this.snapshot = buildSnapshot(projectId, this.nextId(), inputs, this.validate)
  }

  private nextId = () => `${this.projectId}:${++this.counter}`

  // ponytail: rebuilds the whole project's snapshot on every write (O(assets)); make it incremental if projects grow large.
  /** Atomically replaces the snapshot; `touched` are the assets that were written or deleted. */
  reload(inputs: AssetInput[], touched: string[]): RegistryChange {
    const previous = this.snapshot
    const next = buildSnapshot(this.projectId, this.nextId(), inputs, this.validate)
    this.snapshot = next
    const changed = new Set<string>()
    withDependents(previous, touched, changed)
    withDependents(next, touched, changed)
    const change = { previousSnapshotId: previous.snapshotId, snapshotId: next.snapshotId, changedAssetIds: [...changed].sort() }
    for (const listener of this.listeners) {
      try {
        listener(change)
      } catch {
        // a failing subscriber must not break the write
      }
    }
    return change
  }

  getSnapshot = () => this.snapshot
  getAsset = (assetId: string) => this.snapshot.assets.get(assetId)
  getDependencies = (assetId: string) => this.snapshot.assets.get(assetId)?.dependencies ?? []
  getDependents = (assetId: string) => [...(this.snapshot.dependents.get(assetId) ?? [])].sort()
  subscribe = (listener: (change: RegistryChange) => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
}
