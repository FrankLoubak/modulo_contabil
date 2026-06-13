-- ============================================================================
-- 0002 — Roteamento público de webhooks da NFE.io (Sprint A2).
-- ----------------------------------------------------------------------------
-- O webhook é /api/public/* (a NFE.io não envia o header de tenant), então o
-- token da URL precisa resolver o tenant a partir do schema PÚBLICO. Esta tabela
-- é o resolver: webhook_token -> tenant. A config tenant-local (integracao_nfeio)
-- guarda o mesmo no schema do tenant para leitura interna.
-- ============================================================================

CREATE TABLE public.nfeio_webhook_routes (
  webhook_token TEXT PRIMARY KEY,
  tenant_slug   TEXT NOT NULL REFERENCES public.tenants (slug) ON DELETE CASCADE,
  company_id    TEXT NOT NULL,          -- companyId do emitente na NFE.io
  ambiente      TEXT NOT NULL DEFAULT 'production',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfeio_routes_ambiente_chk CHECK (ambiente IN ('production', 'sandbox'))
);

CREATE INDEX idx_nfeio_routes_tenant ON public.nfeio_webhook_routes (tenant_slug);
