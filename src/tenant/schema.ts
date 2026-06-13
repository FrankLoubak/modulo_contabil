/**
 * Utilitários de nomeação de schema do tenant (sem dependências — evita ciclos).
 */

// Slug seguro para uso como identificador de schema. Defesa contra injeção:
// o nome do schema é interpolado em DDL/SET, então só aceitamos [a-z0-9_].
const SLUG_RE = /^[a-z0-9_]+$/

/** Retorna o nome do schema para um slug, validando o formato. */
export function schemaForSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`slug de tenant inválido: ${JSON.stringify(slug)}`)
  }
  return `tenant_${slug}`
}
