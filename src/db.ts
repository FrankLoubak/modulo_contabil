/**
 * Conexões com o PostgreSQL.
 *
 * - `pool`     : pool pg cru, usado no provisionamento e no pinning por tenant.
 * - `publicDb` : Kysely tipado para o schema público (tenants, planos, audit_log).
 *
 * As queries do tenant usam uma instância Kysely criada por requisição pelo
 * middleware, ligada a uma conexão com `search_path` já no schema do tenant
 * (CLAUDE.md §5). Este módulo expõe apenas o acesso ao schema público.
 */
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { env } from './env.js'
import type { Database } from './types.js'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

export const publicDb = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
})
