import { defineConfig } from 'vitest/config'

// Many tests start sandboxed Node processes; running files in parallel makes each start slow.
export default defineConfig({ test: { environment: 'node', testTimeout: 30_000, hookTimeout: 30_000 } })
