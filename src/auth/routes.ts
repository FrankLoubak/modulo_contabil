/**
 * Rotas de autenticação do tenant. Todas passam por `requireTenant` (operam no
 * schema do tenant); login/refresh são públicas dentro do tenant, logout exige
 * sessão válida. Input validado com Zod (CLAUDE.md §4).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireTenant } from '../tenant/middleware.js'
import { requireAuth } from './middleware.js'
import { AuthError, login, logout, refresh } from './service.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tenant/auth/login', { preHandler: requireTenant }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'dados de login inválidos' })
    try {
      return await login(
        request.db!,
        request.tenant!.slug,
        parsed.data.email,
        parsed.data.password,
        request.ip,
      )
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.status).send({ error: err.message })
      throw err
    }
  })

  app.post('/api/tenant/auth/refresh', { preHandler: requireTenant }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'refresh token ausente' })
    try {
      return await refresh(request.db!, request.tenant!.slug, parsed.data.refreshToken, request.ip)
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.status).send({ error: err.message })
      throw err
    }
  })

  app.post(
    '/api/tenant/auth/logout',
    { preHandler: [requireTenant, requireAuth] },
    async (request, reply) => {
      const parsed = refreshSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'refresh token ausente' })
      await logout(request.db!, parsed.data.refreshToken)
      return { ok: true }
    },
  )
}
