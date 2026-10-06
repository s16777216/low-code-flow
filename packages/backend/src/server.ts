import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildApp } from './api.ts'
import { openDatabase } from './db/connection.ts'
import { typedPortsValidator } from './domain/validator.ts'
import { createDefinitionStore } from './store.ts'

const file = process.env.DATABASE_FILE ?? 'data/definitions.db'
mkdirSync(dirname(file), { recursive: true })

const { db } = openDatabase(file)
const app = buildApp(createDefinitionStore(db, typedPortsValidator))
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' })
