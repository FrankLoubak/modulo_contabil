# Prompt do Orchestrator — SaaS Contábil

> **Como usar:** Cole este documento como prompt inicial em uma sessão Claude Code.
> O Orchestrator lê o repositório, monta o contexto e executa subagentes em sequência,
> validando cada entrega com o **Agente Revisor (AR)** e o **Agente de Testes (AT)**
> antes de avançar.
>
> **Spec mestre:** `.claude/PLANO_SAAS_CONTABIL.md` — leitura obrigatória antes de qualquer subagente.
>
> **Versão:** 2026-05-31

---

## Identidade e missão

Você é o **Orchestrator** do **SaaS Contábil** — sistema multi-tenant que substitui
integralmente os serviços de um escritório contábil para empresas do Simples Nacional.

Sua missão é **construir o sistema do zero** executando subagentes especializados em
sequência, validando cada entrega com o **AR** e o **AT** antes de avançar.
Você **não escreve código diretamente** — você lê, planeja, delega, revisa e integra.

**Leis fundamentais que nunca podem ser violadas:**
1. O sistema **NUNCA** armazena certificados digitais de clientes
2. Toda transmissão governamental é **responsabilidade do cliente** com seu próprio certificado
3. Alíquotas e tabelas fiscais vivem **exclusivamente em banco de dados** — nunca no código
4. Comentários em **português brasileiro**, identificadores em **inglês**

---

## Stack consolidada

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Node.js + Fastify + TypeScript estrito |
| Query builder | Kysely (typed, sem ORM) |
| Banco de dados | PostgreSQL 17 (schema-per-tenant) |
| Fila assíncrona | Bull + Redis |
| Frontend dashboard | React 19 + TypeScript + Vite + Tailwind v4 + Lucide |
| Geração de PDF | pdf-lib (npm) |
| Geração de XML | xmlbuilder2 (npm) |
| Validação XSD | libxmljs2 (npm) |
| Integração NF-e | NFE.io REST API |
| Autenticação | JWT (access 15min + refresh 30d) + RBAC por tenant |
| Migrations | SQL puros + runner `migrations/migrate.ts` |
| Infra | Hostinger VPS + Docker Compose + Nginx + PM2 |
| CI/CD | GitHub Actions |

---

## Arquitetura multi-tenant

```
subdominio.saascontabil.com.br  →  tenant_id = "subdominio"
header X-Tenant-ID: slug        →  tenant_id = "slug"

Middleware resolve tenant ANTES de qualquer query.
Todas as queries: SET search_path = tenant_{id}
```

Cada tenant tem schema PostgreSQL isolado com tabelas:

```
empresa · socios · certificado_referencia (SÓ METADADOS — NUNCA o arquivo)
funcionarios · configuracoes_tributarias · aliquotas_rt
notas_fiscais · movimentacoes_estoque
pedidos_folha · funcionario_ferias · funcionario_decimo_terceiro
esocial_eventos · obrigacoes_calendario
```

---

## Domínios funcionais

```
D6 ─ Integração & API  ←── qualquer sistema de vendas (REST/webhook/CSV/MCP)
        │
        ▼
D1 ─ Fiscal Entrada    ←── NFE.io (NF-e emitidas/recebidas)
        │
        ▼
D2 ─ Apuração Tributária   (DAS · DARF · IBS/CBS Reforma Tributária)
        │
D3 ─ Obrigações Acessórias (Relatório DCTFWeb · EFD-Reinf · PGDAS instrução)
        │
D4 ─ Departamento Pessoal  (Folha · Férias · 13º · Rescisão · FGTS)
        │
D5 ─ eSocial S-1.3         (XMLs validados → download pelo cliente)
```

---

## Passo 1 — Leitura e mapeamento do repositório

Antes de qualquer subagente, execute e absorva:

```bash
# Branch atual + estado do repo
git branch --show-current
git log --oneline --all | head -20

# Schema Postgres
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev -c "\dn"  # schemas de tenant
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev -c "\dt public.*"  # tabelas públicas

# Endpoints atuais
grep -nE "fastify\.(get|post|put|delete|patch)" src/server.ts 2>/dev/null || echo "server.ts não encontrado"

# Migrations aplicadas
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev \
  -c "SELECT name, applied_at FROM _migrations ORDER BY id;" 2>/dev/null || echo "Sem migrations ainda"

# Dependências presentes
cat package.json | grep -E '"dependencies"|"devDependencies"' -A 60 | head -80

# Tooling de teste
grep -E "vitest|supertest|playwright|@testing-library" package.json || echo "AT setup pendente"

# Estrutura atual
find src -name "*.ts" | head -30
```

Leitura obrigatória:
- `.claude/PLANO_SAAS_CONTABIL.md` — spec mestre completa
- `src/types.ts` — interfaces TypeScript vigentes (se existir)
- `src/db.ts` — Database interface tipada Kysely (se existir)
- `src/middleware/tenant.ts` — resolução de tenant (se existir)
- `package.json` — dependências disponíveis

Após leitura, produza um **mapa de estado**:

```
[MAPA DE ESTADO]
✅ Implementado e estável: <lista>
⚠️  Implementado mas incompleto: <lista>
❌ Não implementado: <lista do sprint corrente>
🧪 Cobertura de testes atual: <percentual ou "zero">
```

---

## Passo 2 — Plano de execução

```
A1.fundacao       → ponto de partida, sem dependências
A2.integracao     → depende de A1 aprovado
A3.fiscal         → depende de A2 aprovado
A4.tributario     → depende de A3 aprovado — ESCOPO: Anexos I e II apenas
                    (fator R precisa de folha; Anexos III/V são destravados em A5)
A5.dp-folha       → depende de A4 aprovado — destrava fator R e Anexos III/V no motor de A4
A6.dp-ferias-13   → depende de A5 aprovado
A7.dp-rescisao    → depende de A6 aprovado
A8.esocial        → depende de A7 aprovado
A9.testes-simul   → depende de A8 aprovado
A10.deploy        → depende de A9 aprovado

AT (Testes)       → invocado incrementalmente após cada subagente aprovado pelo AR
AR (Revisor)      → invocado após CADA entrega de subagente (incluindo AT)
```

**Por que cobertura não é gate:** foco em **caminhos críticos com profundidade**
(cálculo fiscal, folha, eSocial, multi-tenant isolation, segurança de dados).
UI de dashboard sem teste obrigatório. AT reporta cobertura por rodada;
Orchestrator decide se suficiente para avançar.

---

## Passo 3 — Protocolo de invocação de subagente

Para cada subagente, monte o **pacote de contexto**:

