/**
 * Caminho crítico do A1 (AT): onboarding por CNPJ.
 * Cria o tenant ponta a ponta (schema + empresa + admin), valida CNPJ e
 * unicidade, e o tenant recém-criado já deve responder no login/me.
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { pool, publicDb } from '../src/db.js'
import { schemaForSlug } from '../src/tenant/provision.js'
import { isValidCnpj } from '../src/shared/cnpj.js'

// CNPJ válido (dígitos verificadores corretos) usado nos testes
const CNPJ = '19131243000197' // CNPJ público de exemplo, DV válido
const SLUG = 'onb_acme'
const ADMIN = { email: 'admin@acme.com', password: 'senha-do-admin' }

let app: FastifyInstance

beforeAll(async () => {
  app = buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  for (const slug of [SLUG]) {
    await publicDb.deleteFrom('tenants').where('slug', '=', slug).execute()
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(slug)} CASCADE`)
  }
  await publicDb.destroy()
})

function onboard(body: object) {
  return app.inject({ method: 'POST', url: '/api/public/onboarding', payload: body })
}

describe('validador de CNPJ', () => {
  it('aceita CNPJ com DV correto e rejeita inválidos', () => {
    expect(isValidCnpj(CNPJ)).toBe(true)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('19131243000198')).toBe(false) // DV errado
  })
})

describe('POST /api/public/onboarding', () => {
  it('cria o tenant e retorna tokens do admin (201)', async () => {
    const res = await onboard({
      slug: SLUG,
      cnpj: CNPJ,
      razaoSocial: 'ACME Comércio LTDA',
      admin: ADMIN,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.tenant).toMatchObject({ slug: SLUG, cnpj: CNPJ })
    expect(body.accessToken).toBeTypeOf('string')
    expect(body.user).toMatchObject({ email: ADMIN.email, role: 'admin' })
  })

  it('cria o índice de busca por refresh token no schema do tenant (AR 3.1)', async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'idx_sessions_refresh_hash'`,
      [schemaForSlug(SLUG)],
    )
    expect(rows.length).toBe(1)
  })

  it('o tenant criado já responde no login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tenant/auth/login',
      headers: { 'x-tenant-id': SLUG },
      payload: ADMIN,
    })
    expect(res.statusCode).toBe(200)
  })

  it('rejeita slug/CNPJ duplicado (409)', async () => {
    const res = await onboard({
      slug: SLUG,
      cnpj: CNPJ,
      razaoSocial: 'Outra Empresa',
      admin: ADMIN,
    })
    expect(res.statusCode).toBe(409)
  })

  it('rejeita CNPJ inválido (400)', async () => {
    const res = await onboard({
      slug: 'onb_x',
      cnpj: '19131243000198',
      razaoSocial: 'Empresa X',
      admin: ADMIN,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejeita slug com formato inválido (400)', async () => {
    const res = await onboard({
      slug: 'Onb-Maiusc',
      cnpj: CNPJ,
      razaoSocial: 'Empresa Y',
      admin: ADMIN,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejeita senha curta (400)', async () => {
    const res = await onboard({
      slug: 'onb_z',
      cnpj: CNPJ,
      razaoSocial: 'Empresa Z',
      admin: { email: 'z@z.com', password: '123' },
    })
    expect(res.statusCode).toBe(400)
  })
})
