/**
 * Provisionamento de schema por tenant (CLAUDE.md §5 — schema-per-tenant).
 *
 * Cada tenant tem seu próprio schema `tenant_{slug}` com as tabelas isoladas.
 * O onboarding chama `provisionTenant(slug)`, que cria o schema e aplica as
 * migrations do template (migrations/tenant/*.sql) de forma idempotente,
 * registrando o que já foi aplicado em `<schema>._migrations`.
 *
 * Evolução: novos sprints adicionam tabelas ao tenant criando novos arquivos
 * migrations/tenant/000N_*.sql; `migrateAllTenants()` aplica os pendentes a
 * todos os schemas já existentes (forward-only, CLAUDE.md §4).
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { schemaForSlug } from './schema.js'

// Re-exporta para os consumidores que já importam de provision
export { schemaForSlug } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TENANT_MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'tenant')

/**
 * Cria o schema do tenant (se ainda não existir) e aplica as migrations do
 * template. Tudo em uma transação: ou o tenant fica provisionado por completo,
 * ou nada é criado.
 */
export async function provisionTenant(slug: string): Promise<string> {
  const schema = schemaForSlug(slug)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    await applyTenantMigrations(client, schema)
    await client.query('COMMIT')
    return schema
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Aplica as migrations pendentes a todos os tenants existentes (public.tenants).
 * Usado quando um sprint posterior adiciona novas tabelas ao template.
 */
export async function migrateAllTenants(): Promise<void> {
  const { rows } = await pool.query<{ slug: string }>('SELECT slug FROM public.tenants')
  for (const { slug } of rows) {
    await provisionTenant(slug)
  }
}

// Aplica os arquivos migrations/tenant/*.sql ainda não registrados no schema.
async function applyTenantMigrations(client: PoolClient, schema: string): Promise<void> {
  // Objetos não-qualificados caem no schema do tenant; public resolve extensões/funções
  await client.query(`SET LOCAL search_path = ${schema}, public`)
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations')
  const applied = new Set(rows.map((r) => r.name))

  const files = (await readdir(TENANT_MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(TENANT_MIGRATIONS_DIR, file), 'utf8')
    await client.query(sql)
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
  }
}
