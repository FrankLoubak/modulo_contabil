/**
 * Hash de senha com argon2id (CLAUDE.md §4 — nunca senha em claro).
 */
import argon2 from 'argon2'

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}
