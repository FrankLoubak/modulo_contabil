-- ============================================================================
-- Tenant template 0002 — índice de busca por refresh token.
-- ----------------------------------------------------------------------------
-- O fluxo de refresh/logout consulta `sessions` por refresh_token_hash em todo
-- request; sem índice, a busca é sequencial. (AR A1 — achado 3.1)
-- Aplicado a novos tenants no onboarding e aos existentes via migrateAllTenants().
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions (refresh_token_hash);
