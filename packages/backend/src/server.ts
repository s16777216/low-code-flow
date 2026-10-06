import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildApp } from './api.ts'
import { openDatabase } from './db/connection.ts'
import { typedPortsValidator } from './domain/validator.ts'
import { ExecutionEngine } from './engine/engine.ts'
import { ChildProcessRunner } from './engine/runner.ts'
import { createDefinitionStore } from './store.ts'

const file = process.env.DATABASE_FILE ?? 'data/definitions.db'
mkdirSync(dirname(file), { recursive: true })

const { db } = openDatabase(file)
const store = createDefinitionStore(db, typedPortsValidator)
const engine = new ExecutionEngine({ runner: new ChildProcessRunner() })
store.onProjectDeleted((projectId) => engine.cancelProject(projectId))
const app = buildApp(store, engine)
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' })
