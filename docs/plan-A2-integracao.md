# Plano — Sprint A2 · Integração (NFE.io → modelo canônico)

> Branch: `sprint-02-integracao` · Depende de: **A1 aprovado** ✅
> Spec: `.claude/PLANO_SAAS_CONTABIL.md` (seção Integração) · CLAUDE.md §6
> Status: **PLANEJADO** — aguardando documentação da NFE.io (Regra 8)

## Objetivo

Receber notas fiscais de **5 canais** e normalizar tudo para um único modelo
canônico interno (`NotaFiscalEvento`), persistido no schema do tenant. Os
domínios fiscais (A3+) nunca conhecem a origem do dado.

```
REST push ─┐
Webhook ───┤
NFE.io ────┼──▶  normalizador  ──▶  NotaFiscalEvento  ──▶  notas_fiscais (tenant)
CSV/XML ───┤
Polling ───┘
```

## Escopo (quadro do Orchestrator)

| Item | Entrega |
|------|---------|
| REST push | `POST /api/tenant/integracao/notas` — ERPs/PDV enviam JSON |
| Webhook NFE.io | `POST /api/public/webhooks/nfeio` — validação **HMAC** `x-nfeio-signature` |
| Webhook pagamentos | receptor genérico (Mercado Pago/PagSeguro/Stripe) — fase posterior |
| Import CSV/XML | upload com mapeamento por tenant |
| Polling NFE.io | job Bull/Redis com rate limit (fallback do webhook) |
| Modelo canônico | normalização dos canais + persistência idempotente |

## Modelo canônico (já definido no PLANO)

```ts
interface NotaFiscalEvento {
  tenant_id: string
  origem: 'api' | 'webhook' | 'nfeio' | 'csv' | 'polling' | 'mcp'
  tipo: 'NFe' | 'NFCe'
  chave_acesso: string          // 44 dígitos — chave de idempotência
  numero: string; serie: string
  data_emissao: Date
  emitente: { cnpj: string; razao_social: string }
  destinatario: { cnpj?: string; cpf?: string; razao_social?: string }
  itens: ItemNF[]
  totais: TotaisNF              // inclui IBS/CBS desde 2026
  status: 'autorizada' | 'cancelada' | 'rejeitada' | 'pendente'
  xml_url?: string; danfe_url?: string
}
```

## Mudanças de banco (migrations forward-only)

Novas migrations no template do tenant (aplicadas a tenants existentes via
`migrateAllTenants()`):

- `migrations/tenant/0003_notas_fiscais.sql`
  - `notas_fiscais`: `chave_acesso VARCHAR(44) UNIQUE` (idempotência), `tipo`,
    `numero`, `serie`, `status`, `origem`, `data_emissao`, emitente/destinatário,
    `totais JSONB`, `xml_url`, `danfe_url`, timestamps.
  - Índices: `chave_acesso` (unique), `status`, `data_emissao`.
- `migrations/tenant/0004_nfe_eventos_raw.sql` (auditoria/replay)
  - `nfe_eventos_raw`: payload bruto recebido por canal + assinatura + resultado
    do processamento (sucesso/erro). Permite reprocessar sem perder o original.

> `itens` da NF: decidir **uma tabela `notas_fiscais_itens`** (normalizada, melhor
> para apuração do DAS em A4) **vs** `itens JSONB` na própria nota. Recomendação:
> tabela normalizada — o RBT12 e o Anexo dependem de varrer itens. **Decisão a
> confirmar na eng-review.**

## Arquitetura de processamento

- **Ingestão fina, processamento assíncrono:** o endpoint valida + enfileira
  (Bull/Redis) e responde rápido; um worker normaliza e persiste. Webhooks
  precisam responder em poucos segundos — não bloquear no processamento.
- **Idempotência:** `INSERT ... ON CONFLICT (chave_acesso) DO UPDATE` (status pode
  mudar: autorizada → cancelada). Reentrega do mesmo evento não duplica.
- **HMAC:** validar `x-nfeio-signature` sobre o corpo **cru** antes de qualquer
  parse (CLAUDE.md §4). Assinatura inválida → 401, sem enfileirar.
- **Isolamento de tenant no webhook:** o webhook é `/api/public/*` (NFE.io não
  manda nosso header). Resolver o tenant pelo **CNPJ do emitente** ou por um
  **token/rota por tenant** (ex.: `/api/public/webhooks/nfeio/:tenantToken`).
  **Decisão a confirmar** (ver "O que preciso da doc").

## Estrutura de arquivos prevista

```
src/integracao/
  canonical.ts          # tipos NotaFiscalEvento, ItemNF, TotaisNF
  normalize/
    from-nfeio.ts       # payload NFE.io  → NotaFiscalEvento
    from-rest.ts        # payload REST    → NotaFiscalEvento
    from-csv.ts         # linha CSV       → NotaFiscalEvento
  persist.ts            # upsert idempotente por chave_acesso
  hmac.ts               # validação x-nfeio-signature
  queue.ts              # Bull/Redis (fila de eventos)
  worker.ts             # consumidor: normaliza + persiste
  routes.ts             # REST push, webhook, upload CSV
src/nfeio/
  client.ts             # cliente REST NFE.io (base api.nfse.io, sem Bearer)
  polling.ts            # job de polling com rate limit
```

## Armadilhas NFE.io já conhecidas (CLAUDE.md §6 — aplicar sem redescobrir)

- Base URL: **`https://api.nfse.io`** (com "e")
- Auth: `Authorization: <token>` — **sem `Bearer`**
- Campos em inglês: `buyer`, `federalTaxNumber`, `unitAmount`, `items`, `payments`
- NCM no campo `ncm` (não `hsCode`)
- Resultado da emissão: `authorization.accessKey`
- Webhook: assinatura em `x-nfeio-signature`

## Plano de testes (AT A2)

- [ ] Webhook HMAC **válido** processa; **inválido** → 401 sem efeito
- [ ] Idempotência: mesmo `chave_acesso` 2× não duplica; status atualiza
- [ ] Normalização dos canais (REST, NFE.io, CSV) → mesmo `NotaFiscalEvento`
- [ ] Resolução de tenant no webhook (por CNPJ/token)
- [ ] Rate limit do polling respeitado
- [ ] Erro de parse/payload inválido vira registro em `nfe_eventos_raw` (não 500 cego)

## ⚠️ O que preciso da documentação da NFE.io antes de codar (Regra 8)

1. **Webhook:** formato exato do payload de notificação; como a **assinatura HMAC**
   é calculada (algoritmo, sobre qual corpo, qual segredo) e onde configurar o
   segredo por empresa.
2. **Identificação do tenant no webhook:** a NFE.io permite uma URL por
   empresa/conta? Manda CNPJ do emitente no payload? (define a estratégia de
   resolução de tenant).
3. **Consulta/Polling:** endpoint de listagem de notas (entrada e saída), paginação,
   **limites de rate** e autenticação.
4. **Consulta de NF recebida pela chave** (entradas/fornecedores): endpoint e XML
   retornado.
5. **Consulta de CNPJ (Companies)** — pendência herdada do A1 (validação Receita
   Federal no onboarding): endpoint, campos retornados, custo/limite.
6. **Modelo de credencial:** uma API key por conta do SaaS ou uma por empresa?
   (impacta onde guardar — `process.env` global vs. config por tenant).

> Assim que você trouxer o link, eu leio os endpoints relevantes **antes** de
> escrever o cliente, e travamos as 3 decisões em aberto (itens normalizados vs
> JSONB, resolução de tenant no webhook, escopo da credencial) numa eng-review.
