/**
 * Onboarding de um novo tenant (CNPJ → ambiente pronto).
 *
 * Fluxo (CLAUDE.md §5):
 *   1. Garante slug/CNPJ inéditos em public.tenants.
 *   2. Provisiona o schema tenant_{slug} com as tabelas base.
 *   3. No schema do tenant: grava `empresa`, cria o usuário admin e já emite
 *      tokens (auto-login).
 *   4. Registra o tenant em public.tenants (último passo — torna-o resolvível).
 *
 * Consulta de CNPJ na Receita Federal via NFE.io: fora do escopo do A1
 * (depende de NFEIO_API_KEY — Sprint A2). Aqui validamos apenas os dígitos.
 */
import { publicDb, withTenantDb } from '../db.js'
import { provisionTenant } from '../tenant/provision.js'
import { createUser, login, type AuthResult } from '../auth/service.js'

export class OnboardingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'OnboardingError'
  }
}

export interface OnboardingInput {
  slug: string
  cnpj: string
  razaoSocial: string
  nomeFantasia?: string
  admin: { email: string; password: string }
  ip?: string
}

export interface OnboardingResult extends AuthResult {
  tenant: { slug: string; cnpj: string; razaoSocial: string }
}

export async function onboardTenant(input: OnboardingInput): Promise<OnboardingResult> {
  const { slug, cnpj, razaoSocial, nomeFantasia, admin, ip } = input

  // 1. Unicidade (slug é PK lógica; CNPJ não pode repetir entre tenants)
  const existing = await publicDb
    .selectFrom('tenants')
    .select(['slug'])
    .where((eb) => eb.or([eb('slug', '=', slug), eb('cnpj', '=', cnpj)]))
    .executeTakeFirst()
  if (existing !== undefined) {
    throw new OnboardingError(409, 'slug ou CNPJ já cadastrado')
  }

  // 2. Provisiona o schema isolado do tenant
  await provisionTenant(slug)

  // 3. Empresa + admin + auto-login, tudo no schema do tenant
  const auth = await withTenantDb(slug, async (db) => {
    await db
      .insertInto('empresa')
      .values({
        cnpj,
        razao_social: razaoSocial,
        ...(nomeFantasia !== undefined ? { nome_fantasia: nomeFantasia } : {}),
      })
      .execute()

    // Primeiro usuário do tenant é admin
    await createUser(db, { email: admin.email, password: admin.password, role: 'admin' })
    return login(db, slug, admin.email, admin.password, ip)
  })

  // 4. Registra o tenant (último passo: a partir daqui ele resolve no middleware)
  await publicDb
    .insertInto('tenants')
    .values({ slug, cnpj, razao_social: razaoSocial, plano_id: null, status: 'ativo' })
    .execute()

  return { tenant: { slug, cnpj, razaoSocial }, ...auth }
}
