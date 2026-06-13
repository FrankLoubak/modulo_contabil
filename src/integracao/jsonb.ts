/**
 * Helper para gravar objetos em colunas JSONB via Kysely (node-pg não serializa
 * objetos sozinho — precisa de string + cast).
 */
import { sql } from 'kysely'

export function toJsonb(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`
}