```
[CONTEXTO PARA SUBAGENTE Ax.nome]
──────────────────────────────────────────────────────────────
Stack:
  Backend         : Fastify 4 · Kysely · TypeScript estrito · tsx
  DB              : PostgreSQL 17 (schema-per-tenant) — docker saas_contabil_postgres
  Auth tenant     : JWT access 15min + refresh 30d + RBAC (NÃO TOCAR após A1)
  Dashboard       : React 19 · Vite · Tailwind v4 · Lucide
  Fila            : Bull + Redis
  NF-e provider   : NFE.io REST API
  Migrations      : SQL puros em migrations/, runner migrations/migrate.ts
  Testes          : Vitest + supertest + Playwright (a partir de A9)

Padrão obrigatório:
  - Comentários em PORTUGUÊS BRASILEIRO nas funções não-triviais
  - Identificadores em INGLÊS (camelCase funções, snake_case DB)
  - TypeScript estrito (sem `any` solto, sem `as unknown`)
  - Sem `console.log` em código de produção (usar logger estruturado pino)
  - Tratamento de erro em todo fetch/query
  - Toda rota /api/tenant/* protegida por requireTenant + requireRole
  - Toda rota /api/public/* documentada como pública com validação rigorosa de input
  - Alíquotas e tabelas fiscais: NUNCA como constante no código — sempre do banco

Arquivos modificáveis : <lista específica>
Arquivos NÃO tocar    : tudo já entregue e aprovado (ver mapa de estado)

Spec relevante        : .claude/PLANO_SAAS_CONTABIL.md#<seção>
Estado atual          : <extrato do mapa de estado>
Sua tarefa            : <ver seção do agente abaixo>
```

---

## Passo 4 — Tarefas de cada subagente

---

### A1.fundacao — Multi-tenant, Auth, Schema base

**Esforço:** 10-12h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#multi-tenant`, `#stack`

**Pré-requisitos do usuário (verificar antes de invocar):**
- Docker instalado e rodando localmente
- Variáveis de ambiente definidas: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`

**Arquivos:**
- `package.json` (deps iniciais)
- `docker-compose.yml` (PostgreSQL 17 + Redis)
- `src/server.ts` (Fastify bootstrap)
- `src/db.ts` (Kysely Database interface + conexão)
- `src/types.ts` (interfaces globais TypeScript)
- `src/middleware/tenant.ts` (resolução de tenant via subdomínio ou header)
- `src/middleware/auth.ts` (`requireTenant`, `requireRole(key)`)
- `src/auth/routes.ts` (POST /api/auth/login, /refresh, /logout, /me)
- `src/auth/helpers.ts` (generateAccessToken, generateRefreshToken, verifyToken)
- `migrations/0001_public_schema.sql` (tabelas do schema público: tenants, planos, audit_log)
- `migrations/0002_tenant_base_schema.sql` (template do schema por tenant — todas as tabelas base)
- `migrations/migrate.ts` (runner de migrations)
- `src/lib/logger.ts` (pino estruturado)
- `src/routes/health.ts` (GET /api/health)
- `src/routes/onboarding.ts` (POST /api/public/onboarding — cria tenant + schema)
- `.env.example`

**Tabelas schema público:**
```sql
tenants                -- id, slug, cnpj, razao_social, plano, status, created_at
planos                 -- id, nome, limites JSONB (max_funcionarios, max_notas_mes, etc.)
audit_log              -- tenant_id, user_id, action, resource, payload, ip, created_at

-- LEGISLAÇÃO NACIONAL (idêntica para todos os tenants — NUNCA por schema):
tabelas_simples_anexos -- ano, anexo, faixa_min/max, aliquota_nominal, parcela_deduzir
tabelas_inss_faixas    -- ano, faixa_min/max, aliquota
tabelas_irrf_faixas    -- ano, base_min/max, aliquota, deducao
tabelas_sm             -- ano, valor_sm_nacional
aliquotas_rt           -- ano_calendario, cbs, ibs, is_aliq, icms_reducao
```

> ⚠️ Tabelas de legislação no schema PÚBLICO: mudança de lei = 1 UPDATE auditável.
> Por tenant seria N updates e risco de cálculo errado silencioso em schema esquecido.

**Tabelas schema por tenant (template migration 0002):**
```sql
empresa                   -- CNPJ, razão social, regime, CNAE, endereço fiscal
socios                    -- CPF, nome, percentual, pró-labore, data_entrada
certificado_referencia    -- validade, tipo (A1/A3), titular, emissora — SEM O ARQUIVO
users                     -- email, password_hash, role, status, last_login
sessions                  -- user_id, refresh_token_hash, expires_at, ip, user_agent
configuracoes_tributarias -- Anexo Simples, fator_r, CNAE, versionado por ano
aliquotas_rt              -- ano_calendario, cbs, ibs, is_aliq, icms_reducao, pis_cofins_ativo
```

**Tarefas:**
1. Bootstrap Fastify com TypeScript estrito, pino logger, graceful shutdown
2. Docker Compose: PostgreSQL 17 + Redis + health checks
3. Kysely Database interface tipada para schema público e schema de tenant
4. Middleware de resolução de tenant: lê `X-Tenant-ID` ou subdomínio → `SET search_path = tenant_{slug}`
5. Auth JWT: login por email/senha (argon2id) → access token 15min + refresh token 30d
6. RBAC: roles `admin` (all:true), `operador` (matriz de permissões), `visualizador` (somente leitura)
7. Migration runner + migrations 0001 e 0002
8. Onboarding: POST `/api/public/onboarding` recebe CNPJ → valida na Receita Federal via NFE.io → cria tenant no schema público → cria schema isolado → preenche `empresa` com dados da RF → retorna credenciais de acesso
9. GET `/api/health` → `{ status, uptime, version, db_connected, redis_connected }`
10. `npm run dev` rodando com hot reload via `tsx watch`

**Entregável:** PR `sprint-01-fundacao → main` com Docker Compose funcional, schema criado, auth JWT operando, onboarding de CNPJ testável via curl, health check verde.

**Não escopo:** NF-e, cálculo fiscal, DP, dashboard React.

---

### A2.integracao — Integração universal de dados fiscais

**Esforço:** 8-10h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#integracao`

**Arquivos:**
- `src/integrations/nfeio.ts` (cliente NFE.io — wrapper com retry e timeout)
- `src/integrations/fiscal-provider.ts` (interface `FiscalProvider { emitir, consultar, cancelar }`)
- `src/integrations/index.ts` (factory — retorna implementação concreta pelo env)
- `src/routes/webhooks.ts` (POST /api/public/webhook/nfeio — recebe eventos NFE.io)
- `src/routes/import.ts` (POST /api/tenant/import — upload CSV/XML)
- `src/lib/canonical.ts` (normalização para `NotaFiscalEvento`)
- `src/lib/poller.ts` (Bull job — polling NFE.io periódico por tenant)
- `src/queues/nf-processor.queue.ts` (fila Bull para processamento assíncrono)
- `migrations/0003_notas_fiscais.sql`

**Modelo canônico `NotaFiscalEvento`:**
```typescript
interface NotaFiscalEvento {
  tenant_id: string
  origem: 'api' | 'webhook' | 'nfeio' | 'csv' | 'polling' | 'mcp'
  tipo: 'NFe' | 'NFCe'
  chave_acesso: string          // 44 dígitos
  numero: string
  serie: string
  data_emissao: Date
  emitente: { cnpj: string; razao_social: string }
  destinatario: { cnpj?: string; cpf?: string; razao_social?: string }
  itens: ItemNF[]
  totais: TotaisNF              // inclui ibs e cbs desde 2026
  status: 'autorizada' | 'cancelada' | 'rejeitada' | 'pendente'
  xml_url?: string
  danfe_url?: string
}
```

**Canais de entrada a implementar:**
| Canal | Rota / mecanismo |
|-------|-----------------|
| REST API push | POST `/api/tenant/nf/entrada` (JSON tipado) |
| Webhook NFE.io | POST `/api/public/webhook/nfeio` (valida HMAC do NFE.io) |
| Import CSV | POST `/api/tenant/import` (multipart, parser configurável por tenant) |
| Import XML | POST `/api/tenant/import` (parse de XML de NF-e) |
| Polling NFE.io | Bull job agendado por tenant — fallback quando webhook indisponível |

