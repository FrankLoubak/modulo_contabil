-- ============================================================================
-- Tenant template 0003 — notas fiscais (saídas e entradas) + itens.
-- ----------------------------------------------------------------------------
-- Persiste o modelo canônico NotaFiscalEvento (src/integracao/canonical.ts).
-- chave_acesso (44 dígitos) é a chave de idempotência: reentrega do mesmo
-- evento faz UPDATE de status, não duplica (Sprint A2).
-- Itens em tabela normalizada (necessário para apuração do DAS no A4).
-- ============================================================================

CREATE TABLE notas_fiscais (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_acesso      VARCHAR(44) NOT NULL UNIQUE,   -- idempotência
  tipo              TEXT NOT NULL,                  -- NFe | NFCe
  direcao           TEXT NOT NULL,                  -- saida | entrada
  origem            TEXT NOT NULL,                  -- api|webhook|nfeio|csv|polling|mcp
  numero            TEXT,
  serie             TEXT,
  data_emissao      TIMESTAMPTZ,
  emitente_cnpj     VARCHAR(14),
  emitente_razao    TEXT,
  destinatario_cnpj VARCHAR(14),
  destinatario_cpf  VARCHAR(11),
  destinatario_razao TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente', -- autorizada|cancelada|rejeitada|pendente
  valor_total       NUMERIC(14, 2),
  totais            JSONB,                          -- TotaisNF (inclui IBS/CBS desde 2026)
  xml_url           TEXT,
  danfe_url         TEXT,
  nfeio_id          TEXT,                           -- id da nota na NFE.io (correlação)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notas_tipo_chk CHECK (tipo IN ('NFe', 'NFCe')),
  CONSTRAINT notas_direcao_chk CHECK (direcao IN ('saida', 'entrada')),
  CONSTRAINT notas_origem_chk CHECK (origem IN ('api', 'webhook', 'nfeio', 'csv', 'polling', 'mcp')),
  CONSTRAINT notas_status_chk CHECK (status IN ('autorizada', 'cancelada', 'rejeitada', 'pendente'))
);

CREATE INDEX idx_notas_status ON notas_fiscais (status);
CREATE INDEX idx_notas_data_emissao ON notas_fiscais (data_emissao);
CREATE INDEX idx_notas_direcao ON notas_fiscais (direcao);

CREATE TABLE notas_fiscais_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id        UUID NOT NULL REFERENCES notas_fiscais (id) ON DELETE CASCADE,
  descricao      TEXT NOT NULL,
  ncm            VARCHAR(8),
  cfop           VARCHAR(4),
  quantidade     NUMERIC(14, 4) NOT NULL DEFAULT 0,
  valor_unitario NUMERIC(14, 4) NOT NULL DEFAULT 0,
  valor_total    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  impostos       JSONB,                             -- impostos destacados por item
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notas_itens_nota ON notas_fiscais_itens (nota_id);
