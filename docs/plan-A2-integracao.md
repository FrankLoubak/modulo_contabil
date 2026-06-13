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

## Achados da documentação NFE.io (lidos em 2026-06-13)

> Fonte: `https://nfe.io/docs/desenvolvedores/rest-api/` (a `/integracoes/` é só
> catálogo de plugins). A API é dividida em **produtos separados**, cada um com sua
> própria árvore — importante para o A2.

### Produtos relevantes
| Produto | Caminho | Uso no A2 |
|---------|---------|-----------|
| NF-e produto v2 | `.../nota-fiscal-de-produto-v2/` | emissão (saídas) + webhooks |
| Consulta NF-e distribuição | `.../consulta-nf-e-distribuicao/` | **entradas** (NF-e recebidas) |
| Consulta de CNPJ v1 | `.../consulta-de-cnpj-v1/` | **validação CNPJ no onboarding** (pendência A1) |
| Consulta de CPF v1 | `.../consulta-de-cpf-v1/` | validação de sócios (futuro) |

### Webhooks (NF-e produto v2)
- CRUD por conta: `POST /v2/webhooks` (registra URL + eventos), `GET` listar,
  `PUT` alterar, `DELETE` excluir/excluir-todos, e um endpoint de **teste**.
- A URL registrada **deve responder 200 OK** a um POST de teste.
- ⚠️ **Assinatura HMAC NÃO confirmada na doc acessível.** O CLAUDE.md §6 afirma
  `x-nfeio-signature` (lições de projetos anteriores), mas as páginas que consegui
  ler não documentam segredo/assinatura. **Não construir a validação HMAC sobre
  suposição** — verificar com uma entrega real (criar webhook de teste e capturar
  os headers) antes de implementar (§1 Precisão).

### Distribuição / entradas
- `consulta-nf-e-distribuicao`: consulta por `access_key`, por distribuição e por
  `event_key`; retorna **XML/JSON/PDF/manifest**; tem um `processwebhook` para
  notas recém-recebidas. É o canal de **entradas/fornecedores**.

### Consulta de CNPJ
- `consulta-de-cnpj-v1` (recurso "LegalEntities", endpoint v2). Autenticação por
  **API key** ("preencha sua API key no topo"). Resolve a validação Receita Federal
  do onboarding (A1). Campos exatos e rate limit não renderizaram no fetch estático.

## Respostas às 6 perguntas

| # | Pergunta | Status |
|---|----------|--------|
| 1 | Webhook + HMAC | ⚠️ **Parcial** — CRUD/registro confirmados; **assinatura a verificar empiricamente** |
| 2 | Tenant no webhook | ✅ **Resolvido** — webhooks têm URL de destino arbitrária por conta → registrar **URL por tenant** (`/api/public/webhooks/nfeio/:token`) |
| 3 | Polling/consulta | 🔸 endpoints de listagem existem (Product Invoices); **rate limit a confirmar** |
| 4 | NF recebida pela chave | ✅ **Resolvido** — `consulta-nf-e-distribuicao` (por `access_key`, XML completo) |
| 5 | Consulta de CNPJ | ✅ **Resolvido** — `consulta-de-cnpj-v1` (produto separado da Companies de emissão) |
| 6 | Modelo de credencial | ✅ **Resolvido** — **1 API key por conta** (`NFEIO_API_KEY` global) → N **Companies** (`companyId` por tenant) |

### Impacto no design (atualiza o plano)
- **Credencial:** `NFEIO_API_KEY` global no env **+** guardar o **`companyId` da NFE.io
  por tenant** (nova tabela `integracao_nfeio` no schema do tenant, ou campo em
  `configuracoes_tributarias`).
- **Entradas:** modelar `consulta-nf-e-distribuicao` como canal próprio (não confundir
  com a emissão produto-v2).
- **Webhook HMAC:** manter o passo de validação no design, mas **gated** numa
  verificação real do header antes de codar a checagem.

## Ainda em aberto (verificar antes/durante a implementação)
1. **Assinatura do webhook** — header e algoritmo reais (capturar entrega de teste).
2. **Rate limits** — de consulta/polling e de consulta de CNPJ (página de billing).
3. **Header de auth exato** — CLAUDE.md diz `Authorization: <token>` sem `Bearer`;
   confirmar contra a doc viva no primeiro request (Regra 8, parar no 1º 401).

## Decisões para a eng-review
1. Itens da NF: tabela normalizada `notas_fiscais_itens` (recomendado p/ DAS A4) vs `JSONB`.
2. Onde guardar `companyId` da NFE.io por tenant.
3. Estratégia final de token na URL do webhook (rota por tenant).
