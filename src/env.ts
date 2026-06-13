/**
 * Variáveis de ambiente validadas no boot (CLAUDE.md §4 — sem credenciais
 * hardcoded; falha cedo se algo obrigatório estiver ausente/ inválido).
 */
import process from 'node:process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Carrega .env via loader nativo do Node 22 (sem dependência extra).
try {
  process.loadEnvFile(join(__dirname, '..', '.env'))
} catch {
  // .env ausente — usa variáveis já presentes no ambiente
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Configuração inválida no ambiente:', parsed.error.flatten().fieldErrors)
  throw new Error('Variáveis de ambiente inválidas — verifique o .env')
}

export const env = parsed.data
