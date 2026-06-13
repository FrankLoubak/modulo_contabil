/**
 * Caminhos críticos do A1 (AT): Auth JWT — login, refresh, expiração,
 * isolamento de token entre tenants e RBAC.
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { env } from '../src/env.js'
import { pool, publicDb, withTenantDb } from '../src/db.js'
import { requireRole } from '../src/auth/middleware.js'
import { createUser } from '../src/auth/service.js'
import { provisionTenant, schemaForSlug } from '../src/tenant/provision.js'

const SLUGS = ['auth_t', 'auth_t2']
const EMAIL = 'user@test.com'
const PASSWORD = 'senha-super-secreta'

let app: FastifyInstance

beforeAll(async () => {
  let i = 0
  for (const slug of SLUGS) {
    i++
    await provisionTenant(slug)
    await publicDb
      .insertInto('tenants')
      .values({
        slug,
        cnpj: `9999999900001${i}`,
        razao_social: `Tenant ${slug}`,
        plano_id: null,
        status: 'ativo',
      })
      .onConflict((oc) => oc.column('slug').doNothing())
      .execute()
  }
  // Usuário só no primeiro tenant
  await withTenantDb('auth_t', (db) =>
    createUser(db, { email: EMAIL, password: PASSWORD, role: 'contador' }),
  )

  app = buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  for (const slug of SLUGS) {
    await publicDb.deleteFrom('tenants').where('slug', '=', slug).execute()
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(slug)} CASCADE`)
  }
  await publicDb.destroy()
})

function loginReq(body: object, tenant = 'auth_t') {
  return app.inject({
    method: 'POST',
    url: '/api/tenant/auth/login',
    headers: { 'x-tenant-id': tenant },
    payload: body,
  })
}

describe('login', () => {
  it('autentica com credenciais válidas e retorna tokens', async () => {
    const res = await loginReq({ email: EMAIL, password: PASSWORD })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toBeTypeOf('string')
    expect(body.refreshToken).toBeTypeOf('string')
    expect(body.user).toMatchObject({ email: EMAIL, role: 'contador' })
  })

  it('rejeita senha incorreta com 401 genérico', async () => {
    const res = await loginReq({ email: EMAIL, password: 'errada' })
    expect(res.statusCode).toBe(401)
  })

  it('rejeita e-mail inexistente com 401', async () => {
    const res = await loginReq({ email: 'naoexiste@test.com', password: PASSWORD })
    expect(res.statusCode).toBe(401)
  })

  it('valida o corpo (400 sem senha)', async () => {
    const res = await loginReq({ email: EMAIL })
    expect(res.statusCode).toBe(400)
  })
})

describe('rota protegida (/me)', () => {
  async function token(): Promise<string> {
    const res = await loginReq({ email: EMAIL, password: PASSWORD })
    return res.json().accessToken
  }

  it('acessa com access token válido', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t', authorization: `Bearer ${await token()}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ role: 'contador', tenant: 'auth_t' })
  })

  it('401 sem token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('401 com token malformado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t', authorization: 'Bearer abc.def.ghi' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('401 com token expirado', async () => {
    const expired = jwt.sign({ sub: 'x', tenant: 'auth_t', role: 'contador' }, env.JWT_SECRET, {
      expiresIn: -10,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t', authorization: `Bearer ${expired}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('401 ao usar token de um tenant em outro (Lei 4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t2', authorization: `Bearer ${await token()}` },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('refresh e logout', () => {
  it('refresh emite novo access token utilizável', async () => {
    const { refreshToken } = (await loginReq({ email: EMAIL, password: PASSWORD })).json()
    const res = await app.inject({
      method: 'POST',
      url: '/api/tenant/auth/refresh',
      headers: { 'x-tenant-id': 'auth_t' },
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(200)
    const newAccess = res.json().accessToken
    const me = await app.inject({
      method: 'GET',
      url: '/api/tenant/me',
      headers: { 'x-tenant-id': 'auth_t', authorization: `Bearer ${newAccess}` },
    })
    expect(me.statusCode).toBe(200)
  })

  it('logout invalida o refresh token', async () => {
    const login = await loginReq({ email: EMAIL, password: PASSWORD })
    const { accessToken, refreshToken } = login.json()
    const out = await app.inject({
      method: 'POST',
      url: '/api/tenant/auth/logout',
      headers: { 'x-tenant-id': 'auth_t', authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    })
    expect(out.statusCode).toBe(200)
    // refresh do token revogado deve falhar
    const res = await app.inject({
      method: 'POST',
      url: '/api/tenant/auth/refresh',
      headers: { 'x-tenant-id': 'auth_t' },
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('requireRole', () => {
  function fakeReply() {
    return {
      statusCode: 0,
      body: undefined as unknown,
      code(c: number) {
        this.statusCode = c
        return this
      },
      send(b: unknown) {
        this.body = b
        return this
      },
    }
  }

  it('403 quando o papel não está na lista permitida', async () => {
    const reply = fakeReply()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireRole(['admin'])({ user: { id: 'u', role: 'viewer' } } as any, reply as any)
    expect(reply.statusCode).toBe(403)
  })

  it('permite quando o papel está na lista', async () => {
    const reply = fakeReply()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireRole(['admin', 'contador'])({ user: { id: 'u', role: 'contador' } } as any, reply as any)
    expect(reply.statusCode).toBe(0) // não respondeu — segue o fluxo
  })
})
