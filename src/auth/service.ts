/**
 * Serviço de autenticação — opera sempre no schema do tenant (db já preso).
 *
 * Erros de negócio sobem como `AuthError` com o código HTTP apropriado; as rotas
 * traduzem para a resposta. Mensagens de credencial são genéricas de propósito
 * (não revelam se o e-mail existe).
 */
import type { Kysely } from 'kysely'
import type { Database } from '../types.js'
import { hashPassword, verifyPassword } from './password.js'
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiry,
  signAccessToken,
} from './tokens.js'

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; role: string }
}

interface CreateUserInput {
  email: string
  password: string
  role?: string
}

/** Cria um usuário no tenant atual (usado no onboarding e em testes). */
export async function createUser(
  db: Kysely<Database>,
  input: CreateUserInput,
): Promise<{ id: string; email: string; role: string }> {
  const password_hash = await hashPassword(input.password)
  return db
    .insertInto('users')
    .values({
      email: input.email.toLowerCase(),
      password_hash,
      ...(input.role !== undefined ? { role: input.role } : {}),
    })
    .returning(['id', 'email', 'role'])
    .executeTakeFirstOrThrow()
}

export async function login(
  db: Kysely<Database>,
  tenantSlug: string,
  email: string,
  password: string,
  ip?: string,
): Promise<AuthResult> {
  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'role', 'status', 'password_hash'])
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst()

  // Verifica a senha mesmo sem usuário evitaria timing oracle; aqui priorizamos
  // simplicidade — credencial inválida é resposta genérica em ambos os casos.
  if (user === undefined) throw new AuthError(401, 'credenciais inválidas')

  const ok = await verifyPassword(user.password_hash, password)
  if (!ok) throw new AuthError(401, 'credenciais inválidas')
  if (user.status !== 'ativo') throw new AuthError(403, 'usuário inativo')

  return issueTokens(db, tenantSlug, user.id, user.email, user.role, ip)
}

export async function refresh(
  db: Kysely<Database>,
  tenantSlug: string,
  token: string,
  ip?: string,
): Promise<AuthResult> {
  const session = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'sessions.id as session_id',
      'sessions.expires_at as expires_at',
      'users.id as user_id',
      'users.email as email',
      'users.role as role',
      'users.status as status',
    ])
    .where('sessions.refresh_token_hash', '=', hashRefreshToken(token))
    .executeTakeFirst()

  if (session === undefined) throw new AuthError(401, 'refresh token inválido')

  if (new Date(session.expires_at) < new Date()) {
    await db.deleteFrom('sessions').where('id', '=', session.session_id).execute()
    throw new AuthError(401, 'refresh token expirado')
  }
  if (session.status !== 'ativo') throw new AuthError(403, 'usuário inativo')

  // Rotação: invalida a sessão usada e emite uma nova
  await db.deleteFrom('sessions').where('id', '=', session.session_id).execute()
  return issueTokens(db, tenantSlug, session.user_id, session.email, session.role, ip)
}

export async function logout(db: Kysely<Database>, token: string): Promise<void> {
  await db
    .deleteFrom('sessions')
    .where('refresh_token_hash', '=', hashRefreshToken(token))
    .execute()
}

// Gera o par access+refresh e persiste o hash do refresh em sessions
async function issueTokens(
  db: Kysely<Database>,
  tenantSlug: string,
  userId: string,
  email: string,
  role: string,
  ip?: string,
): Promise<AuthResult> {
  const refreshToken = generateRefreshToken()
  await db
    .insertInto('sessions')
    .values({
      user_id: userId,
      refresh_token_hash: hashRefreshToken(refreshToken),
      expires_at: refreshExpiry(),
      ip: ip ?? null,
    })
    .execute()

  const accessToken = signAccessToken({ sub: userId, tenant: tenantSlug, role })
  return { accessToken, refreshToken, user: { id: userId, email, role } }
}
