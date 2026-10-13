import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['type', 'function'] }).notNull(),
    name: text('name').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    definition: text('definition', { mode: 'json' }).$type<unknown>().notNull(),
    revision: integer('revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('assets_project_kind_idx').on(table.projectId, table.kind)],
)

export const endpoints = sqliteTable('endpoints', {
  functionId: text('function_id').primaryKey().references(() => assets.id),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('endpoints_project_path_idx').on(table.projectId, table.path)])
