const REFERENCE_KEYS = new Set(['typeId', 'parentTypeId', 'functionId'])

// ponytail: scans for key names instead of walking a per-kind schema. The definition shapes in
// src/domain use exactly these keys (typeId, parentTypeId, functionId) for every reference, so the scan
// is exact today; switch to a schema walk if a definition ever stores free-form data under those keys.
export function extractReferences(definition: unknown): string[] {
  const found = new Set<string>()
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (REFERENCE_KEYS.has(key) && typeof child === 'string' && !child.startsWith('system:')) found.add(child)
      else walk(child)
    }
  }
  walk(definition)
  return [...found].sort()
}
