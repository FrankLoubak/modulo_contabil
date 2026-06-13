/**
 * Caminho crítico do A2 (AT): REST push end-to-end.
 * Onboard → token admin → POST nota (201) → idempotência → RBAC (viewer 403).
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { pool, publicDb, withTenantDb } from '../src/db.js'
import { createUser } from '../src/auth/service.js'
import { schemaForSlug } from '../src/tenant/provision.js'

const SLUG = 'rest_acme'
const CNPJ = '19131243000197'
const ADMIN = { email: 'admin@acme.com', password: 'senha-do-admin' }
const CHAVE = '3'.repeat(44)

let app: FastifyInstance
let adminToken: string
let viewerToken: string

function notaValida(over: Record<string, unknown> = {}) {
  return {
    tipo: 'NFe',
    chaveAcesso: CHAVE,
    emitente: { cnpj: CNPJ, razaoSocial: 'ACME' },
    itens: [{ descricao: 'Produto', quantidade: 1, valorUnitario: 10, valorTotal: 10 }],
    totais: { valorTotal: 10, ibs: 0.01, cbs: 0.09 },
    ...over,
  }
}

function postNota(body: object, token: string) {
  return app.inject({
    method: 'POST',
    url: '/api/tenant/integracao/notas',
    headers: { 'x-tenant-id': SLUG, authorization: `Bearer ${token}` },
    payload: body,
  })
}

beforeAll(async () => {
  app = buildApp({ logger: false })
  await app.ready()

  // Onboard cria tenant + admin e devolve o token
  const onb = await app.inject({
    method: 'POST',
    url: '/api/public/onboarding',
    payload: { slug: SLUG, cnpj: CNPJ, razaoSocial: 'ACME LTDA', admin: ADMIN },
  })
  adminToken = onb.json().accessToken

  // Cria um viewer e faz login para testar o RBAC
  await withTenantDb(SLUG, (db) =>
    createUser(db, { email: 'viewer@acme.com', password: 'senha-viewer', role: 'viewer' }),
  )
  const login = await app.inject({
    method: 'POST',
    url: '/api/tenant/auth/login',
    headers: { 'x-tenant-id': SLUG },
    payload: { email: 'viewer@acme.com', password: 'senha-viewer' },
  })
  viewerToken = login.json().accessToken
})

afterAll(async () => {
  await app.close()
  await publicDb.deleteFrom('tenants').where('slug', '=', SLUG).execute()
  await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(SLUG)} CASCADE`)
  await publicDb.destroy()
})

describe('POST /api/tenant/integracao/notas', () => {
  it('admin lança nota válida → 201 e persiste', async () => {
    const res = await postNota(notaValida(), adminToken)
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ chaveAcesso: CHAVE, status: 'autorizada' })
  })

  it('reenvio da mesma chave é idempotente (não duplica)', async () => {
    await postNota(notaValida({ totais: { valorTotal: 10 }, status: 'cancelada' }), adminToken)
    const count = await withTenantDb(SLUG, (db) =>
      db
        .selectFrom('notas_fiscais')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('chave_acesso', '=', CHAVE)
        .executeTakeFirstOrThrow(),
    )
    expect(Number(count.n)).toBe(1)
  })

  it('payload inválido → 400', async () => {
    const res = await postNota(notaValida({ chaveAcesso: '123' }), adminToken)
    expect(res.statusCode).toBe(400)
  })

  it('sem token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tenant/integracao/notas',
      headers: { 'x-tenant-id': SLUG },
      payload: notaValida(),
    })
    expect(res.statusCode).toBe(401)
  })

  it('viewer não pode lançar → 403 (RBAC)', async () => {
    const res = await postNota(notaValida(), viewerToken)
    expect(res.statusCode).toBe(403)
  })
})
