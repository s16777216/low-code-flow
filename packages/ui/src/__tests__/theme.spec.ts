import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, '../theme/theme.css'), 'utf8')
const tokens = (block: string) => [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]!)

describe('theme specification', () => {
  it('overrides exactly the theme color tokens for dark mode', () => {
    const theme = css.match(/@theme\s*\{([^}]+)\}/)?.[1]
    const dark = css.match(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]+)\}/,
    )?.[1]
    expect(theme).toBeDefined()
    expect(dark).toBeDefined()
    const colors = tokens(theme!).filter((name) => name.startsWith('--color-'))
    expect(colors.length).toBeGreaterThan(0)
    expect(new Set(tokens(dark!))).toEqual(new Set(colors))
  })

  it('contains no domain tokens and removes the default color palette', () => {
    expect(css).toMatch(/--color-\*:\s*initial/)
    expect(css).toMatch(/@source\s+['"]\.\.['"]/)
    for (const token of tokens(css)) {
      expect(token).not.toMatch(/(?:^|[-_])(type|port|asset|execution)(?:[-_]|$)/i)
    }
  })
})
