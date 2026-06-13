/**
 * Fábrica do app Fastify.
 *
 * Registra as rotas e os hooks de ciclo de vida do tenant. As rotas reais de
 * /api/tenant/* (auth, onboarding, cadastros) entram nos próximos passos do A1;
 * por ora há /api/health (pública) e /api/tenant/whoami (diagnóstico do
 * isolamento de tenant). Toda rota /api/tenant/* deve usar `requireTenant` como
 * preHandler — e, quando a auth existir, também `requireRole` (CLAUDE.md §4).
 */
import Fastify, { type FastifyServerOptions } from 'fastify'
import { sql } from 'kysely'
import { releaseTenantConnection, requireTenant } from './tenant/middleware.js'

export function buildApp(opts: FastifyServerOptions = {}): ReturnType<typeof Fastify> {
  const app = Fastify({ logger: { level: 'warn' }, ...opts })

  // Devolve a conexão do tenant ao pool ao fim de cada requisição (sucesso ou erro)
  app.addHook('onResponse', async (request) => {
    await releaseTenantConnection(request)
  })
  app.addHook('onError', async (request) => {
    await releaseTenantConnection(request)
  })

  // Rota pública — liveness
  app.get('/api/health', async () => ({ status: 'ok' }))

  // Diagnóstico de isolamento: confirma que o search_path está no schema do tenant
  app.get('/api/tenant/whoami', { preHandler: requireTenant }, async (request) => {
    const result = await sql<{ schema: string }>`SELECT current_schema() AS schema`.execute(request.db!)
    return { tenant: request.tenant!.slug, schema: result.rows[0]?.schema }
  })

  return app
}
