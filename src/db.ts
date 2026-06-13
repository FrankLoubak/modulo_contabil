/**
 * Pool de conexões PostgreSQL compartilhado.
 *
 * O middleware de tenant define `SET search_path = tenant_{slug}` por requisição
 * antes de qualquer query (CLAUDE.md §5). Este módulo expõe apenas o pool;
 * a resolução de tenant é responsabilidade da camada de request.
 */
import { Pool } from 'pg'
import { env } from './env.js'

export const pool = new Pool({ connectionString: env.DATABASE_URL })
