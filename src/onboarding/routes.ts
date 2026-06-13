/**
 * Rota pública de onboarding (CLAUDE.md §4 — /api/public/* com validação
 * rigorosa via Zod). Não passa por requireTenant: é justamente o que cria o
 * tenant. Em caso de sucesso, retorna o tenant criado e os tokens do admin.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { isValidCnpj } from '../shared/cnpj.js'
import { OnboardingError, onboardTenant } from './service.js'

const onboardingSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'slug deve conter apenas [a-z0-9_]'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos').refine(isValidCnpj, 'CNPJ inválido'),
  razaoSocial: z.string().min(1).max(200),
  nomeFantasia: z.string().max(200).optional(),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'senha deve ter ao menos 8 caracteres'),
  }),
})

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/public/onboarding', async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'dados inválidos', detalhes: parsed.error.flatten().fieldErrors })
    }
    try {
      const { nomeFantasia, ...rest } = parsed.data
      const result = await onboardTenant({
        ...rest,
        ip: request.ip,
        ...(nomeFantasia !== undefined ? { nomeFantasia } : {}),
      })
      return reply.code(201).send(result)
    } catch (err) {
      if (err instanceof OnboardingError) return reply.code(err.status).send({ error: err.message })
      throw err
    }
  })
}
