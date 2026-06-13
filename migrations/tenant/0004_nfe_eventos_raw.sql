-- ============================================================================
-- Tenant template 0004 — log bruto de eventos de integração (auditoria/replay).
-- ----------------------------------------------------------------------------
-- Guarda o payload original recebido de cada canal ANTES da normalização, com
-- a assinatura recebida e o resultado do processamento. Permite reprocessar sem
-- perder o original e investigar erros sem tela branca (CLAUDE.md §4).
-- ============================================================================

CREATE TABLE nfe_eventos_raw (
  id                   BIGSERIAL PRIMARY KEY,
  origem               TEXT NOT NULL,             -- api|webhook|nfeio|csv|polling|mcp
  chave_acesso         VARCHAR(44),
  payload              JSONB NOT NULL,
  assinatura           TEXT,                      -- header de assinatura recebido (se houver)
  status_processamento TEXT NOT NULL DEFAULT 'recebido', -- recebido|processado|erro
  erro                 TEXT,
  nota_id              UUID REFERENCES notas_fiscais (id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at         TIMESTAMPTZ,
  CONSTRAINT eventos_status_chk CHECK (status_processamento IN ('recebido', 'processado', 'erro'))
);

CREATE INDEX idx_eventos_status ON nfe_eventos_raw (status_processamento);
CREATE INDEX idx_eventos_chave ON nfe_eventos_raw (chave_acesso);
