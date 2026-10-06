import type { RootKind, SystemType, TypeInfo } from '@/api/types'
import type { AncestryOf } from './assignability'

export interface TypeEntry {
  id: string
  name: string
  rootKind: RootKind | null
  ancestry: string[]
  system: boolean
  executable: boolean
}

export interface TypeCatalog {
  entries: TypeEntry[]
  get(id: string): TypeEntry | undefined
  name(id: string): string
  rootKind(id: string): RootKind | null
  ancestryOf: AncestryOf
  /** Types that inherit from `id`, directly or not (never includes `id` itself). */
  descendantsOf(id: string): string[]
}

export function createCatalog(system: SystemType[], types: TypeInfo[]): TypeCatalog {
  const entries: TypeEntry[] = [
    ...system.map((t) => ({ id: t.id, name: t.name, rootKind: t.rootKind, ancestry: [t.id], system: true, executable: true })),
    ...types.map((t) => ({ id: t.id, name: t.name, rootKind: t.rootKind, ancestry: t.ancestry, system: false, executable: t.executable })),
  ]
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return {
    entries,
    get: (id) => byId.get(id),
    name: (id) => byId.get(id)?.name ?? `(missing: ${id})`,
    rootKind: (id) => byId.get(id)?.rootKind ?? null,
    ancestryOf: (id) => byId.get(id)?.ancestry,
    descendantsOf: (id) => entries.filter((entry) => entry.id !== id && entry.ancestry.includes(id)).map((entry) => entry.id),
  }
}

export const emptyCatalog = (): TypeCatalog => createCatalog([], [])
