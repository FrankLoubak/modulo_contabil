/**
 * Conexões com o PostgreSQL.
 *
 * - `pool`         : pool pg cru, usado no provisionamento e no pinning por tenant.
 * - `publicDb`     : Kysely tipado para o schema público (tenants, planos, audit_log).
 * - `pinnedPool`   : adapta um PoolClient já reservado para o Kysely (sem devolvê-lo
 *                    ao pool a cada query — release controlado externamente).
 * - `withTenantDb` : roda uma função com um Kysely preso ao schema de um tenant,
 *                    fora do ciclo HTTP (onboarding, jobs, testes).
 *
 * Nas requisições HTTP, o middleware cria o Kysely por request (CLAUDE.md §5).
 */
import { Kysely, PostgresDialect } from 'kysely'
import { Pool, type PoolClient } from 'pg'
import { env } from './env.js'
import { schemaForSlug } from './tenant/schema.js'
import type { Database } from './types.js'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

export const publicDb = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
})

/**
 * Envolve um PoolClient já reservado para que o Kysely o use sem devolvê-lo ao
 * pool a cada query — o release real é controlado por quem reservou a conexão.
 */
export function pinnedPool(client: PoolClient) {
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'release') return () => {} // no-op — release controlado externamente
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return {
    connect: async () => proxy,
    end: async () => {},
  }
}

/**
 * Executa `fn` com um Kysely preso ao schema do tenant. Reserva uma conexão,
 * fixa o search_path, e a devolve ao pool ao final (resetando o search_path).
 */
export async function withTenantDb<T>(
  slug: string,
  fn: (db: Kysely<Database>) => Promise<T>,
): Promise<T> {
  const schema = schemaForSlug(slug)
  const client = await pool.connect()
  try {
    await client.query(`SET search_path = ${schema}`)
    const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: pinnedPool(client) }) })
    return await fn(db)
  } finally {
    try {
      await client.query('SET search_path = public')
      client.release()
    } catch {
      client.release(true)
    }
  }
}
