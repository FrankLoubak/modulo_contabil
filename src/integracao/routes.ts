/**
 * Rotas de integração do tenant. Toda rota /api/tenant/* passa por
 * requireTenant + requireAuth + requireRole (CLAUDE.md §4).
 *
 * REST push: ERPs/PDV enviam a nota no nosso contrato JSON. Validação rigorosa
 * (Zod no normalizador) → 400 em payload inválido; persistência idempotente.
 */
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { requireTenant } from '../tenant/middleware.js'
import { ingestEvento } from './ingest.js'
import { normalizeFromRest } from './normalize/from-rest.js'

// Papéis que podem lançar notas (viewer fica de fora)
const PODE_LANCAR = ['admin', 'contador', 'operador']

export async function integracaoRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/tenant/integracao/notas',
    { preHandler: [requireTenant, requireAuth, requireRole(PODE_LANCAR)] },
    async (request, reply) => {
      let evento
      try {
        evento = normalizeFromRest(request.body)
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'nota inválida', detalhes: err.flatten() })
        }
        throw err
      }
      const result = await ingestEvento(request.db!, 'api', request.body, evento)
      return reply.code(201).send(result)
    },
  )
}