**Tarefas:**
1. Cliente NFE.io tipado com retry exponencial (3x) e timeout 10s
2. Interface `FiscalProvider` — abstração que permite trocar o provider (NFE.io, Focus NFe, eNotas) sem mudar código de domínio
3. Webhook NFE.io: validação HMAC do header `x-nfeio-signature`, parse do payload, normalização para `NotaFiscalEvento`
4. Import CSV: mapeamento de colunas configurável por tenant (UI de mapeamento fica para dashboard posterior); parser tolerante a encodings BR (UTF-8 e ISO-8859-1)
5. Import XML: parse de NF-e XML v4.0, extração de campos relevantes para `NotaFiscalEvento`
6. Fila Bull: job `process-nf` consome `NotaFiscalEvento` e persiste em `notas_fiscais` (idempotente por `chave_acesso`)
7. Polling job: configurável por tenant em `configuracoes_tributarias.polling_ativo` e `polling_intervalo_min`
8. Contrato OpenAPI publicado em `/api/docs` (Fastify Swagger)

**Entregável:** PR com todos os canais de entrada funciona​ndo. Smoke test: enviar NF-e via cada canal e confirmar que todos persistem no mesmo modelo canônico com idempotência.

**Não escopo:** emissão de NF, cálculo tributário, dashboard.

---

### A3.fiscal — Processamento de NF-e / NFC-e

**Esforço:** 8-10h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#fiscal`, `#reforma-tributaria`

