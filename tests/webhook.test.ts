/**
 * Caminho crítico do A2 (AT): receptor de webhook NFE.io.
 * Resolve tenant pelo token, registra o payload bruto e a assinatura, e responde
 * 200. Token desconhecido → 404. (Validação HMAC fica para quando o esquema real
 * for confirmado — ver src/integracao/hmac.ts.)
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { pool, publicDb, withTenantDb } from '../src/db.js'
import { provisionTenant, schemaForSlug } from '../src/tenant/provision.js'
import { assinaturaValida, hmacSha256Hex } from '../src/integracao/hmac.js'

const SLUG = 'wh_acme'
const TOKEN = 'tok_webhook_123'

let app: FastifyInstance

beforeAll(async () => {
  await provisionTenant(SLUG)
  await publicDb
    .insertInto('tenants')
    .values({ slug: SLUG, cnpj: '55555555000155', razao_social: 'WH ACME', plano_id: null, status: 'ativo' })
    .onConflict((oc) => oc.column('slug').doNothing())
    .execute()
  await publicDb
    .insertInto('nfeio_webhook_routes')
    .values({ webhook_token: TOKEN, tenant_slug: SLUG, company_id: 'comp123', ambiente: 'production' })
    .onConflict((oc) => oc.column('webhook_token').doNothing())
    .execute()

  app = buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await publicDb.deleteFrom('nfeio_webhook_routes').where('webhook_token', '=', TOKEN).execute()
  await publicDb.deleteFrom('tenants').where('slug', '=', SLUG).execute()
  await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(SLUG)} CASCADE`)
  await publicDb.destroy()
})

describe('POST /api/public/webhooks/nfeio/:token', () => {
  it('token válido → 200 e registra payload + assinatura como recebido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/webhooks/nfeio/${TOKEN}`,
      headers: { 'x-nfeio-signature': 'sig-abc-123' },
      payload: { event: 'invoice.authorized', data: { accessKey: '9'.repeat(44) } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    const ev = await withTenantDb(SLUG, (db) =>
      db
        .selectFrom('nfe_eventos_raw')
        .select(['origem', 'assinatura', 'status_processamento'])
        .where('origem', '=', 'nfeio')
        .executeTakeFirstOrThrow(),
    )
    expect(ev.origem).toBe('nfeio')
    expect(ev.assinatura).toBe('sig-abc-123')
    expect(ev.status_processamento).toBe('recebido')
  })

  it('token desconhecido → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/webhooks/nfeio/token-que-nao-existe',
      payload: { event: 'x' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('verificador HMAC (gancho pluggable)', () => {
  it('aceita a assinatura correta e rejeita a errada (timing-safe)', () => {
    const secret = 'segredo'
    const body = '{"a":1}'
    const sig = hmacSha256Hex(secret, body)
    expect(assinaturaValida(secret, body, sig)).toBe(true)
    expect(assinaturaValida(secret, body, 'deadbeef')).toBe(false)
  })
})
