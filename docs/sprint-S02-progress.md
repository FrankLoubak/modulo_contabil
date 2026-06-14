# Sprint A2 — Integração · Progresso (PARCIAL — pausado)

> Branch: `sprint-02-integracao` · Pausado em: 2026-06-14
> Spec: `.claude/PLANO_SAAS_CONTABIL.md` (Integração) · Plano: `docs/plan-A2-integracao.md`
> Status: **EM ANDAMENTO** — 46 testes verdes. Retomar da camada 5 (decisão aberta).

## Objetivo
Receber notas fiscais de 5 canais e normalizar para `NotaFiscalEvento`, persistido
no schema do tenant com idempotência por `chave_acesso`.

## Entregue (commits f28512a → c06f2d7)
| Camada | O que | Commit |
|--------|-------|--------|
| 1. Dados | `notas_fiscais` + `notas_fiscais_itens`, `nfe_eventos_raw`, `integracao_nfeio`, `public.nfeio_webhook_routes`; modelo canônico `NotaFiscalEvento` | f28512a, 4c7dbc7 |
| 2. Cliente NFE.io | `NfeioClient` (auth `Authorization` sem Bearer); `getCompany` validado **ao vivo** | d978225 |
| 3. Normalização + persistência | normalizadores REST e CSV; `persistNotaFiscal` idempotente (ON CONFLICT + re-sync de itens) | f0839a2 |
| 4a. REST push | `POST /api/tenant/integracao/notas` (requireTenant+Auth+Role); `ingestEvento` | aaec3cc |
| 4b. Webhook | `POST /api/public/webhooks/nfeio/:token` (resolve tenant, grava bruto, ACK 200); HMAC pluggable **desligado** | 4c7dbc7 |
| 4c. Distribuição | `consultarEntradaPorChave` (host/path configuráveis, não confirmados) | c06f2d7 |

🧪 **46 testes verdes.** `requireRole` agora aplicado numa rota real (fecha pendência do A1).

## Rotas novas no A2
| Método | Rota | Proteção |
|--------|------|----------|
| POST | `/api/tenant/integracao/notas` | requireTenant + requireAuth + requireRole |
| POST | `/api/public/webhooks/nfeio/:token` | pública (token resolve tenant) |

## Próximo passo (ao retomar)
Decidir **camada 5** (fila Bull/Redis + worker). Recomendação registrada:
**ADIAR** — `normalizeFromNfeio`/`normalizeFromNfeioDistribuicao` são stubs, não há
trabalho assíncrono real ainda (Simplicity First). Alternativa: fechar o A2 e rodar o **AR**.

## Bloqueadores (dependem do usuário / conta NFE.io)
1. **Payload real do webhook** — publicar URL pública (`admin.acqua-fitness.com`) e
   capturar 1 entrega → destrava `normalizeFromNfeio` + ligar HMAC.
2. **Host/path de consulta** — `consultarCnpj` e `consultarEntradaPorChave` deram 404;
   host só aparece no console NFE.io logado. Falta o cURL de exemplo.
3. **Produto de consulta habilitado** — confirmar se a conta tem Consulta de CNPJ/
   Distribuição ativos.

## Conformidade
- Leis 1/3/4 mantidas; idempotência por `chave_acesso`; IBS/CBS em JSONB (sem hardcode).
- `from-nfeio` e distribuição são **stubs explícitos** — não inventamos campos (§6).
- HMAC só captura a assinatura recebida; não rejeita até o esquema ser confirmado.

## Pendências A1 ainda abertas (herdadas)
- PR #1 (A1) aberto, não mergeado.
- `audit_log` ainda não populado.
- Consulta CNPJ no onboarding ainda usa só validação de DV (consulta Receita via NFE.io pendente — bloqueador 2/3).
