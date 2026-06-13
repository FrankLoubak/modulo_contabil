-- ============================================================================
-- Tenant template 0001 — tabelas base do schema de cada tenant.
-- ----------------------------------------------------------------------------
-- Aplicado no onboarding de cada CNPJ por src/tenant/provision.ts, que roda
-- este arquivo com `search_path = tenant_{slug}, public`:
--   - nomes não-qualificados criam objetos NO schema do tenant (isolamento, Lei 4)
--   - gen_random_uuid() resolve a partir do schema public (extensão pgcrypto)
--
-- Tabelas de DP/fiscal (funcionarios, notas_fiscais, folha, ...) entram em
-- sprints posteriores como novos arquivos migrations/tenant/000N_*.sql.
-- ============================================================================

-- Dados cadastrais da empresa
CREATE TABLE empresa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj           VARCHAR(14) NOT NULL UNIQUE,
  razao_social   TEXT NOT NULL,
  nome_fantasia  TEXT,
  regime         TEXT NOT NULL DEFAULT 'simples_nacional',
  cnae_principal VARCHAR(7),
  -- endereço fiscal
  logradouro  TEXT,
  numero      TEXT,
  complemento TEXT,
  bairro      TEXT,
  municipio   TEXT,
  uf          VARCHAR(2),
  cep         VARCHAR(8),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sócios — pró-labore compõe o numerador do fator R (CLAUDE.md §7)
CREATE TABLE socios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf        VARCHAR(11) NOT NULL UNIQUE,
  nome       TEXT NOT NULL,
  percentual NUMERIC(5, 2) NOT NULL DEFAULT 0,   -- % de participação
  pro_labore NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lei 1 (CLAUDE.md §3): APENAS metadados. NUNCA o arquivo .pfx nem a senha.
CREATE TABLE certificado_referencia (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       VARCHAR(2) NOT NULL,   -- A1 | A3
  titular    TEXT NOT NULL,
  emissora   TEXT,
  validade   DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT certificado_tipo_chk CHECK (tipo IN ('A1', 'A3'))
);

-- Usuários do tenant — autenticação JWT + RBAC (role)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- argon2id — nunca a senha em claro
  role          TEXT NOT NULL DEFAULT 'operador',  -- admin | contador | operador | viewer
  status        TEXT NOT NULL DEFAULT 'ativo',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_status_chk CHECK (status IN ('ativo', 'inativo'))
);

-- Sessões de refresh token (access 15min em memória; refresh 30d aqui)
CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,      -- hash do refresh token, nunca o token cru
  expires_at         TIMESTAMPTZ NOT NULL,
  ip                 INET,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Configuração tributária específica do tenant (legislação nacional fica no public)
CREATE TABLE configuracoes_tributarias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anexo            TEXT,                 -- Anexo do Simples (I..V)
  cnae             VARCHAR(7),
  fator_r          NUMERIC(7, 4),
  folha_12m_manual NUMERIC(14, 2),       -- fallback do fator R antes do módulo de folha (A5)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT config_anexo_chk CHECK (anexo IS NULL OR anexo IN ('I', 'II', 'III', 'IV', 'V'))
);
