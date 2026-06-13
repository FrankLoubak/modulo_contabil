/**
 * preHandlers de autenticação e autorização (CLAUDE.md §4).
 *
 * `requireAuth` valida o access token e confirma que ele pertence ao tenant da
 * requisição (impede usar token de um tenant em outro). Deve rodar DEPOIS de
 * `requireTenant`. `requireRole` checa o papel — deve rodar depois de requireAuth.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAccessToken } from './tokens.js'

export interface AuthUser {
  id: string
  role: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

const BEARER = 'Bearer '

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization
  if (header === undefined || !header.startsWith(BEARER)) {
    return reply.code(401).send({ error: 'token de acesso ausente' })
  }
  const token = header.slice(BEARER.length).trim()

  let claims
  try {
    claims = verifyAccessToken(token)
  } catch {
    return reply.code(401).send({ error: 'token inválido ou expirado' })
  }

  // O token precisa pertencer ao tenant resolvido para esta requisição (Lei 4)
  if (request.tenant === undefined || claims.tenant !== request.tenant.slug) {
    return reply.code(401).send({ error: 'token não pertence a este tenant' })
  }

  request.user = { id: claims.sub, role: claims.role }
}

/** Exige que o usuário autenticado tenha um dos papéis informados. */
export function requireRole(allowed: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user
    if (user === undefined) {
      return reply.code(401).send({ error: 'não autenticado' })
    }
    if (!allowed.includes(user.role)) {
      return reply.code(403).send({ error: `acesso negado para o papel '${user.role}'` })
    }
  }
}
