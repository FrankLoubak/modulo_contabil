/**
 * Middleware de resolução e isolamento de tenant (CLAUDE.md §5, Lei 4).
 *
 * Fluxo por requisição em rotas /api/tenant/*:
 *   1. Resolve o slug do tenant (header X-Tenant-ID ou subdomínio).
 *   2. Valida o slug e confirma o tenant em public.tenants (e status ativo).
 *   3. Reserva UMA conexão do pool e aplica `SET search_path = tenant_{slug}`.
 *   4. Anexa a request um Kysely tipado preso a essa conexão — toda query do
 *      handler opera, garantidamente, no schema do tenant correto.
 *
 * A conexão é devolvida ao pool em `releaseTenantConnection` (hook onResponse/
 * onError), resetando o search_path antes para não vazar entre requisições.
 */
import { Kysely, PostgresDialect } from 'kysely'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { pool, publicDb } from '../db.js'
import type { Database } from '../types.js'
import { schemaForSlug } from './provision.js'

export interface TenantContext {
  id: string
  slug: string
  schema: string
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantContext
    db?: Kysely<Database>
    // Conexão pg reservada para a requisição; devolvida no cleanup.
    pgClient?: PoolClient
  }
}

// Hosts que não representam tenant ao aparecerem como primeiro rótulo do domínio
const NON_TENANT_HOSTS = new Set(['www', 'api', 'localhost'])

/** Extrai o slug do tenant do header X-Tenant-ID ou do subdomínio. */
export function resolveTenantSlug(request: FastifyRequest): string | null {
  const header = request.headers['x-tenant-id']
  if (typeof header === 'string' && header.trim() !== '') {
    return header.trim().toLowerCase()
  }

  const host = (request.headers.host ?? '').split(':')[0] ?? ''
  // Só tratamos como subdomínio se houver pelo menos um ponto (sub.dominio.tld)
  if (host.includes('.')) {
    const sub = host.split('.')[0] ?? ''
    if (sub !== '' && !NON_TENANT_HOSTS.has(sub)) return sub.toLowerCase()
  }
  return null
}

// Envolve um PoolClient já reservado para que o Kysely o use sem devolvê-lo ao
// pool a cada query: o release real acontece no cleanup da requisição.
function pinnedPool(client: PoolClient) {
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'release') return () => {} // no-op — release controlado fora do Kysely
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
 * preHandler para rotas /api/tenant/*. Resolve o tenant e prende a conexão.
 * Responde com erro (sem prosseguir) se o tenant for inválido/inexistente/inativo.
 */
export async function requireTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const slug = resolveTenantSlug(request)
  if (slug === null) {
    return reply.code(400).send({ error: 'tenant não informado (use X-Tenant-ID ou subdomínio)' })
  }

  let schema: string
  try {
    schema = schemaForSlug(slug)
  } catch {
    return reply.code(400).send({ error: 'slug de tenant inválido' })
  }

  const tenant = await publicDb
    .selectFrom('tenants')
    .select(['id', 'slug', 'status'])
    .where('slug', '=', slug)
    .executeTakeFirst()

  if (tenant === undefined) {
    return reply.code(404).send({ error: 'tenant não encontrado' })
  }
  if (tenant.status !== 'ativo') {
    return reply.code(403).send({ error: `tenant ${tenant.status}` })
  }

  // Reserva a conexão e fixa o schema do tenant antes de qualquer query do handler
  const client = await pool.connect()
  await client.query(`SET search_path = ${schema}`)
  request.pgClient = client
  request.tenant = { id: tenant.id, slug, schema }
  request.db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: pinnedPool(client) }) })
}

/** Devolve a conexão do tenant ao pool, resetando o search_path. */
export async function releaseTenantConnection(request: FastifyRequest): Promise<void> {
  const client = request.pgClient
  if (client === undefined) return
  // delete (não `= undefined`) por causa de exactOptionalPropertyTypes
  delete request.pgClient
  delete request.db
  try {
    await client.query('SET search_path = public')
    client.release()
  } catch {
    // Conexão em estado duvidoso — descarta em vez de devolver ao pool
    client.release(true)
  }
}
