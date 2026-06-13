# Sprint A1 — Fundação · Progresso

> Branch: `sprint-01-fundacao` · Data: 2026-06-13
> Subagente: A1.fundacao · Spec: `.claude/PLANO_SAAS_CONTABIL.md`

## Escopo do sprint

Multi-tenant, Auth JWT, Schema base e Onboarding por CNPJ — os quatro pilares
sobre os quais os demais sprints (A2–A10) se apoiam.

## Estado final

| Deliverable | Status | Onde |
|-------------|--------|------|
| Infra dev (Postgres 17 + Redis 7) | ✅ | `docker-compose.yml` |
| Runner de migrations forward-only | ✅ | `migrations/migrate.ts` |
| Schema público + legislação nacional | ✅ | `migrations/0001_public_schema.sql` |
| Provisionamento schema-per-tenant | ✅ | `src/tenant/provision.ts`, `migrations/tenant/0001_tenant_base.sql` |
| Middleware de tenant (isolamento) | ✅ | `src/tenant/middleware.ts` |
| Auth JWT (login/refresh/logout) + RBAC | ✅ | `src/auth/*` |
| Onboarding por CNPJ | ✅ | `src/onboarding/*`, `src/shared/cnpj.ts` |

🧪 **Cobertura de testes:** 27 testes verdes (3 arquivos) — caminhos críticos do AT/A1.

## Rotas expostas

| Método | Rota | Proteção |
|--------|------|----------|
| GET | `/api/health` | pública |
| POST | `/api/public/onboarding` | pública (Zod rigoroso) |
| POST | `/api/tenant/auth/login` | `requireTenant` |
| POST | `/api/tenant/auth/refresh` | `requireTenant` |
| POST | `/api/tenant/auth/logout` | `requireTenant` + `requireAuth` |
| GET | `/api/tenant/me` | `requireTenant` + `requireAuth` |
| GET | `/api/tenant/whoami` | `requireTenant` (diagnóstico de isolamento) |

## Arquitetura entregue

### Multi-tenant (schema-per-tenant)
- Cada tenant tem o schema `tenant_{slug}`; legislação nacional fica no schema
  público (Lei 3).
- `requireTenant` resolve o slug (header `X-Tenant-ID` ou subdomínio), valida em
  `public.tenants`, **reserva uma conexão** do pool e aplica
  `SET search_path = tenant_{slug}`. O Kysely da requisição fica preso a essa
  conexão (`pinnedPool`), garantindo que toda query opere no schema correto (Lei 4).
- A conexão é devolvida ao pool no fim da requisição, resetando o `search_path`.
- `withTenantDb(slug, fn)` oferece o mesmo isolamento fora do ciclo HTTP
  (onboarding, jobs, testes).

### Autenticação
- Access token: JWT 15 min (`sub`, `tenant`, `role`), verificado sem ir ao banco.
- Refresh token: string opaca 30 dias; **só o hash SHA-256** em `sessions`
  (revogável). Rotação a cada refresh.
- Senhas com argon2id. `requireAuth` confere que o token pertence ao tenant da
  requisição (impede uso cruzado — Lei 4). `requireRole([...])` para RBAC.

### Onboarding
- `POST /api/public/onboarding`: valida CNPJ (DV módulo 11) + unicidade,
  provisiona o schema, grava `empresa` + admin, auto-login e registra o tenant.

## Conformidade com as Leis Fundamentais (§3)

- **Lei 1** — `certificado_referencia` só metadados; sem coluna de arquivo/senha.
- **Lei 2** — nenhum código de transmissão governamental (fora do escopo do A1).
- **Lei 3** — tabelas de legislação no schema público, versionadas por ano, **sem
  valores hardcoded** (apenas estrutura; seeding por UPDATE auditável em A4/A5).
- **Lei 4** — isolamento de tenant por `search_path` em toda query; slug validado
  contra injeção antes de virar identificador de schema.

## Pendências e decisões para os próximos sprints

- **A2 — Consulta de CNPJ na Receita Federal (NFE.io):** adiada (Regra 8). Depende
  de `NFEIO_API_KEY` e da documentação do provider. Pedir o manual antes de
  implementar.
- **RBAC nas rotas:** `requireRole` existe e está testado, mas ainda não há
  endpoint role-gated no A1 além do conceito. Plugar nas rotas de cadastro/admin.
- **Seeding de legislação:** tabelas `tabelas_*` e `aliquotas_rt` estão vazias —
  populadas em A4/A5 conforme o runbook (`docs/RUNBOOK_LEGISLACAO.md`).
- **Janela de órfão no onboarding:** se a inserção final em `public.tenants` falhar
  após criar o schema, este fica órfão (invisível ao app). Mitigado por pré-checagem
  de unicidade; revisar se necessário transação distribuída.

## Como rodar

```bash
docker compose up -d        # Postgres (5440) + Redis (6390)
npm install
cp .env.example .env         # ajustar JWT_SECRET
npm run migrate              # aplica o schema público
npm test                     # 27 testes
npm run dev                  # sobe a API em :3333
```
