-- ============================================================================
-- 0001 — Schema público (compartilhado entre todos os tenants)
-- ----------------------------------------------------------------------------
-- Contém: controle de tenants/planos, trilha de auditoria e as tabelas de
-- LEGISLAÇÃO NACIONAL versionadas por ano. Estas últimas são idênticas para
-- todos os tenants (CLAUDE.md §3 Lei 3) — mudança de lei = 1 UPDATE auditável.
--
-- Os schemas POR TENANT (empresa, socios, funcionarios, ...) NÃO são criados
-- aqui: são provisionados dinamicamente no onboarding de cada CNPJ.
-- ============================================================================

-- gen_random_uuid() para PKs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Planos contratáveis (limites por plano em JSONB: max_funcionarios, max_notas_mes…)
-- ---------------------------------------------------------------------------
CREATE TABLE public.planos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL UNIQUE,
  limites    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tenants — um por empresa-cliente. O slug vira o nome do schema: tenant_{slug}
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  cnpj         VARCHAR(14) NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  plano_id     UUID REFERENCES public.planos (id),
  status       TEXT NOT NULL DEFAULT 'ativo',  -- ativo | suspenso | cancelado
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_chk CHECK (status IN ('ativo', 'suspenso', 'cancelado')),
  -- slug usado em SET search_path: restringe a identificadores seguros
  CONSTRAINT tenants_slug_chk CHECK (slug ~ '^[a-z0-9_]+$')
);

CREATE INDEX idx_tenants_status ON public.tenants (status);

-- ---------------------------------------------------------------------------
-- Trilha de auditoria — global. user_id sem FK pois users vivem no schema do tenant.
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID REFERENCES public.tenants (id),
  user_id    UUID,
  action     TEXT NOT NULL,
  resource   TEXT NOT NULL,
  payload    JSONB,
  ip         INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant_created ON public.audit_log (tenant_id, created_at DESC);

-- ============================================================================
-- LEGISLAÇÃO NACIONAL — versionada por ano (Lei 3). Estrutura apenas;
-- os valores são carregados/atualizados por UPDATE auditável (ver
-- docs/RUNBOOK_LEGISLACAO.md). Nenhuma alíquota hardcoded no código.
-- ============================================================================

-- Simples Nacional — faixas por anexo. aliquota_efetiva é calculada em runtime:
-- (rbt12 * aliquota_nominal - parcela_deduzir) / rbt12
CREATE TABLE public.tabelas_simples_anexos (
  id               BIGSERIAL PRIMARY KEY,
  ano_calendario   INTEGER NOT NULL,
  anexo            TEXT NOT NULL,        -- 'I' | 'II' | 'III' | 'IV' | 'V'
  faixa            SMALLINT NOT NULL,    -- 1..6
  rbt12_min        NUMERIC(14, 2) NOT NULL,
  rbt12_max        NUMERIC(14, 2) NOT NULL,
  aliquota_nominal NUMERIC(7, 4) NOT NULL,
  parcela_deduzir  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  CONSTRAINT tabelas_simples_anexos_uk UNIQUE (ano_calendario, anexo, faixa),
  CONSTRAINT tabelas_simples_anexos_anexo_chk CHECK (anexo IN ('I', 'II', 'III', 'IV', 'V'))
);

CREATE INDEX idx_simples_ano_anexo ON public.tabelas_simples_anexos (ano_calendario, anexo);

-- INSS — faixas progressivas. Consumida por calcularINSS(base, ano) (CLAUDE.md §12.2)
CREATE TABLE public.tabelas_inss_faixas (
  id        BIGSERIAL PRIMARY KEY,
  ano       INTEGER NOT NULL,
  faixa     SMALLINT NOT NULL,
  faixa_min NUMERIC(14, 2) NOT NULL,
  faixa_max NUMERIC(14, 2) NOT NULL,
  aliquota  NUMERIC(7, 4) NOT NULL,
  CONSTRAINT tabelas_inss_faixas_uk UNIQUE (ano, faixa)
);

CREATE INDEX idx_inss_ano ON public.tabelas_inss_faixas (ano);

-- IRRF — faixas progressivas + dedução por dependente do ano.
-- deducao_dependente é constante por ano (repetida nas faixas por simplicidade —
-- lida junto da faixa no cálculo da folha; manter consistente entre faixas do mesmo ano).
CREATE TABLE public.tabelas_irrf_faixas (
  id                 BIGSERIAL PRIMARY KEY,
  ano                INTEGER NOT NULL,
  faixa              SMALLINT NOT NULL,
  base_min           NUMERIC(14, 2) NOT NULL,
  base_max           NUMERIC(14, 2),          -- NULL = última faixa (sem teto)
  aliquota           NUMERIC(7, 4) NOT NULL,
  parcela_deduzir    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deducao_dependente NUMERIC(14, 2) NOT NULL DEFAULT 0,
  CONSTRAINT tabelas_irrf_faixas_uk UNIQUE (ano, faixa)
);

CREATE INDEX idx_irrf_ano ON public.tabelas_irrf_faixas (ano);

-- Salário mínimo nacional por ano
CREATE TABLE public.tabelas_sm (
  id    BIGSERIAL PRIMARY KEY,
  ano   INTEGER NOT NULL UNIQUE,
  valor NUMERIC(14, 2) NOT NULL
);

-- Reforma Tributária — alíquotas IBS/CBS por ano (CLAUDE.md §7)
CREATE TABLE public.aliquotas_rt (
  id   BIGSERIAL PRIMARY KEY,
  ano  INTEGER NOT NULL UNIQUE,
  ibs  NUMERIC(7, 4) NOT NULL,
  cbs  NUMERIC(7, 4) NOT NULL
);
