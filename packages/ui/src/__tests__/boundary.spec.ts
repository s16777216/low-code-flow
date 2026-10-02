import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UI package boundary', () => {
  it('does not declare an application dependency in any dependency field', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
    )
    for (const [field, dependencies] of Object.entries(manifest)) {
      if (!/dependencies$/i.test(field)) continue
      const names = Array.isArray(dependencies) ? dependencies : Object.keys(dependencies as object)
      for (const name of names) {
        expect(name, `${field}: ${name}`).not.toMatch(/(?:^|\/)frontend(?:$|\/)/)
        expect(name, `${field}: ${name}`).not.toBe('low-code-flow')
      }
    }
  })
})
