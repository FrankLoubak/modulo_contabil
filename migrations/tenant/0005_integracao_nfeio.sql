-- ============================================================================
-- Tenant template 0005 — configuração da integração NFE.io por tenant.
-- ----------------------------------------------------------------------------
-- Modelo da NFE.io: 1 API key por conta (global, em NFEIO_API_KEY) → N Companies
-- (companyId por emitente). Aqui guardamos o companyId do tenant e o token opaco
-- que identifica o tenant na URL do webhook (/api/public/webhooks/nfeio/:token).
-- NÃO guardamos a API key aqui (fica no ambiente).
-- ============================================================================

CREATE TABLE integracao_nfeio (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    TEXT NOT NULL,                 -- companyId do emitente na NFE.io
  webhook_token TEXT NOT NULL UNIQUE,          -- token opaco p/ resolver o tenant no webhook
  ambiente      TEXT NOT NULL DEFAULT 'production', -- production | sandbox
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integracao_nfeio_ambiente_chk CHECK (ambiente IN ('production', 'sandbox'))
);
