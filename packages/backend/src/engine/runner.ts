import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Raw inputs and outputs are keyed by port name and use the JSON transport form (dates are tagged). */
export interface RunnerRequest {
  code: string
  inputs: Record<string, unknown>
}

export type RunnerResponse =
  | { ok: true; outputs: Record<string, unknown>; logs: string[] }
  | { ok: false; error: { kind: 'error' | 'timeout' | 'cancelled' | 'protocol'; message: string; stack?: string }; logs: string[] }

/** The only thing the engine knows about running user code. Runners never report Type identity. */
export interface Runner {
  run(request: RunnerRequest, options?: { signal?: AbortSignal }): Promise<RunnerResponse>
}

export interface ChildProcessRunnerOptions {
  timeoutMs?: number
  maxOutputBytes?: number
  maxMemoryMb?: number
}

const childScript = fileURLToPath(new URL('./runner-child.ts', import.meta.url))

/**
 * Runs each Code Node in a fresh Node process with the permission model on: no file system, no child
 * processes, no workers, an empty environment. Network stays allowed (docs/poc.md section 27).
 */
export class ChildProcessRunner implements Runner {
  private timeoutMs: number
  private maxOutputBytes: number
  private maxMemoryMb: number

  constructor(options: ChildProcessRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxOutputBytes = options.maxOutputBytes ?? 2 * 1024 * 1024
    this.maxMemoryMb = options.maxMemoryMb ?? 256
  }

  run(request: RunnerRequest, options: { signal?: AbortSignal } = {}): Promise<RunnerResponse> {
    const failure = (kind: 'timeout' | 'cancelled' | 'protocol' | 'error', message: string, logs: string[] = []): RunnerResponse => ({ ok: false, error: { kind, message }, logs })
    if (options.signal?.aborted) return Promise.resolve(failure('cancelled', 'Execution was cancelled'))

    return new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ['--permission', `--allow-fs-read=${childScript}`, `--max-old-space-size=${this.maxMemoryMb}`, childScript],
        // Winsock needs SystemRoot on Windows; nothing else from the parent environment is passed on.
        { stdio: ['pipe', 'pipe', 'pipe'], env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot ?? '' } : {}, windowsHide: true },
      )
      let stdout = ''
      let stderr = ''
      let settled = false
      const settle = (response: RunnerResponse) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        child.kill('SIGKILL')
        resolve(response)
      }
      const onAbort = () => settle(failure('cancelled', 'Execution was cancelled'))
      const timer = setTimeout(() => settle(failure('timeout', `Code did not finish within ${this.timeoutMs} ms`)), this.timeoutMs)
      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.length > this.maxOutputBytes) settle(failure('protocol', `Output is larger than ${this.maxOutputBytes} bytes`))
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        if (stderr.length < 4000) stderr += chunk
      })
      child.on('error', (error) => settle(failure('protocol', `Could not start the runner: ${error.message}`)))
      child.on('close', (code) => {
        const line = stdout.trim().split('\n').filter(Boolean).at(-1)
        try {
          const parsed = JSON.parse(line ?? '') as RunnerResponse
          if (typeof parsed?.ok !== 'boolean') throw new Error('shape')
          settle(parsed)
        } catch {
          const reason = stderr.includes('ERR_ACCESS_DENIED')
            ? 'Access denied by the sandbox'
            : code === 13
              ? 'the code returned a promise that can never settle'
              : stderr.trim().split('\n')[0] || `exit code ${code}`
          settle(failure('protocol', `The runner did not return a valid response (${reason})`))
        }
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(JSON.stringify(request))
    })
  }
}