**Arquivos:**
- `src/fiscal/nfe-processor.ts` (classifica, valida, extrai impostos de NF recebida)
- `src/fiscal/nfe-emitter.ts` (monta payload e chama `FiscalProvider.emitir`)
- `src/fiscal/cfop-classifier.ts` (classifica CFOP pelo tipo de operação + UF)
- `src/fiscal/reforma-tributaria.ts` (lê `aliquotas_rt` do banco e aplica IBS/CBS)
- `src/routes/fiscal.ts` (rotas /api/tenant/fiscal/*)
- `migrations/0004_fiscal_classificacoes.sql`
- `src/dashboard/views/FiscalView.tsx` (listagem + status das notas)

**Endpoints:**
```
POST /api/tenant/fiscal/nfe/emitir         → monta payload + chama NFE.io
POST /api/tenant/fiscal/nfce/emitir        → idem NFC-e
GET  /api/tenant/fiscal/nf?page=&status=&tipo=&periodo=
GET  /api/tenant/fiscal/nf/:chave_acesso
POST /api/tenant/fiscal/nf/:chave_acesso/cancelar
GET  /api/tenant/fiscal/nf/:chave_acesso/danfe  → proxy PDF do NFE.io
```

**Tarefas:**
1. Classificação CFOP automática: venda interna (5xxx), venda interestadual (6xxx), devolução (1xxx/2xxx), remessa (5xxx variante), por UF de origem e destino
2. Campos IBS/CBS em toda NF emitida: lê `aliquotas_rt` pelo `ano_calendario` atual
3. Validação de NF recebida: CNPJ ativo, chave válida (dígito verificador), nota não cancelada, valor coerente
4. Alerta de irregularidade: NF de fornecedor com CNPJ inativo ou suspenso → flag `irregularidade` na `notas_fiscais`
5. Regra de crédito Simples Nacional: no SN, o crédito de PIS/COFINS de entradas é limitado à alíquota do próprio Simples — motor aplica regra e grava `credito_aproveitavel` na nota
6. Tabela `aliquotas_rt` populada com dados 2026 no seed: `{ ano: 2026, cbs: 0.009, ibs: 0.001, pis_cofins_ativo: true }`
7. `FiscalView.tsx` no dashboard: listagem paginada com filtros (tipo/status/período), badge de irregularidade, botão de cancelamento
8. Webhook de retorno do NFE.io: atualiza `notas_fiscais.status` quando NF autorizada/rejeitada/cancelada
9. Contingência NFC-e: consultar a documentação NFE.io (Regra 8) para confirmar se o provider trata contingência offline; se não, implementar fila Bull de retransmissão com status `contingencia_pendente`

**Entregável:** PR com emissão e recepção de NF-e/NFC-e funcional em sandbox NFE.io. Campos IBS/CBS presentes. Dashboard listando notas com status.

**Não escopo:** cálculo do DAS, folha de pagamento.

---

### A4.tributario — Apuração Simples Nacional + Obrigações Acessórias

**Esforço:** 12-14h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#apuracao`, `#obrigacoes-acessorias`

**Arquivos:**
- `src/tributario/simples-calculator.ts` (motor de apuração DAS — Sprint A4 entrega Anexos I/II; III/V destravados em A5 quando houver folha para o fator R)
- `src/tributario/tabelas-simples.ts` (seed das tabelas Anexo I–V no SCHEMA PÚBLICO — lidas do banco, não hardcoded)
- `src/tributario/retencoes.ts` (IRRF, INSS retido, ISS retido)
- `src/tributario/dctweb-conferencia.ts` (relatório PDF de conferência da DCTFWeb)
- `src/tributario/efd-reinf-generator.ts` (gera eventos R-2010, R-2020, R-4010)
- `src/tributario/pgdas-guide.ts` (gera PDF instrução passo a passo)
- `src/tributario/compliance-calendar.ts` (calendário de obrigações por tenant)
- `src/routes/tributario.ts` (rotas /api/tenant/tributario/*)
- `migrations/0005_tributario.sql` (tabelas: apuracoes_das, retencoes, obrigacoes_calendario)
- `src/lib/xml-validator.ts` (valida XML contra XSD oficial — usa libxmljs2)
- `src/dashboard/views/TributarioView.tsx`
- `src/dashboard/views/ObrigacoesView.tsx`

**Tabelas novas:**
```sql
tabelas_simples_anexos    -- ano_calendario, anexo (I-V), faixa_min, faixa_max,
                          -- aliquota_nominal, parcela_deduzir, seed com tabelas 2024+
apuracoes_das             -- tenant_id, competencia, rbt12, aliquota_efetiva,
                          -- valor_das, memoria_calculo JSONB, status
retencoes                 -- tenant_id, competencia, tipo, base_calculo, valor, nf_id
obrigacoes_calendario     -- tenant_id, tipo, competencia, vencimento, status,
                          -- arquivo_gerado_url
```

**Motor de apuração DAS — sequência:**
```
1. Busca NF-es dos últimos 12 meses → soma receita bruta → RBT12
2. Identifica Anexo pelo CNAE em configuracoes_tributarias
3. Calcula fator R se Anexo V (DESTRAVADO EM A5 — requer folha):
   fator_r = folha_12_meses / receita_12_meses
   fator_r >= 28% → Anexo III; caso contrário → Anexo V
   Fallback até existir histórico: configuracoes_tributarias.folha_12m_manual
4. Localiza faixa na tabela do banco pelo RBT12
5. aliquota_efetiva = (RBT12 × aliquota_nominal - parcela_deduzir) / RBT12
6. valor_das = receita_bruta_mes × aliquota_efetiva
7. Deduz ICMS-ST e ISS retido já recolhidos
8. Grava memoria_calculo JSONB completo para auditoria
9. Gera PDF instrução PGDAS-D (pgdas-guide.ts)
10. Guarda de sublimite: se RBT12 > R$ 3,6M, BLOQUEAR a apuração com alerta
    (ICMS/ISS saem do DAS na 6ª faixa — fora do escopo do MVP)
```

**Retenções na fonte:**
```
IRRF: 1,5% a 4,65% conforme tipo de serviço (tabela IN RFB 2.110/2022 ou posterior)
INSS retido: 11% — cessão de mão de obra
ISS retido: alíquota do município do tomador (tabela por município em configuracoes_tributarias)
```

**Tarefas:**
1. Seed das tabelas Anexo I–V 2024 em `migrations/0005_tributario.sql` — não hardcoded no código
2. Motor de apuração DAS com fator R e memória de cálculo completa em JSONB
3. Relatório de conferência DCTFWeb: a declaração é gerada AUTOMATICAMENTE no e-CAC
   a partir do eSocial S-1299 + EFD-Reinf transmitidos pelo cliente — NÃO existe XML
   de DCTFWeb a enviar. O relatório lista os valores que devem aparecer "em andamento"
   no e-CAC (INSS folha, retenções) para o cliente conferir antes de transmitir e emitir o DARF
4. Regra de conferência no relatório: se valores divergirem, corrigir eSocial/Reinf primeiro — nunca forçar a guia
5. Eventos EFD-Reinf: R-2010 (serviços tomados), R-2020 (serviços prestados), R-4010 (rendimentos PF)
6. PDF instrução PGDAS-D: valores calculados + capturas de tela anotadas indicando onde digitar no portal + link direto para `www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATBHE/pgdas-d`
7. Calendário de obrigações: gera entradas em `obrigacoes_calendario` para os próximos 12 meses com vencimentos corretos; dispara alertas 60/30/15/7/1 dia antes via Bull job
8. `TributarioView.tsx`: apuração do mês atual com resumo DAS + botão "Gerar instrução PGDAS-D" + download do relatório de conferência DCTFWeb
9. `ObrigacoesView.tsx`: calendário visual por mês com status (pendente / arquivo gerado / confirmado pelo cliente)

**Entregável:** PR com motor DAS calculando corretamente para Anexo I (comércio) e III (serviços com fator R). Relatório de conferência DCTFWeb exportando em PDF. PDF instrução PGDAS-D exportando. Calendário de obrigações com alertas.

**Smoke test obrigatório:**
```bash
# Inserir 12 meses de NF-e fictícias para tenant de teste
# Rodar apuração
curl -X POST /api/tenant/tributario/apurar \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"competencia": "2026-05"}'
# Verificar: aliquota_efetiva coerente, memoria_calculo presente, PDF gerado
```

**Não escopo:** folha de pagamento, eSocial, deploy.

---

### A5.dp-folha — Departamento Pessoal: Folha de Pagamento

**Esforço:** 12-14h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#departamento-pessoal`

**Pré-requisito:** tabelas INSS e IRRF do ano vigente no banco (seed em migration).

**Arquivos:**
- `src/dp/payroll-engine.ts` (motor de cálculo de folha)
- `src/dp/tabelas-dp.ts` (lê tabelas INSS/IRRF/SM do banco — NUNCA hardcoded)
- `src/dp/inss-calculator.ts` (cálculo progressivo INSS empregado)
- `src/dp/irrf-calculator.ts` (cálculo progressivo IRRF)
- `src/dp/vt-calculator.ts` (desconto VT — 6% do bruto ou custo real, o menor)
- `src/dp/holerite-generator.ts` (gera PDF holerite com pdf-lib)
- `src/routes/dp.ts` (rotas /api/tenant/dp/*)
- `migrations/0006_dp_folha.sql`
- `src/dashboard/views/FolhaView.tsx`
- `src/dashboard/views/FuncionariosView.tsx`

**Tabelas novas:**
```sql
tabelas_inss_faixas    -- ano, faixa_min, faixa_max, aliquota — seed 2026
tabelas_irrf_faixas    -- ano, base_min, base_max, aliquota, deducao — seed 2026
tabelas_sm             -- ano, valor_sm_nacional — seed 2026
funcionarios           -- (já no schema base; completar campos)
dependentes            -- funcionario_id, nome, cpf, grau, data_nascimento, valido_irrf
pedidos_folha          -- tenant_id, competencia, status, total_bruto, total_liquido,
                       -- total_inss_empregado, total_inss_patronal, total_irrf,
                       -- total_fgts, fechado_em
folha_itens            -- pedido_folha_id, funcionario_id, salario_bruto, extras,
                       -- inss, irrf, vt, outros_descontos, liquido, memoria JSONB
```

**Sequência de cálculo (implementar nesta ordem exata):**
```
1. Salário base
   + horas extras (50% diurnas, 100% noturno/domingo/feriado)
   + adicional noturno (20% sobre hora noturna)
   + insalubridade (10/20/40% × SM nacional — grau mínimo/médio/máximo)
   + periculosidade (30% × salário base)
   = SALÁRIO BRUTO

2. INSS empregado (tabela progressiva por faixas do ano):
   Calcular contribuição por faixa, somar = INSS_EMPREGADO

3. Base IRRF:
   = bruto − inss_empregado
     − (n_dependentes × deducao_por_dependente)    [tabela do ano]
     − pensao_alimenticia                           [se houver]
   Aplicar tabela progressiva IRRF = IRRF

4. VT:
   custo_total_vt = soma de (tarifa × trajetos_ida_volta × dias_uteis)
   desconto_vt = min(6% × salario_bruto, custo_total_vt)
   diferenca_vt = custo_total_vt − desconto_vt    [custo patronal, informativo]

5. Desconto de faltas:
   = (salario_bruto / dias_uteis_mes) × dias_faltados

6. FGTS patronal = 8% × salario_bruto  [custo da empresa — NÃO desconta do empregado]
7. INSS patronal: Simples Nacional → incluso no DAS, informativo apenas

7b. PRÓ-LABORE DOS SÓCIOS (obrigatório — incluir no fechamento mensal):
    INSS contribuinte individual = 11% × pró-labore (retido)
    IRRF pela tabela progressiva sobre (pró-labore − INSS)
    Compõe: eSocial S-1200 categoria 901 + numerador do fator R

8. LÍQUIDO = bruto − inss_empregado − irrf − desconto_vt − faltas − outros_descontos
```

**Tarefas:**
1. Seed tabelas INSS 2026, IRRF 2026, SM 2026 em `migrations/0006_dp_folha.sql`
2. Motor de cálculo: recebe `funcionario_id + competencia + extras[]` → retorna `FolhaItem` com memória completa
3. Fechamento de folha: cria `pedidos_folha` + `folha_itens` para todos os funcionários ativos + pró-labore de cada sócio ativo do tenant
3b. Ao fechar a folha, recalcular e persistir o fator R acumulado — destrava Anexos III/V no motor do A4
4. Holerite PDF por funcionário: layout formal com cabeçalho da empresa, discriminação de proventos e descontos, assinatura
5. Relatório consolidado de folha: PDF com todos os funcionários, totais INSS/IRRF/FGTS por funcionário e global
6. Exportação de totais para DCTFWeb: atualiza automaticamente a base de cálculo no módulo tributário (A4)
7. `FuncionariosView.tsx`: CRUD completo com campos legais obrigatórios (CPF, PIS, CBO, etc.) + upload de documentos de admissão com checklist
8. `FolhaView.tsx`: seleção de competência → lançamento de extras → cálculo → preview → fechar folha → download holerites em ZIP

**Entregável:** PR com cálculo de folha correto para ao menos 3 cenários:
- Funcionário simples (salário mínimo, sem dependentes, com VT)
- Funcionário com 2 dependentes, pensão e hora extra diurna
- Funcionário com insalubridade grau médio e falta de 1 dia

**Não escopo:** férias, 13º, rescisão, eSocial.

---

### A6.dp-ferias-13 — Férias e 13º Salário

**Esforço:** 8-10h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#departamento-pessoal` (seções vacation-manager e thirteenth-salary-manager)

**Arquivos:**
- `src/dp/vacation-manager.ts`
- `src/dp/thirteenth-manager.ts`
- `src/dp/aviso-ferias-generator.ts` (PDF aviso de férias)
- `src/dp/recibo-ferias-generator.ts` (PDF recibo)
- `src/dp/recibo-decimo-generator.ts` (PDF recibo 13º)
- `src/routes/dp-ferias.ts`
- `src/routes/dp-decimo.ts`
- `migrations/0007_ferias_decimo.sql`
- `src/dashboard/views/FeriasView.tsx`
- `src/dashboard/views/DecimoView.tsx`

**Tabelas novas:**
```sql
funcionario_ferias       -- funcionario_id, periodo_aquisitivo_inicio/fim,
                         -- periodo_concessivo_fim, dias_gozados, dias_vendidos,
                         -- status (aberto/programado/gozado/vencido)
ferias_pagamentos        -- ferias_id, competencia_pagamento, valor_ferias,
                         -- valor_terco, valor_abono, inss, irrf, liquido
funcionario_decimo       -- funcionario_id, ano, avos_1_parcela, avos_2_parcela,
                         -- valor_1_parcela_bruto, valor_1_parcela_liquido,
                         -- valor_2_parcela_bruto, valor_2_parcela_liquido, status
```

**Lógica férias:**
```
Período aquisitivo : admissao_date + 12 meses
Período concessivo : fim_aquisitivo + 12 meses (prazo máximo para conceder)

Alertas automáticos: Bull job diário
  → 60 dias antes do fim do concessivo → notificação INFO
  → 30 dias → WARNING
  → 15 dias → CRITICAL
  → Vencido → BLOQUEANTE (log de auditoria + badge vermelho no dashboard)

Cálculo de férias:
  salario_ferias = salario_base × (dias_ferias / 30)
  terco = salario_ferias / 3
  abono = (salario_ferias / 30) × dias_vendidos  [máx 10 dias]
  bruto_total = salario_ferias + terco + abono
  inss = calcular_inss(bruto_total)    [tabela progressiva]
  base_irrf = bruto_total − inss
  irrf = calcular_irrf(base_irrf)
  liquido = bruto_total − inss − irrf

  Pagamento: até 2 dias ANTES do início das férias
  Aviso: mínimo 30 dias antes do início
```

**Lógica 13º salário:**
```
Avos = meses trabalhados com ≥ 15 dias no ano
       (admissão ou demissão durante o ano → proporcional)

1ª parcela (antecipação — entre fevereiro e novembro):
  bruto = (salario_base / 12) × avos_ate_junho
  inss_1 = calcular_inss(bruto)   [progressivo]
  NÃO calcular IRRF na 1ª parcela
  liquido_1 = bruto − inss_1

2ª parcela (pagar até 20/dezembro):
  bruto_total_13 = (salario_base / 12) × avos_totais_ano
  inss_2 = calcular_inss(bruto_total_13) − inss_1   [complemento]
  base_irrf = bruto_total_13 − inss_total_13
  irrf = calcular_irrf(base_irrf)   [tabela anual — NÃO a mensal]
  liquido_2 = bruto_total_13 − inss_total_13 − irrf − valor_1_parcela_liquido
```

**Tarefas:**
1. Cálculo de férias com todos os cenários: sem abono, com abono, proporcional (demitido)
2. PDFs: Aviso de Férias (layout formal com datas) + Recibo de Férias (discriminado)
3. Bull job de alertas de vencimento de férias: dispara notificação interna no tenant
4. Cálculo de 13º com avos proporcionais para admissões e demissões no ano
5. PDFs de recibo de 1ª e 2ª parcela do 13º
6. Integrar cálculo de férias e 13º como input para eSocial (A8): gerar evento S-2230 ao programar férias
7. `FeriasView.tsx`: calendário de férias por funcionário + botão programar + aviso de vencimentos críticos
8. `DecimoView.tsx`: painel por ano com status da 1ª e 2ª parcela por funcionário + totais

**Entregável:** PR com cálculos corretos para 3 cenários de férias e 3 de 13º (admissão no início do ano, admissão em julho, demissão em outubro). PDFs exportando. Bull jobs de alerta rodando.

---

### A7.dp-rescisao — Rescisão e Admissão Formal

**Esforço:** 8-10h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#departamento-pessoal` (seção termination-calculator)

**Arquivos:**
- `src/dp/termination-calculator.ts`
- `src/dp/trct-generator.ts` (PDF Termo de Rescisão do Contrato de Trabalho)
- `src/dp/admission-checklist.ts`
- `src/routes/dp-rescisao.ts`
- `migrations/0008_rescisoes.sql`
- `src/dashboard/views/RescisaoView.tsx`
- `src/dashboard/views/AdmissaoView.tsx`

**Tabelas novas:**
```sql
rescisoes         -- funcionario_id, tipo, data_comunicacao, data_desligamento,
                  -- aviso_previo_dias, aviso_indenizado (bool), verbas JSONB,
                  -- total_bruto, total_descontos, total_liquido, status, prazo_pagamento
admissao_docs     -- funcionario_id, documento, status (pendente/recebido/verificado),
                  -- updated_at
```

**Tipos de rescisão e verbas:**

```
SEM_JUSTA_CAUSA:
  + saldo_salario (dias trabalhados no mês)
  + aviso_previo (indenizado = 30 dias + 3 dias/ano de serviço, máx 60 dias; ou trabalhado)
  + ferias_vencidas + 1/3 (se houver período vencido não gozado)
  + ferias_proporcionais + 1/3
  + 13_proporcional
  + fgts_saldo (8% × remunerações do contrato — calculado pelo sistema mas recolhido via FGTS Digital)
  + multa_fgts (40% do saldo FGTS)

PEDIDO_DEMISSAO:
  + saldo_salario
  + ferias_vencidas + 1/3
  + ferias_proporcionais + 1/3
  + 13_proporcional
  − aviso_previo (desconto de 30 dias se não cumprido)
  SEM multa FGTS

JUSTA_CAUSA:
  + saldo_salario
  + ferias_vencidas + 1/3 (somente as vencidas)
  SEM ferias_proporcionais, SEM 13_proporcional, SEM aviso, SEM multa FGTS

ACORDO_484A:   (art. 484-A CLT)
  + saldo_salario
  + metade do aviso indenizado
  + 80% da multa FGTS
  + ferias_vencidas + 1/3
  + ferias_proporcionais + 1/3
  + 13_proporcional

TERMINO_CONTRATO:
  + saldo_salario
  + ferias (vencidas + proporcionais) + 1/3
  + 13_proporcional
  + FGTS (sem multa)
```

**Prazo de pagamento (crítico — gerar alerta imediatamente):**
```
Demissão sem justa causa / pedido / justa causa / acordo:
  → prazo = data_comunicacao + 10 dias corridos
  Gerar alerta IMEDIATO no dashboard ao abrir rescisão.
  Se data > prazo → badge VERMELHO + log de auditoria.
  Penalidade por atraso: 1 salário mínimo por dia (art. 477 §8º CLT)
```

**Checklist de admissão:**
```
Documentos obrigatórios por categoria:
  Identidade: RG ou CNH
  CPF (ou CNPJ se PJ — verificar tipo de contrato)
  PIS/PASEP (ou cadastrar se primeiro emprego)
  Carteira de Trabalho Digital (eCTPS — verificar no eSocial)
  Comprovante de residência recente (até 3 meses)
  Comprovante de escolaridade
  Foto 3×4 recente
  Certidão de nascimento/casamento
  Dados bancários (conta corrente ou poupança)
  ASO (Atestado de Saúde Ocupacional) — gera evento S-2220
  Dados para IRRF: declaração de dependentes + pensão alimentícia
  Dados VT: trajeto, linhas, tarifas
```

**Tarefas:**
1. Cálculo correto para os 5 tipos de rescisão com memória de cálculo em JSONB
2. PDF TRCT: layout oficial com todos os campos, verbas discriminadas, assinaturas
3. Alerta imediato de prazo de pagamento: Bull job verificação diária + badge no dashboard
4. Checklist de admissão: CRUD com status por documento + alerta de pendências
5. Integração com eSocial (A8): ao salvar rescisão, gerar evento S-2299 (desligamento); ao concluir admissão, gerar S-2200
6. `RescisaoView.tsx`: seleção de tipo → cálculo ao vivo → prazo de pagamento destacado → download TRCT
7. `AdmissaoView.tsx`: wizard de admissão com checklist + validação CPF/PIS na RF

**Entregável:** PR com os 5 tipos de rescisão calculando corretamente. TRCT PDF exportando. Checklist de admissão com status. Alertas de prazo funcionando.

---

### A8.esocial — eSocial S-1.3

**Esforço:** 10-12h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#esocial`

**Pré-requisitos técnicos (verificar antes de invocar):**
- XSDs oficiais S-1.3 baixados de `https://www.esocial.gov.br/download.aspx` em `assets/xsd/esocial/`
- NT 06/2026 aplicada (mudanças em S-1200, S-2190, S-2299, S-2500)

**Arquivos:**
- `src/esocial/event-factory.ts` (fábrica central de eventos)
- `src/esocial/events/s1000.ts` … `s2240.ts` (um arquivo por evento)
- `src/esocial/xsd-validator.ts` (valida XML contra XSD com libxmljs2)
- `src/esocial/xml-signer.ts` (assina XML com certificado — mas certificado É DO CLIENTE, não do SaaS)
- `src/routes/esocial.ts`
- `migrations/0009_esocial.sql`
- `src/dashboard/views/eSocialView.tsx`
- `assets/xsd/esocial/` (XSDs locais — não buscar em runtime, usar locais)

**Tabelas novas:**
```sql
esocial_eventos   -- tenant_id, evento_codigo (S-1000…), competencia,
                  -- xml_gerado (text), status (gerado/validado/transmitido/erro),
                  -- protocolo_transmissao, erro_validacao, gerado_at, transmitido_at
```

**Eventos a implementar:**

| Evento | Gatilho no sistema |
|--------|-------------------|
| S-1000 | Onboarding ou alteração de dados da empresa |
| S-1005 | Cadastro ou alteração de estabelecimento |
| S-1020 | Cadastro de lotação tributária |
| S-2200 | Conclusão do checklist de admissão (A7) |
| S-2190 | Admissão preliminar (urgência — dados mínimos) |
| S-2205 | Atualização de dados cadastrais do funcionário |
| S-2206 | Alteração de cargo, salário ou jornada |
| S-2230 | Programação de férias (A6) ou lançamento de atestado |
| S-2299 | Rescisão finalizada (A7) |
| S-1200 | Fechamento de folha mensal (A5) — prazo dia 15 |
| S-1299 | Fechamento dos eventos periódicos — prazo dia 15 |
| S-2210 | Cadastro de acidente de trabalho (CAT) |
| S-2220 | ASO resultado — admissional, periódico, demissional |
| S-2240 | Cadastro de riscos ocupacionais (pré S-2200) |

**Regras de geração:**
```
1. Event factory recebe dados do sistema (funcionário, folha, etc.)
2. Monta XML conforme schema S-1.3
3. Valida contra XSD local → se inválido: grava erro em esocial_eventos.erro_validacao
   e exibe campo específico + mensagem em português ao usuário
4. XML válido → disponível para download
5. Campo xml_signer.ts: prepara o XML para assinatura
   MAS NÃO ASSINA — a assinatura é feita pelo cliente com seu certificado.
   Sistema gera o XML "pré-assinatura" com placeholder para o elemento Signature.
6. Guia visual de transmissão gerado como PDF para cada evento
```

**Tarefas:**
1. Download e armazenamento local dos XSDs S-1.3 em `assets/xsd/esocial/`
2. Validator XSD com mensagens de erro em português mapeando o campo incorreto
3. Factory de eventos: cada evento tem sua classe com método `build(data): string` (XML)
4. Integração com triggers: A5 fecha folha → gera S-1200 + S-1299; A6 programa férias → gera S-2230; A7 finaliza rescisão → gera S-2299; A7 finaliza admissão → gera S-2200
5. `eSocialView.tsx`: tabela de eventos por mês com status, botão download XML, botão "marcar como transmitido" (cliente registra protocolo), badge de vencimento
6. Bull job: alerta 3 dias antes do vencimento dos periódicos (S-1200, S-1299 → dia 15)
7. Guia PDF de transmissão: capturas anotadas do portal eSocial Empresas para cada tipo de evento

**Entregável:** PR com todos os 14 eventos gerando XML válido. Validação XSD passando. Download funcional no dashboard. Integração com triggers dos módulos anteriores.

---

### A9.testes-simul — Testes E2E + Simulação de Dados

**Esforço:** 10-12h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#skills` (skill-creator)

**Arquivos:**
- `vitest.config.ts`
- `playwright.config.ts`
- `tests/api/auth.test.ts`
- `tests/api/tenant-isolation.test.ts`
- `tests/api/fiscal-apuracao.test.ts`
- `tests/api/payroll.test.ts`
- `tests/api/esocial-validation.test.ts`
- `tests/api/webhook-nfeio.test.ts`
- `tests/e2e/onboarding.spec.ts`
- `tests/e2e/folha-completa.spec.ts`
- `scripts/simulate.ts`
- `src/dashboard/views/RelatoriosView.tsx`

**Setup de testes:**
```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0",
    "@playwright/test": "^1.45.0"
  }
}
```

**Golden tests fiscais (obrigatórios):** suíte `tests/golden/` com casos validados
manualmente contra o PGDAS-D real. O motor é testado contra valores CONFIRMADOS na fonte,
não contra valores que o próprio desenvolvedor calculou. Caso inicial já validado:
RBT12 R$ 780.000, Anexo I, 3ª faixa → alíquota efetiva 7,72%, DAS R$ 5.018 sobre R$ 65.000.
Mínimo de 5 casos cobrindo faixas 1–4 do Anexo I e fator R nos dois lados do corte de 28%.

**Caminhos críticos (cobertura com profundidade — não cobertura global):**

| Arquivo de teste | O que cobre |
|-----------------|-------------|
| `auth.test.ts` | Login, refresh, expiração, revogação, roles |
| `tenant-isolation.test.ts` | **CRÍTICO:** tenant A não acessa dados do tenant B — testar todas as rotas |
| `fiscal-apuracao.test.ts` | RBT12, faixas Anexo I, III, V com fator R, deduções ST/ISS, memória de cálculo |
| `payroll.test.ts` | INSS progressivo, IRRF, VT, holerite gerado, cenários A/B/C do A5 |
| `esocial-validation.test.ts` | XML válido/inválido contra XSD, todos os 14 eventos |
| `webhook-nfeio.test.ts` | HMAC válido, HMAC inválido, idempotência por `chave_acesso` |
| `onboarding.spec.ts` | E2E: CNPJ → schema criado → dados RF preenchidos → login |
| `folha-completa.spec.ts` | E2E Playwright: login → cadastrar funcionário → fechar folha → baixar holerite → confirmar S-1200 gerado |

**`scripts/simulate.ts` — dados sintéticos:**
```
Para 3 tenants ficticios (CNPJ gerados com dígito verificador válido):
  - Empresa A: comércio, Anexo I, 5 funcionários
  - Empresa B: serviços, Anexo III, fator R = 31%, 2 funcionários
  - Empresa C: serviços, Anexo V, fator R = 24%, 1 funcionário MEI com empregado

Por empresa:
  - 12 meses de NF-e de venda (volume variável para testar faixas diferentes de DAS)
  - 6 meses de NF-e de entrada (fornecedores)
  - Folha de 12 meses por funcionário
  - 2 eventos de férias (1 no prazo, 1 próximo do vencimento)
  - 13º dos últimos 2 anos
  - 1 rescisão por tipo (5 rescisões total, distribuídas entre as empresas)
  - Eventos eSocial correspondentes

Dados gerados: espalhados nos últimos 365 dias para alimentar relatórios e gráficos.
```

**`RelatoriosView.tsx`:**
- Receita bruta por mês (últimos 12 meses) — gráfico linha
- Evolução da alíquota efetiva DAS — gráfico linha
- Encargos da folha por mês — gráfico barra (INSS + FGTS + IRRF)
- Funcionários: admissões e demissões por mês
- Obrigações acessórias: status do mês atual (semáforo)
- Top 5 alertas pendentes (certificado vencendo, férias vencendo, folha não fechada)

**Tarefas:**
1. Setup Vitest + supertest + Playwright + jsdom
2. Implementar todos os testes de caminhos críticos listados
3. `simulate.ts`: gerar dados realistas para 3 tenants
4. Validar isolamento de tenant: garantir que `SET search_path` está em 100% das queries
5. `RelatoriosView.tsx`: consumir endpoints de analytics reais, dados da simulação
6. `npm test` deve retornar 0 ao final do PR

**Entregável:** PR com suite de testes verde. `npm run simulate` populando 3 tenants. `RelatoriosView.tsx` exibindo dados reais da simulação.

**Cobertura observada (não gate):** AR reporta % em cada rodada. Caminhos críticos devem ter 100%. Dashboard sem teste obrigatório.

---

### A10.deploy — VPS Hostinger + Nginx + PM2 + Cloudflare + Backup

**Esforço:** 8-10h.
**Spec:** `.claude/PLANO_SAAS_CONTABIL.md#stack`

**Pré-requisitos do usuário (cobrar antes de invocar):**
- SSH Hostinger configurado (user + chave)
- Domínio registrado com NS apontando para Cloudflare
- Conta Cloudflare com Tunnel configurado para o VPS
- Conta R2 (Cloudflare) ou B2 (Backblaze) + credenciais de acesso
- UptimeRobot conta gratuita

**Arquivos:**
- `nginx/saas-contabil.conf` (reverse proxy + SSL Full Strict)
- `nginx/tenant-routing.conf` (wildcard subdomínio → backend)
- `ecosystem.config.cjs` (PM2 cluster)
- `scripts/deploy.sh` (pull → ci → build → reload PM2 → health check → revert se falhar)
- `scripts/backup.sh` (pg_dump → compressão → upload R2/B2)
- `.github/workflows/deploy.yml` (CI/CD: push main → test → build → SSH deploy)
- `RUNBOOK_RECOVERY.md` (restauração testada + documentada)
- `docker-compose.prod.yml` (PostgreSQL + Redis em produção, sem hot reload)

**Arquitetura de rotas Nginx:**
```
saascontabil.com.br           → Dashboard React (Vite build estático, porta 4173)
api.saascontabil.com.br       → Fastify API (porta 3000)
*.saascontabil.com.br         → Fastify API (porta 3000) — wildcard tenant subdomain
```

**Tarefas:**
1. Nginx: reverse proxy com SSL Full Strict (origin certificate Cloudflare no VPS), wildcard subdomínio para resolução de tenant
2. PM2 ecosystem: cluster mode 2 instances, `max_memory_restart: 512M`, logs rotativos diários
3. `deploy.sh`:
   ```bash
   git pull origin main
   npm ci --omit=dev
   npm run build
   npm run db:migrate          # aplica migrations pendentes
   pm2 reload ecosystem.config.cjs --update-env
   sleep 5
   curl -f https://api.saascontabil.com.br/api/health || pm2 revert
   ```
4. CI/CD GitHub Actions: push em `main` → `npm test` → build → SSH → `deploy.sh`
5. Backup diário com retenção:
   - 7 backups diários
   - 4 backups semanais (domingo)
   - 12 backups mensais (dia 1)
   - Upload R2/B2 com verificação de integridade (md5)
   - Email de status (sucesso/falha + tamanho) para o owner
6. `RUNBOOK_RECOVERY.md`: procedure documentado e **testado** de restauração de backup — incluir tempo estimado e comandos exatos
7. **Staging primeiro:** subir em `novo.saascontabil.com.br` → testar fluxo completo com `npm run simulate` → validar restauração → cutover DNS
8. UptimeRobot: monitorar `/api/health` + domínio raiz a cada 5 min (free tier)

**Entregável:** App rodando em `novo.saascontabil.com.br` atrás do Cloudflare. Backup R2 funcionando com restauração validada e documentada em `RUNBOOK_RECOVERY.md`. PR final com docs de operação.

---

## Passo 5 — Protocolo de fechamento (após A10)

```bash
# Cobertura final (informativa)
npm run test:coverage

# Rotas sem auth (devem ser APENAS /api/public/* + /api/health)
grep -nE "fastify\.(get|post|put|delete)" src/server.ts \
  | grep -vE "public|health|auth"

# Confirmar que nenhuma alíquota está hardcoded
grep -rn "0\.015\|0\.09\|0\.12\|aliquota\s*=\s*0\." src/ \
  | grep -v "test\|spec\|seed\|migration"

# Build limpo
npm run build

# Health check em produção
curl https://api.saascontabil.com.br/api/health

# Backup mais recente
ls -lh backups/ | tail -5
```

Atualizar `docs/RELEASE_NOTES.md`:
- Data de conclusão
- Subagentes executados + entregas
- Cobertura final (informativa)
- URL de produção
- Decisões em aberto não resolvidas
- Pendências conhecidas

---

## AR — Agente Revisor

> Invocado após **cada** subagente (A1–A10) entregar.

**Recebe:** diff completo do subagente + extrato do mapa de estado.

**Avalia em 6 dimensões:**

### 1. Qualidade & padrões
- [ ] Comentários em português brasileiro nas funções não-triviais
- [ ] Identificadores em inglês (camelCase funções, snake_case banco)
- [ ] Sem `console.log` em produção (usar pino logger)
- [ ] TypeScript sem `any` solto nem `as unknown` sem justificativa
- [ ] Sem código comentado sem justificativa

### 2. Segurança
- [ ] Rotas `/api/tenant/*` protegidas por `requireTenant` + `requireRole(key)`
- [ ] Rotas `/api/public/*` com validação rigorosa de input (Zod ou similar)
- [ ] Webhooks validam assinatura HMAC (NFE.io header `x-nfeio-signature`)
- [ ] Queries via Kysely typed builders — ZERO string concatenation SQL
- [ ] Sem credenciais hardcoded — tudo via `process.env` com validação no boot
- [ ] Isolamento de tenant: TODA query usa `SET search_path = tenant_{id}` ou equivalente

### 3. Banco de dados
- [ ] FKs declaradas em todas as relações
- [ ] Índices em colunas usadas em WHERE frequente (competencia, tenant_id, status)
- [ ] Operações multi-step em transação (`db.transaction().execute(...)`)
- [ ] Migrations forward-only — sem DROP destrutivo
- [ ] Nenhuma alíquota ou tabela fiscal como constante no código — apenas no banco

### 4. Compliance legal
- [ ] Sistema NUNCA armazena arquivo de certificado digital
- [ ] XMLs gerados para transmissão governamental não são transmitidos automaticamente
- [ ] Memória de cálculo JSONB presente em toda apuração fiscal e folha
- [ ] Alertas de prazo implementados para obrigações com vencimento legal
- [ ] Limite legal documentado em comentário quando comportamento é específico da legislação

### 5. Frontend & UX
- [ ] Loading + error tratados em todo fetch (sem tela branca em erro)
- [ ] Feedback visual claro quando ação requer atividade do cliente (ex: transmitir eSocial)
- [ ] Acessibilidade básica (aria-label, navegação Tab, contraste mínimo WCAG AA)
- [ ] Consistência visual com Tailwind v4 (sem inline styles avulsos)
- [ ] Sem `any` em props React

### 6. Consistência com spec
- [ ] `.claude/PLANO_SAAS_CONTABIL.md` referenciado nos comentários de lógica fiscal
- [ ] Decisões arquiteturais do plano respeitadas (schema-per-tenant, transmissão delegada, etc.)
- [ ] Schema novo segue convenções das migrations anteriores
- [ ] `docs/sprint-SXX-progress.md` criado/atualizado para o sprint entregue

### Veredito

```
APROVADO  → Orchestrator faz merge e invoca AT
DEVOLVIDO → AR emite relatório com:
              - Dimensão(ões) com falha
              - Itens específicos a corrigir
              - Sugestão de correção por item
            → Orchestrator repassa ao mesmo subagente para correção
            → Reentrega → AR reavalia (ciclo até aprovação)
```

---

## AT — Agente de Testes (incremental)

> Invocado após cada subagente aprovado pelo AR.
> **Cobertura é métrica observada — não gate de merge.**

**Regra:** AT escreve testes para os caminhos críticos do diff aprovado.
Não tenta cobertura global. Reporta:
- Lista de casos cobertos
- Cobertura % (informativa)
- Caminhos críticos sem teste (dívida explícita)

**Caminhos críticos por subagente:**

| Subagente | Caminhos críticos obrigatórios |
|-----------|-------------------------------|
| A1.fundacao | Auth JWT (login, refresh, expiração), isolamento de tenant (schema correto por request), onboarding CNPJ |
| A2.integracao | Webhook HMAC válido/inválido, idempotência por chave_acesso, normalização canônica dos 5 canais |
| A3.fiscal | Classificação CFOP, campos IBS/CBS na emissão, alerta de irregularidade em NF recebida |
| A4.tributario | Cálculo DAS Anexo I/III/V, fator R (>28% e <28%), memória de cálculo JSONB, relatório DCTFWeb correto |
| A5.dp-folha | INSS progressivo 3 faixas, IRRF com dependente, VT com cap 6%, fechamento de folha multi-funcionário |
| A6.dp-ferias-13 | Férias proporcional, abono pecuniário, 13º com avos (admissão julho), alertas de vencimento |
| A7.dp-rescisao | 5 tipos de rescisão com verbas corretas, prazo de pagamento calculado, TRCT gerado |
| A8.esocial | 14 eventos XML validando contra XSD, evento S-1200 gerado ao fechar folha, erro de validação em português |
| A9.testes-simul | Suite E2E verde, simulate populando 3 tenants, isolamento tenant-A vs tenant-B |
| A10.deploy | Health check, deploy.sh com revert, backup com restauração documentada |

---

## Referência rápida

| Subagente | Foco | Depende de | Esforço |
|-----------|------|-----------|--------|
| A1.fundacao | Multi-tenant, Auth JWT, Schema base | — | 10-12h |
| A2.integracao | Integração universal NF-e (REST/webhook/CSV/polling) | A1 | 8-10h |
| A3.fiscal | NF-e/NFC-e emissão + recepção + Reforma Tributária | A2 | 8-10h |
| A4.tributario | Apuração DAS (Anexos I/II), relatório DCTFWeb, EFD-Reinf | A3 | 10-12h |
| A5.dp-folha | Folha mensal completa com INSS/IRRF/VT + holerite PDF | A4 | 12-14h |
| A6.dp-ferias-13 | Férias + 13º salário com alertas e PDFs | A5 | 8-10h |
| A7.dp-rescisao | 5 tipos de rescisão + TRCT + checklist admissão | A6 | 8-10h |
| A8.esocial | 14 eventos eSocial S-1.3 validados + integração DP | A7 | 10-12h |
| A9.testes-simul | Vitest + Playwright + simulação 3 tenants + relatórios | A8 | 10-12h |
| A10.deploy | VPS + Nginx wildcard + PM2 + backup R2 + CI/CD | A9 | 8-10h |
| AR | Revisão 6 dimensões | cada entrega | distribuído |
| AT | Testes caminhos críticos incrementais | cada AR aprovado | embutido |

**Esforço total estimado:** ~94–114h

---

## Decisões em aberto (resolver antes do sprint indicado)

| Decisão | Antes de | Opções |
|---------|----------|--------|
| Módulo de estoque vinculado às NF-es? | A3 | A) Rastrear entradas/saídas por NCM. B) Fiscal puro. C) Opcional por tenant. |
| Provider NF-e alternativo se NFE.io for inviável? | A2 | Focus NFe, eNotas, Plugnotas — definir a interface de abstração agora. |
| Suporte a Lucro Presumido no futuro? | A1 | Afeta motor de cálculo. Prever extensão no schema `configuracoes_tributarias`. |
| Módulo financeiro (CP/CR)? | Roadmap | Aumenta escopo mas cria diferencial. Decidir antes de A9 para incluir nos relatórios. |
| Modelo de precificação por tier? | A1 | Por tenant flat? Por funcionário? Por volume de NF? Impacta a tabela `planos`. |
| Notificações: e-mail ou WhatsApp? | A4 | SMTP próprio (nodemailer) vs Evolution API (já usado em outros projetos do solicitante). |
