import type { RootKind } from '@/api/types'

export type RawFieldKind = 'text' | 'number' | 'boolean' | 'date' | 'json'

/** Which kind of form field a port needs to collect a raw value. */
export function fieldKindFor(root: RootKind | null): RawFieldKind {
  if (root === 'string') return 'text'
  if (root === 'number') return 'number'
  if (root === 'boolean') return 'boolean'
  if (root === 'date') return 'date'
  return 'json'
}

export const initialFieldText = (kind: RawFieldKind): string => (kind === 'boolean' ? 'false' : kind === 'json' ? 'null' : '')

export type RawResult = { ok: true; value: unknown } | { ok: false; error: string }

/** Turns what the user typed into the raw JSON value the execute API expects. */
export function parseField(kind: RawFieldKind, text: string): RawResult {
  switch (kind) {
    case 'text':
      return { ok: true, value: text }
    case 'boolean':
      return { ok: true, value: text === 'true' }
    case 'number': {
      if (text.trim() === '') return { ok: false, error: 'Enter a number' }
      const value = Number(text)
      return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: 'Not a number' }
    }
    case 'date':
      return text.trim() === '' ? { ok: false, error: 'Enter a date and time with a time zone, e.g. 2026-10-02T08:00:00Z' } : { ok: true, value: { $kind: 'date', iso: text.trim() } }
    case 'json':
      try {
        return { ok: true, value: JSON.parse(text) }
      } catch {
        return { ok: false, error: 'Not valid JSON' }
      }
  }
}
