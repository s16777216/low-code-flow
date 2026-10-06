// Runs one Code Node in a restricted Node process (see ChildProcessRunner for the flags).
// Reads one JSON request from stdin and writes one JSON response line to stdout. Standalone on purpose:
// it may not import project files because the process has no file-system access beyond this script.

const MAX_LOG_LINES = 1000
const MAX_LOG_LINE_LENGTH = 4000
const logs: string[] = []

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
const log = (...args: unknown[]) => {
  if (logs.length < MAX_LOG_LINES) logs.push(args.map(stringify).join(' ').slice(0, MAX_LOG_LINE_LENGTH))
}
console.log = console.info = console.warn = console.error = console.debug = log

const isPlain = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Transport form -> JS: dates become Date objects. Function references stay as tagged data.
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (isPlain(value)) {
    if (value.$kind === 'date' && typeof value.iso === 'string') return new Date(value.iso)
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)]))
  }
  return value
}

// JS -> transport form: Date objects become tagged dates; anything JSON cannot carry is rejected.
function encode(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: ${String(value)} cannot be transported`)
    return value
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${path}: invalid Date`)
    return { $kind: 'date', iso: value.toISOString() }
  }
  if (Array.isArray(value)) return value.map((item, i) => encode(item === undefined ? null : item, `${path}[${i}]`))
  if (isPlain(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) if (child !== undefined) out[key] = encode(child, `${path}.${key}`)
    return out
  }
  throw new Error(`${path}: ${typeof value === 'function' ? 'functions and closures' : typeof value} cannot be transported`)
}

function respond(response: Record<string, unknown>): never {
  process.stdout.write(`${JSON.stringify({ ...response, logs })}\n`, () => process.exit(0))
  return undefined as never
}

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

try {
  const request = JSON.parse(raw) as { code: string; inputs: Record<string, unknown> }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (ctx: unknown) => Promise<unknown>
  const result = await new AsyncFunction('ctx', request.code)({ inputs: decode(request.inputs), log })
  if (!isPlain(result)) throw new Error('Code must return an object keyed by output port name')
  respond({ ok: true, outputs: encode(result, '$') })
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error))
  respond({ ok: false, error: { kind: 'error', message: err.message, stack: err.stack } })
}
