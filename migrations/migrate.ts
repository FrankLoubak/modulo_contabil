/**
 * Runner de migrations — forward-only.
 *
 * Lê todos os arquivos `migrations/*.sql` em ordem alfabética (prefixo numérico),
 * aplica os que ainda não constam em `public._migrations` e registra cada um.
 * Cada arquivo roda dentro de uma transação: ou aplica inteiro, ou nada.
 *
 * Uso: `npm run migrate`
 *
 * Princípio (CLAUDE.md §4): migrations forward-only — nunca DROP destrutivo.
 * Não há rollback automático; correções são feitas com uma nova migration.
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { Pool } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carrega .env via loader nativo do Node 22 (sem dependência extra).
// Ignora se o arquivo não existir (ex.: variáveis já injetadas no ambiente).
try {
  process.loadEnvFile(join(__dirname, '..', '.env'))
} catch {
  // .env ausente — segue com as variáveis já presentes no ambiente
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  // Validação no boot — sem credenciais hardcoded (CLAUDE.md §4)
  throw new Error('DATABASE_URL não definida. Configure o .env antes de migrar.')
}

const pool = new Pool({ connectionString: databaseUrl })

// Garante a tabela de controle antes de qualquer migration
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

// Retorna os nomes de migrations já aplicadas
async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM public._migrations')
  return new Set(rows.map((r) => r.name))
}

async function run(): Promise<void> {
  await ensureMigrationsTable()
  const applied = await appliedMigrations()

  const files = (await readdir(__dirname))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue

    const sql = await readFile(join(__dirname, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO public._migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`✓ aplicada: ${file}`)
      count++
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`✗ falhou: ${file}`)
      throw err
    } finally {
      client.release()
    }
  }

  if (count === 0) console.log('Nenhuma migration pendente — banco já atualizado.')
  else console.log(`${count} migration(s) aplicada(s).`)

  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
