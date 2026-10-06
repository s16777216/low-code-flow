const REFERENCE_KEYS = new Set(['typeId', 'parentTypeId', 'functionId'])

// ponytail: scans for known key names instead of a per-kind schema; replace with schema-aware
// extraction once typed-function-ports defines the definition shapes.
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
