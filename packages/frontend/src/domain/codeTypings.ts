import type { PortDefinition, RootKind } from '@/api/types'
import type { TypeCatalog } from './catalog'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const key = (name: string) => (IDENTIFIER.test(name) ? name : JSON.stringify(name))

/** What the Code Node receives and may return for a Type of this root kind (the runner decodes dates). */
export function tsTypeOf(root: RootKind | null): string {
  switch (root) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'date': return 'Date'
    case 'function': return '{ $kind: "function-ref"; functionId: string }'
    case 'array': return 'unknown[]'
    case 'object': return 'Record<string, unknown>'
    default: return 'unknown'
  }
}

const members = (ports: PortDefinition[], catalog: TypeCatalog) =>
  ports.map((p) => `    /** ${catalog.name(p.typeId).replace(/\*\//g, '* /')} */\n    ${key(p.name)}: ${tsTypeOf(catalog.rootKind(p.typeId))};`).join('\n')

/** Declarations for the editor: `ctx.inputs` typed from the input ports, and the shape the code must return. */
export function ctxDeclarations(inputs: PortDefinition[], outputs: PortDefinition[], catalog: TypeCatalog): string {
  return [
    'type __Outputs = {',
    members(outputs, catalog),
    '};',
    'declare const ctx: {',
    '  /** Values of the input ports, by port name. */',
    '  inputs: {',
    members(inputs, catalog),
    '  };',
    '  log(...args: unknown[]): void;',
    '};',
    '',
  ].join('\n')
}

/**
 * The code is a function body at run time; wrapping it makes the compiler check what it returns.
 * The declarations travel inside the checked source so they always match the ports it is checked against.
 */
export function wrapForCheck(code: string, declarations: string): { source: string; lineOffset: number } {
  const header = declarations.endsWith('\n') ? declarations : `${declarations}\n`
  return { source: `${header}async function __run(): Promise<__Outputs> {\n${code}\n}\n`, lineOffset: header.split('\n').length }
}

/** Maps a line of the wrapped source back to the user's code; problems on the wrapper land on line 1. */
export function mapLine(line: number, lineOffset: number, codeLineCount: number): number {
  return Math.min(Math.max(line - lineOffset, 1), Math.max(codeLineCount, 1))
}

export function flattenMessage(message: string | { messageText: string; next?: unknown[] }): string {
  if (typeof message === 'string') return message
  const next = (message.next ?? []).map((m) => flattenMessage(m as { messageText: string; next?: unknown[] }))
  return [message.messageText, ...next].join(' ')
}
