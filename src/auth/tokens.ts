/**
 * Tokens de autenticação.
 *
 * - Access token: JWT curto (15min) assinado com JWT_SECRET. Carrega sub, tenant
 *   e role — verificado em todo request autenticado, sem ida ao banco.
 * - Refresh token: string opaca aleatória (30d). NÃO é JWT — é revogável: só o
 *   seu hash SHA-256 fica em `sessions`, permitindo invalidar no logout.
 */
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../env.js'

export const ACCESS_TTL_SECONDS = 15 * 60 // 15 minutos
export const REFRESH_TTL_DAYS = 30

export interface AccessClaims {
  sub: string // user id
  tenant: string // slug do tenant
  role: string
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS })
}

/** Verifica e extrai os claims; lança se inválido ou expirado. */
export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET)
  if (typeof decoded === 'string') throw new Error('token inválido')
  const { sub, tenant, role } = decoded as Record<string, unknown>
  if (typeof sub !== 'string' || typeof tenant !== 'string' || typeof role !== 'string') {
    throw new Error('claims do token inválidos')
  }
  return { sub, tenant, role }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)
}
