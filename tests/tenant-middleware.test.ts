/**
 * Caminho crítico do A1 (AT): isolamento de tenant via middleware.
 * Cada requisição deve operar SOMENTE no schema do seu tenant, e tenants
 * inexistentes/inválidos/inativos devem ser rejeitados antes de qualquer query.
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { pool, publicDb } from '../src/db.js'
import { provisionTenant, schemaForSlug } from '../src/tenant/provision.js'

const TENANTS = [
  { slug: 'mw_a', cnpj: '11111111000111', razao: 'Empresa A', status: 'ativo' },
  { slug: 'mw_b', cnpj: '22222222000122', razao: 'Empresa B', status: 'ativo' },
  { slug: 'mw_off', cnpj: '33333333000133', razao: 'Empresa Suspensa', status: 'suspenso' },
]

let app: FastifyInstance

beforeAll(async () => {
  for (const t of TENANTS) {
    await provisionTenant(t.slug)
    await publicDb
      .insertInto('tenants')
      .values({ slug: t.slug, cnpj: t.cnpj, razao_social: t.razao, plano_id: null, status: t.status })
      .onConflict((oc) => oc.column('slug').doUpdateSet({ status: t.status }))
      .execute()
  }
  app = buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  for (const t of TENANTS) {
    await publicDb.deleteFrom('tenants').where('slug', '=', t.slug).execute()
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(t.slug)} CASCADE`)
  }
  await publicDb.destroy()
})

describe('requireTenant — isolamento e resolução', () => {
  it('resolve o tenant pelo header e opera no schema correto', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'mw_a' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ tenant: 'mw_a', schema: 'tenant_mw_a' })
  })

  it('isola tenants distintos na mesma instância do app', async () => {
    const a = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'mw_a' } })
    const b = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'mw_b' } })
    expect(a.json().schema).toBe('tenant_mw_a')
    expect(b.json().schema).toBe('tenant_mw_b')
    expect(a.json().schema).not.toBe(b.json().schema)
  })

  it('400 quando o tenant não é informado', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/whoami' })
    expect(res.statusCode).toBe(400)
  })

  it('400 para slug inválido (defesa contra injeção)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'bad; drop' } })
    expect(res.statusCode).toBe(400)
  })

  it('404 para tenant inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'nao_existe' } })
    expect(res.statusCode).toBe(404)
  })

  it('403 para tenant não-ativo', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tenant/whoami', headers: { 'x-tenant-id': 'mw_off' } })
    expect(res.statusCode).toBe(403)
  })
})

describe('rota pública', () => {
  it('health não exige tenant', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
