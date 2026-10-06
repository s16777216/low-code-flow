import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { ChildProcessRunner } from './runner.ts'

const runner = new ChildProcessRunner({ timeoutMs: 20_000 })
const run = (code: string, inputs: Record<string, unknown> = {}) => runner.run({ code, inputs })

describe('runner protocol', () => {
  it('takes several inputs by port name and returns several outputs by port name', async () => {
    const response = await run('return { sum: ctx.inputs.a + ctx.inputs.b, label: `${ctx.inputs.name}!` }', { a: 2, b: 3, name: 'x' })
    expect(response).toEqual({ ok: true, outputs: { sum: 5, label: 'x!' }, logs: [] })
  })

  it('decodes tagged dates for the code and encodes Date objects on the way out', async () => {
    const response = await run('return { next: new Date(ctx.inputs.at.getTime() + 1000), isDate: ctx.inputs.at instanceof Date }', { at: { $kind: 'date', iso: '2026-10-02T08:30:15.000Z' } })
    expect(response).toMatchObject({ ok: true, outputs: { next: { $kind: 'date', iso: '2026-10-02T08:30:16.000Z' }, isDate: true } })
  })

  it('captures console output as logs without mixing it into the result', async () => {
    const response = await run('console.log("hello", { n: 1 }); ctx.log("second"); return { ok: true }')
    expect(response).toEqual({ ok: true, outputs: { ok: true }, logs: ['hello {"n":1}', 'second'] })
  })

  it('reports thrown errors, bad return values and values that cannot be transported', async () => {
    expect(await run('throw new Error("boom")')).toMatchObject({ ok: false, error: { kind: 'error', message: 'boom' } })
    expect(await run('return 5')).toMatchObject({ ok: false, error: { message: expect.stringContaining('object keyed by output port name') } })
    expect(await run('return { cb: () => 1 }')).toMatchObject({ ok: false, error: { message: expect.stringContaining('closures') } })
    expect(await run('return { n: NaN }')).toMatchObject({ ok: false })
  })

  it('does not trust an envelope that claims a type: it is just data', async () => {
    const response = await run('return { out: { typeId: "OrderId", value: "1" } }')
    expect(response).toMatchObject({ ok: true, outputs: { out: { typeId: 'OrderId', value: '1' } } })
  })

  it('explains code that returns a promise which can never settle', async () => {
    expect(await run('await new Promise(() => {})')).toMatchObject({ ok: false, error: { kind: 'protocol', message: expect.stringContaining('never settle') } })
  })

  it('stops code that runs too long', async () => {
    const response = await new ChildProcessRunner({ timeoutMs: 300 }).run({ code: 'for (;;) {}', inputs: {} })
    expect(response).toMatchObject({ ok: false, error: { kind: 'timeout' } })
  })

  it('stops code when the signal is aborted', async () => {
    const controller = new AbortController()
    const pending = runner.run({ code: 'await new Promise((resolve) => setTimeout(resolve, 60000))', inputs: {} }, { signal: controller.signal })
    setTimeout(() => controller.abort(), 200)
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'cancelled' } })
    expect(await runner.run({ code: 'return {}', inputs: {} }, { signal: controller.signal })).toMatchObject({ ok: false, error: { kind: 'cancelled' } })
  })
})

describe('sandbox', () => {
  it('denies the file system, child processes and workers', async () => {
    const result = await run(`
      const attempt = (fn) => { try { fn(); return 'allowed' } catch (e) { return e.code ?? String(e) } }
      const fs = process.getBuiltinModule('fs'), cp = process.getBuiltinModule('child_process'), wt = process.getBuiltinModule('worker_threads')
      return {
        read: attempt(() => fs.readFileSync(process.execPath)),
        write: attempt(() => fs.writeFileSync('sandbox-escape.txt', 'x')),
        spawn: attempt(() => cp.execSync('echo hi')),
        worker: attempt(() => new wt.Worker('1', { eval: true })),
      }`)
    expect(result).toMatchObject({ ok: true, outputs: { read: 'ERR_ACCESS_DENIED', write: 'ERR_ACCESS_DENIED', spawn: 'ERR_ACCESS_DENIED', worker: 'ERR_ACCESS_DENIED' } })
  })

  it('does not pass the parent environment through', async () => {
    process.env.BACKEND_TEST_SECRET = 'leak'
    const result = await run('return { secret: process.env.BACKEND_TEST_SECRET ?? null }')
    delete process.env.BACKEND_TEST_SECRET
    expect(result).toMatchObject({ ok: true, outputs: { secret: null } })
  })

  it('still allows network access', async () => {
    const server = createServer((_req, res) => res.end('pong'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    const result = await run(`const res = await fetch('http://127.0.0.1:${port}/'); return { body: await res.text() }`)
    server.close()
    expect(result).toMatchObject({ ok: true, outputs: { body: 'pong' } })
  })
})
