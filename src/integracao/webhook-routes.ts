/**
 * Receptor de webhook da NFE.io (CLAUDE.md §6).
 *
 * Rota pública: a NFE.io não envia nosso header de tenant, então o tenant é
 * resolvido pelo token opaco na URL (public.nfeio_webhook_routes).
 *
 * Comportamento seguro até o payload/assinatura serem confirmados:
 *   - resolve o tenant (404 se token desconhecido)
 *   - captura a assinatura recebida (apenas registra — validação HMAC desligada
 *     até confirmarmos o esquema; ver src/integracao/hmac.ts)
 *   - grava o payload bruto em nfe_eventos_raw (status 'recebido') para replay
 *   - responde 200 rápido (a NFE.io exige 200; processamento vem depois)
 */
import type { FastifyInstance } from 'fastify'
import { publicDb, withTenantDb } from '../db.js'
import { recordRawWebhook } from './ingest.js'

// Header provável da assinatura (CLAUDE.md §6) — capturado para análise, não exigido
const SIGNATURE_HEADER = 'x-nfeio-signature'

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string } }>(
    '/api/public/webhooks/nfeio/:token',
    async (request, reply) => {
      const route = await publicDb
        .selectFrom('nfeio_webhook_routes')
        .select(['tenant_slug'])
        .where('webhook_token', '=', request.params.token)
        .executeTakeFirst()

      if (route === undefined) {
        return reply.code(404).send({ error: 'webhook desconhecido' })
      }

      const rawSig = request.headers[SIGNATURE_HEADER]
      const assinatura = typeof rawSig === 'string' ? rawSig : undefined

      await withTenantDb(route.tenant_slug, (db) =>
        recordRawWebhook(db, request.body, assinatura),
      )

      // ACK imediato — a normalização (normalizeFromNfeio) entra quando o
      // payload real for confirmado; o evento já está salvo para replay.
      return reply.code(200).send({ received: true })
    },
  )
}
