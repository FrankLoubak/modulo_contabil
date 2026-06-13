/**
 * Tipos do banco para o Kysely (CLAUDE.md §4 — query builder tipado).
 *
 * Convenção schema-per-tenant: as tabelas do tenant são referenciadas pelo
 * nome simples (sem schema). O middleware define `search_path` por requisição,
 * então a mesma interface `Database` cobre tabelas do schema public e do schema
 * do tenant — qual schema responde depende do search_path ativo na conexão.
 *
 * Colunas NUMERIC voltam do pg como string; por isso `Numeric` é string na
 * leitura e aceita number/string na escrita.
 */
import type { ColumnType, Generated } from 'kysely'

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>
type Numeric = ColumnType<string, string | number, string | number>

// ---------------------------------------------------------------------------
// Schema público (compartilhado)
// ---------------------------------------------------------------------------
export interface TenantsTable {
  id: Generated<string>
  slug: string
  cnpj: string
  razao_social: string
  plano_id: string | null
  status: string // ativo | suspenso | cancelado
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface PlanosTable {
  id: Generated<string>
  nome: string
  limites: Generated<unknown> // JSONB
  created_at: Generated<Timestamp>
}

export interface AuditLogTable {
  id: Generated<number>
  tenant_id: string | null
  user_id: string | null
  action: string
  resource: string
  payload: unknown | null // JSONB
  ip: string | null
  created_at: Generated<Timestamp>
}

// ---------------------------------------------------------------------------
// Schema por tenant (isolado)
// ---------------------------------------------------------------------------
export interface EmpresaTable {
  id: Generated<string>
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  regime: Generated<string>
  cnae_principal: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface SociosTable {
  id: Generated<string>
  cpf: string
  nome: string
  percentual: Generated<Numeric>
  pro_labore: Generated<Numeric>
  created_at: Generated<Timestamp>
}

export interface CertificadoReferenciaTable {
  id: Generated<string>
  tipo: string // A1 | A3 — apenas metadados (Lei 1)
  titular: string
  emissora: string | null
  validade: ColumnType<Date, Date | string, Date | string>
  created_at: Generated<Timestamp>
}

export interface UsersTable {
  id: Generated<string>
  email: string
  password_hash: string
  role: Generated<string>
  status: Generated<string>
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface SessionsTable {
  id: Generated<string>
  user_id: string
  refresh_token_hash: string
  expires_at: Timestamp
  ip: string | null
  created_at: Generated<Timestamp>
}

export interface ConfiguracoesTributariasTable {
  id: Generated<string>
  anexo: string | null
  cnae: string | null
  fator_r: Numeric | null
  folha_12m_manual: Numeric | null
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface Database {
  // público
  tenants: TenantsTable
  planos: PlanosTable
  audit_log: AuditLogTable
  // tenant
  empresa: EmpresaTable
  socios: SociosTable
  certificado_referencia: CertificadoReferenciaTable
  users: UsersTable
  sessions: SessionsTable
  configuracoes_tributarias: ConfiguracoesTributariasTable
}
