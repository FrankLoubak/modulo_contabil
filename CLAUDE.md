# CLAUDE.md — Instruções Consolidadas (SaaS Contábil)

> Documento mestre de instruções para o agente. Consolida e substitui todos os
> arquivos de instrução anteriores neste repositório.
>
> **Assinado:** Frank Loubak | Maio 2026

---

## Índice

1. [Princípios de Precisão e Integridade](#1-princípios-de-precisão-e-integridade)
2. [Contexto e Stack do Projeto](#2-contexto-e-stack-do-projeto)
3. [Leis Fundamentais — Compliance Legal](#3-leis-fundamentais--compliance-legal)
4. [Padrões de Código Obrigatórios](#4-padrões-de-código-obrigatórios)
5. [Arquitetura Multi-Tenant](#5-arquitetura-multi-tenant)
6. [Integrações com APIs Externas](#6-integrações-com-apis-externas)
7. [Regras Fiscais e Tributárias](#7-regras-fiscais-e-tributárias)
8. [Otimização de Contexto (Claude Code)](#8-otimização-de-contexto-claude-code)
9. [Orchestrator — SaaS Contábil](#9-orchestrator--saas-contábil)
10. [Erros Resolvidos e Lições Aprendidas](#10-erros-resolvidos-e-lições-aprendidas)
11. [Behavioral Guidelines (Anti-Mistake)](#11-behavioral-guidelines-anti-mistake)
12. [Examples (Os Quatro Princípios na Prática)](#12-examples-os-quatro-princípios-na-prática)

---

## 1. Princípios de Precisão e Integridade

### Princípio Fundamental

Você é comprometido com a **verdade e a precisão acima de qualquer outra coisa**, inclusive acima de ser útil. Uma resposta errada dada com confiança é pior do que nenhuma resposta.

### As 8 Regras

1. **INCERTEZA** — Se não tiver certeza, diga claramente. Use "não tenho certeza, mas…" ou "talvez seja melhor verificar isso…". Nunca apresente suposições como fatos.
2. **FONTES** — Nunca invente títulos de artigos, autores, URLs ou referências. Se não conseguir citar uma fonte real, diga: "não tenho uma fonte verificada para isso."
3. **ESTATÍSTICAS** — Sinalize qualquer número sobre o qual não tenha 100% de confiança. Use "aproximadamente" e recomende verificação em fonte primária.
4. **EVENTOS RECENTES** — Avise quando um assunto pode ter mudado desde seu corte de conhecimento. Não apresente informações desatualizadas como atuais.
5. **PESSOAS/CITAÇÕES** — Nunca atribua frase a pessoa real sem certeza absoluta de que ela disse aquilo.
6. **CÓDIGO/TÉCNICO** — Nunca invente nomes de funções, métodos de bibliotecas ou sintaxe de API. Se não tiver certeza de que uma função existe, diga para verificar na documentação atual.
7. **LACUNAS** — Não preencha contexto ausente com suposições. Se algo estiver pouco claro, faça uma pergunta de esclarecimento antes de responder.
8. **APIs EXTERNAS** — SEMPRE peça documentação antes de implementar (não é bloqueante). Ver §6.

---

## 2. Contexto e Stack do Projeto

- **Produto:** SaaS multi-tenant que substitui integralmente um escritório contábil para empresas do **Simples Nacional**
- **Idioma de comunicação:** Português (BR)
- **Código:** identificadores em **inglês**, comentários em **português brasileiro**
- **Convenção de arquivos:** kebab-case
- **Commits:** inglês (Conventional Commits)

### Stack consolidada

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Node.js + **Fastify 4** + TypeScript estrito + `tsx` |
| Query builder | **Kysely** (typed, sem ORM) |
| Banco de dados | **PostgreSQL 17** (schema-per-tenant) |
| Fila assíncrona | **Bull + Redis** |
| Frontend dashboard | **React 19** + TypeScript + **Vite** + **Tailwind v4** + **Lucide** |
| Logger | **pino** (estruturado — sem `console.log` em produção) |
| Geração de PDF | **pdf-lib** (npm) |
| Geração de XML | **xmlbuilder2** (npm) |
| Validação XSD | **libxmljs2** (npm) |
| Integração NF-e | **NFE.io REST API** |
| Autenticação | **JWT** (access 15min + refresh 30d) + RBAC por tenant |
| Migrations | SQL puros em `migrations/` + runner `migrations/migrate.ts` (forward-only) |
| Testes | **Vitest** + `@testing-library/react` + **supertest** + **Playwright** (E2E) |
| Infra | Hostinger VPS + Docker Compose + Nginx + PM2 |
| CI/CD | GitHub Actions |
| APIs externas | NFE.io, eSocial gov.br, Receita Federal |

---

## 3. Leis Fundamentais — Compliance Legal

> ⚠️ Estas regras **nunca podem ser violadas** em nenhuma circunstância.
> Qualquer subagente ou pull request que viole uma delas deve ser **imediatamente devolvido**.

### Lei 1 — Certificados digitais

O sistema **NUNCA** armazena o arquivo de certificado digital (A1 ou A3) dos clientes.
A tabela `certificado_referencia` contém **apenas metadados**: validade, tipo, titular, emissora.

```sql
-- ✅ CORRETO — apenas metadados
certificado_referencia (validade DATE, tipo VARCHAR, titular VARCHAR, emissora VARCHAR)

-- ❌ PROIBIDO — jamais fazer isso
certificado_referencia (arquivo BYTEA, pfx_base64 TEXT, senha VARCHAR)
```

### Lei 2 — Transmissão governamental

O sistema **prepara** os arquivos; o **cliente transmite** com seu próprio certificado.
Nunca criar código que transmita automaticamente para: eSocial, EFD-Reinf, PGDAS-D, FGTS Digital. (A DCTFWeb sequer recebe arquivo do contribuinte — é gerada no e-CAC a partir do eSocial/Reinf.)

```typescript
// ✅ CORRETO — disponibilizar para download
return res.send({ xml: gerarXmlESocial(evento), filename: `${evento.codigo}.xml` })

// ❌ PROIBIDO — transmissão automática
await transmitirESocial(xml, certificadoDoCliente)  // NÃO FAZER
```

### Lei 3 — Alíquotas e tabelas fiscais

Alíquotas, faixas de imposto, parcelas de dedução e quaisquer valores fiscais devem residir
**exclusivamente em banco de dados**, versionados por `ano_calendario`.
Nunca como constante, enum ou objeto literal no código.

**Tabelas de legislação NACIONAL ficam no schema PÚBLICO** (`tabelas_simples_anexos`,
`tabelas_inss_faixas`, `tabelas_irrf_faixas`, `tabelas_sm`, `aliquotas_rt`) — são idênticas
para todos os tenants; mudança de lei = 1 UPDATE auditável. No schema do tenant fica apenas
o que é específico dele (`configuracoes_tributarias`).

```typescript
// ✅ CORRETO — sempre do banco, versionado
const faixas = await db
  .selectFrom('tabelas_simples_anexos')
  .where('ano_calendario', '=', anoAtual)
  .where('anexo', '=', tenant.anexo)
  .selectAll()
  .execute()

// ❌ PROIBIDO — constante no código
const ALIQUOTA_SIMPLES_COMERCIO = 0.04   // NÃO FAZER
const FAIXA_INSS = [{ min: 0, max: 1518, aliq: 0.075 }]  // NÃO FAZER
```

### Lei 4 — Isolamento de tenant

Toda query deve operar no schema correto do tenant.
O middleware de tenant define `SET search_path = tenant_{slug}` antes de qualquer query.
Nenhuma query pode acessar dados de outro tenant.

```typescript
// ✅ CORRETO — middleware já configurou search_path antes desta linha
const notas = await db.selectFrom('notas_fiscais').selectAll().execute()

// ❌ PROIBIDO — query sem resolução de tenant
const notas = await db
  .selectFrom('tenant_empresa_xyz.notas_fiscais')  // hardcoded — NÃO FAZER
  .selectAll().execute()
```

---

## 4. Padrões de Código Obrigatórios

- Comentários em **português brasileiro** nas funções não-triviais
- Identificadores em **inglês** (camelCase funções, snake_case banco de dados)
- **TypeScript estrito** — sem `any` solto, sem `as unknown` sem justificativa comentada
- Sem `console.log` em produção — usar `logger.info/warn/error` (pino)
- Sem código comentado sem justificativa (`// TODO` aceitável se datado)
- **Tratamento de erro em todo `fetch`/query** — loading + error tratados no frontend
- Toda rota `/api/tenant/*` protegida por `requireTenant` + `requireRole(key)`
- Rotas `/api/public/*` documentadas como públicas com **validação rigorosa de input** (Zod)
- Webhooks (NFE.io) validam assinatura **HMAC** no header `x-nfeio-signature`
- SQL via Kysely typed builders — **sem string concatenation**
- Sem credenciais hardcoded — tudo via `process.env` com validação no boot
- FKs declaradas em todas as relações
- Índices em colunas usadas em `WHERE` frequente (`competencia`, `status`, `tenant_id`)
- Operações multi-step em transação: `db.transaction().execute(...)`
- Migrations **forward-only** — sem `DROP` destrutivo
- Componentes React extraídos (sem inflar `App.tsx`)
- Acessibilidade básica (`aria-label`, navegação Tab, contraste WCAG AA)
- Memória de cálculo em **JSONB** para toda apuração fiscal e cálculo de folha

---

## 5. Arquitetura Multi-Tenant

### Resolução de tenant

```
subdominio.saascontabil.com.br  →  tenant_id = "subdominio"
header X-Tenant-ID: slug        →  tenant_id = "slug"

Middleware resolve tenant ANTES de qualquer query.
Todas as queries: SET search_path = tenant_{id}
```

### Schema público (compartilhado)

```sql
tenants                -- id, slug, cnpj, razao_social, plano, status
planos                 -- id, nome, limites JSONB (max_funcionarios, max_notas_mes…)
audit_log              -- tenant_id, user_id, action, resource, payload, ip, created_at
tabelas_simples_anexos -- LEGISLAÇÃO NACIONAL: ano, anexo, faixas, alíquotas
tabelas_inss_faixas    -- LEGISLAÇÃO NACIONAL: ano, faixas, alíquotas
tabelas_irrf_faixas    -- LEGISLAÇÃO NACIONAL: ano, faixas, alíquotas, deduções
tabelas_sm             -- LEGISLAÇÃO NACIONAL: ano, salário mínimo
aliquotas_rt           -- LEGISLAÇÃO NACIONAL: Reforma Tributária por ano
```

### Schema por tenant (isolado)

```sql
empresa                    -- CNPJ, razão social, regime, CNAE, endereço fiscal
socios                     -- CPF, nome, percentual, pró-labore
certificado_referencia     -- SÓ METADADOS: validade, tipo, titular (NUNCA o arquivo)
users                      -- email, password_hash, role, status
sessions                   -- user_id, refresh_token_hash, expires_at, ip
configuracoes_tributarias  -- Anexo Simples, fator_r, CNAE, folha_12m_manual
notas_fiscais              -- chave_acesso (UNIQUE), tipo, status, impostos, xml_url
movimentacoes_estoque      -- event log de toda alteração de estoque
funcionarios               -- CPF, PIS, CBO, salario, admissao, tipo_contrato
dependentes                -- funcionario_id, grau, valido_irrf
pedidos_folha              -- competencia, status, totais, fechado_em
folha_itens                -- pedido_folha_id, funcionario_id, bruto, liquido, memoria JSONB
funcionario_ferias         -- periodo_aquisitivo/concessivo, status
ferias_pagamentos          -- valor_ferias, terco, abono, inss, irrf, liquido
funcionario_decimo         -- ano, avos, 1ª/2ª parcela, status
rescisoes                  -- tipo, verbas JSONB, prazo_pagamento
admissao_docs              -- checklist de documentos por funcionário
esocial_eventos            -- codigo, xml_gerado, status, protocolo_transmissao
apuracoes_das              -- competencia, rbt12, aliquota_efetiva, valor_das, memoria JSONB
retencoes                  -- tipo (IRRF/INSS/ISS), base_calculo, valor, nf_id
obrigacoes_calendario      -- tipo, competencia, vencimento, status, arquivo_url
```

---

## 6. Integrações com APIs Externas

### Regra de Ouro (Regra 8): pedir o manual antes de implementar

Ao integrar ou depurar **qualquer** API externa (NFE.io, eSocial, Receita Federal, etc.):

1. **Perguntar ao usuário se há documentação disponível** antes de descobrir campos por tentativa e erro:
   _"Você tem o link da documentação desta API?"_
2. Se o usuário **não** tiver o manual, prosseguir com o projeto normalmente (não é bloqueante).
3. Se o manual **estiver** disponível, ler os endpoints relevantes **antes** de escrever código.
4. Ao primeiro sinal de dificuldade (erro 400, campo rejeitado, payload inválido) — **parar e pedir o manual** antes de iterar no escuro.

### APIs integradas e documentação

| API | Base URL | Documentação |
|-----|----------|-------------|
| NFE.io NF-e produto | `https://api.nfse.io` | `https://nfe.io/docs/desenvolvedores/rest-api/nota-fiscal-de-produto-v2/` |
| NFE.io NFC-e | `https://api.nfse.io` | Mesma doc, endpoint `/nfce` |
| NFE.io Consulta CNPJ | `https://api.nfse.io` | Seção "Companies" da doc |
| eSocial schemas S-1.3 | Portal gov.br | `https://www.esocial.gov.br/download.aspx` (XSDs locais em `assets/xsd/esocial/`) |
| DCTFWeb (conceito) | e-CAC | Declaração gerada automaticamente a partir de eSocial/EFD-Reinf — sem XML próprio |

### Armadilhas conhecidas — NFE.io

> Lições aprendidas em projetos anteriores. Consultar antes de depurar.

- URL base correta: **`https://api.nfse.io`** (com "e" — não `api.nfe.io`)
- Header de autenticação: `Authorization: <token>` — **sem prefixo `Bearer`**
- API v2 usa campos em **inglês**: `buyer`, `name`, `federalTaxNumber`, `unitAmount`, `items`, `payments`
- NCM vai no campo `ncm` (não `hsCode`)
- Simples Nacional obrigatório no bloco `tax` por item: `icms.csosn="400"`, `pis.cst="07"`, `cofins.cst="07"`
- Campo `taxationCode` obrigatório junto do `cfop` (valor `"400"` para CSOSN 400)
- Resultado da emissão: `authorization.accessKey` — não `resultado` nem `chave`
- Formas de pagamento aceitas: `Cash`, `Pix`, `CreditCard`, `DebitCard`

---

## 7. Regras Fiscais e Tributárias

> Estas regras refletem a legislação vigente em maio de 2026.
> Mudanças de lei são frequentes — verificar sempre antes de implementar lógica nova.

### Sequência de cálculo do DAS (Simples Nacional)

```
1. RBT12 = soma de receita bruta dos últimos 12 meses (NF-es autorizadas)
2. Identificar Anexo pelo CNAE (I=comércio, II=indústria, III/IV/V=serviços)
3. Se Anexo V: calcular fator R = folha_12_meses / receita_12_meses
   fator_r >= 28% → usar Anexo III
   fator_r < 28%  → manter Anexo V
   ⚠️ Fator R depende do módulo de folha — implementado APÓS a apuração no roadmap.
   Sprint A4 entrega Anexos I/II; III/V destravam em A5. Fallback: folha_12m_manual.
4. Localizar faixa na tabela do banco pelo RBT12
5. aliquota_efetiva = (RBT12 × aliquota_nominal - parcela_deduzir) / RBT12
6. valor_das = receita_bruta_mes × aliquota_efetiva
7. Deduzir ICMS-ST e ISS retido já recolhidos
8. Gravar memoria_calculo JSONB completo (obrigatório para auditoria)
9. Guarda de sublimite: RBT12 > R$ 3,6M → BLOQUEAR apuração com alerta
   (6ª faixa tira ICMS/ISS do DAS — fora do escopo do MVP)
```

### Sequência de cálculo da folha

```
1. SALÁRIO BRUTO = salário_base + extras + adicionais
2. INSS empregado: progressivo por faixas da tabela do banco (ano vigente)
3. Base IRRF = bruto - inss - (dependentes × deducao) - pensao_alimenticia
4. IRRF: progressivo pela tabela do banco (ano vigente)
5. Desconto VT = min(6% × bruto, custo_real_VT)
6. Desconto faltas = (bruto / dias_uteis) × dias_faltados
7. FGTS = 8% × bruto [custo patronal — NÃO desconta do empregado]
8. INSS patronal: no Simples Nacional está incluso no DAS [informativo]
9. PRÓ-LABORE DOS SÓCIOS (obrigatório no fechamento mensal):
   INSS 11% retido (contribuinte individual) + IRRF tabela progressiva
   → eSocial S-1200 categoria 901 → compõe o numerador do fator R
10. LÍQUIDO = bruto - inss - irrf - vt - faltas - outros_descontos
11. Gravar memoria JSONB completo no folha_itens
12. Ao fechar a folha, recalcular fator R acumulado (destrava Anexos III/V)
```

### Reforma Tributária — estado atual (2026)

| Campo na NF | Obrigatoriedade | Valor 2026 |
|-------------|----------------|-----------|
| `ibs` | Obrigatório desde jan/2026 | 0,1% |
| `cbs` | Obrigatório desde jan/2026 | 0,9% |
| `pis`/`cofins` | Ainda ativos em 2026 | Conforme Simples/Anexo |

> ⚠️ As alíquotas de 2027 em diante ainda podem mudar por legislação complementar.
> Sempre ler de `aliquotas_rt` pelo `ano_calendario` — nunca hardcoded.

### eSocial — prazos críticos (S-1.3)

| Evento | Prazo |
|--------|-------|
| S-2200 (admissão) | Até o dia **anterior** ao início das atividades |
| S-2299 (desligamento) | Até o **dia do desligamento** |
| S-1200 (remuneração) | Até o **dia 15** do mês seguinte |
| S-1299 (fechamento periódicos) | Até o **dia 15** do mês seguinte |
| S-2210 (CAT acidente) | Até **1 dia útil** após o acidente |
| S-2230 (afastamento/férias) | Até o **início do afastamento** |

### Prazo de rescisão (crítico — art. 477 §8º CLT)

```
Prazo de pagamento = data_comunicacao + 10 dias corridos
Penalidade por atraso = 1 salário mínimo por dia
→ Gerar alerta IMEDIATO ao abrir rescisão
→ Badge vermelho no dashboard se prazo vencido
→ Gravar em audit_log se pagamento em atraso
```

### Runbook de atualização legislativa

> O risco "lei mudou e ninguém percebeu" não se resolve só com tabela versionada.
> Processo manual obrigatório, registrado em `docs/RUNBOOK_LEGISLACAO.md`:

```
JANEIRO (todo ano, até dia 15):
  [ ] Tabela INSS — conferir faixas no site da Previdência → UPDATE tabelas_inss_faixas
  [ ] Tabela IRRF — conferir na RFB → UPDATE tabelas_irrf_faixas
  [ ] Salário mínimo nacional → UPDATE tabelas_sm
  [ ] Alíquotas Reforma Tributária do ano → UPDATE aliquotas_rt
  [ ] Rodar golden tests fiscais após cada UPDATE — devem continuar passando
      para os anos anteriores e refletir os novos valores no ano corrente

A CADA NOTA TÉCNICA do eSocial:
  [ ] Baixar novos XSDs → assets/xsd/esocial/ (versionado no git)
  [ ] Rodar suite esocial-validation — eventos devem validar contra o novo schema

A CADA mudança de layout NF-e/NFC-e (NTs da ENCAT):
  [ ] Conferir changelog da NFE.io — o provider absorve a maioria das mudanças
```

### O que o sistema PODE e NÃO PODE fazer

```
✅ PODE:
  - Calcular e exibir valores de impostos e encargos
  - Gerar XMLs validados para transmissão (eSocial, DCTFWeb, EFD-Reinf)
  - Emitir NF-e/NFC-e via NFE.io com credenciais do próprio cliente
  - Gerar holerites, recibos, TRCT, avisos de férias (documentos internos)
  - Alertar sobre prazos e inconsistências fiscais
  - Consultar CNPJ e CPF na Receita Federal via NFE.io

❌ NÃO PODE (requer ação do cliente com certificado):
  - Transmitir eventos eSocial
  - Enviar DCTFWeb ou EFD-Reinf
  - Pagar ou confirmar DAS no PGDAS-D
  - Assinar documentos com validade jurídica
  - Representar a empresa perante órgãos governamentais
```

---

## 8. Otimização de Contexto (Claude Code)

**Objetivo:** reduzir consumo de tokens e melhorar precisão das respostas.

### `.claudeignore` recomendado

```
node_modules/**
dist/**
build/**
.git/**
*.log
*.lock
*.tmp
.DS_Store
assets/xsd/**
*.png
*.jpg
*.svg
*.woff
*.woff2
coverage/**
```

### Diretrizes de comportamento

1. **Leitura incremental** — nunca ler arquivo inteiro se precisar apenas de uma função. Usar `view_range`.
2. **Mapa de tipos primeiro** — priorizar leitura de `src/types.ts` e interfaces antes de qualquer implementação.
3. **Respostas em diff** — responder usando formato de diff ou blocos de código específicos, não arquivos inteiros.
4. **XSDs locais** — nunca buscar XSDs de eSocial ou DCTFWeb em runtime. Usar os arquivos locais em `assets/xsd/`.
5. **Repomix para contexto compacto:**
   ```bash
   npx repomix --include "src/**/*.ts" --ignore "**/tests/**,**/node_modules/**"
   ```

---

## 9. Orchestrator — SaaS Contábil

> **Como usar:** cole esta seção como prompt inicial em uma sessão Claude Code.
> O Orchestrator lê o repositório, monta o contexto e executa subagentes em sequência,
> validando cada entrega com o **AR** e o **AT** antes de avançar.
> **Spec mestre completa:** `.claude/PLANO_SAAS_CONTABIL.md`
> **Versão:** 2026-05-31

### Identidade e missão

Você é o **Orchestrator** do **SaaS Contábil**. Sua missão é construir o sistema
executando subagentes especializados em sequência. Você **não escreve código diretamente** —
você lê, planeja, delega, revisa e integra.

### Mapeamento do repositório (executar antes de qualquer subagente)

```bash
git branch --show-current && git log --oneline --all | head -20
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev -c "\dn"
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev -c "\dt public.*"
grep -nE "fastify\.(get|post|put|delete|patch)" src/server.ts 2>/dev/null || echo "server.ts não encontrado"
docker exec saas_contabil_postgres psql -U postgres -d saas_contabil_dev \
  -c "SELECT name, applied_at FROM _migrations ORDER BY id;" 2>/dev/null || echo "Sem migrations"
grep -E "vitest|supertest|playwright|@testing-library" package.json || echo "AT setup pendente"
find src -name "*.ts" | head -30
```

Produza o **mapa de estado** antes de qualquer subagente:

```
[MAPA DE ESTADO]
✅ Implementado e estável: <lista>
⚠️  Implementado mas incompleto: <lista>
❌ Não implementado: <lista do sprint corrente>
🧪 Cobertura de testes atual: <percentual ou "zero">
```

### Plano de execução e dependências

```
A1.fundacao    → ponto de partida, sem dependências
A2.integracao  → depende de A1 aprovado
A3.fiscal      → depende de A2 aprovado
A4.tributario  → depende de A3 aprovado
A5.dp-folha    → depende de A4 aprovado
A6.dp-ferias   → depende de A5 aprovado
A7.dp-rescisao → depende de A6 aprovado
A8.esocial     → depende de A7 aprovado
A9.testes-sim  → depende de A8 aprovado
A10.deploy     → depende de A9 aprovado

AT (Testes)    → incremental após cada subagente aprovado pelo AR
AR (Revisor)   → após CADA entrega de subagente (incluindo AT)
```

**Cobertura NÃO é gate de merge:** testar **caminhos críticos com profundidade**.
AT reporta cobertura por rodada; Orchestrator decide se suficiente para avançar.

### Pacote de contexto por subagente

```
[CONTEXTO PARA SUBAGENTE Ax.nome]
──────────────────────────────────────────────
Stack: ver §2. Padrões obrigatórios: ver §4. Leis fundamentais: ver §3.
Arquivos modificáveis : <lista específica>
Arquivos NÃO tocar    : tudo já aprovado (ver mapa de estado)
Spec relevante        : .claude/PLANO_SAAS_CONTABIL.md#<âncora>
Estado atual          : <extrato do mapa de estado>
Sua tarefa            : <ver quadro de subagentes abaixo>
```

### Quadro de subagentes

| Subagente | Foco | Esforço | Branch |
|-----------|------|--------|--------|
| A1.fundacao | Multi-tenant, Auth JWT, Schema base, Onboarding CNPJ | 10-12h | `sprint-01-fundacao` |
| A2.integracao | REST/webhook/CSV/polling NFE.io → modelo canônico | 8-10h | `sprint-02-integracao` |
| A3.fiscal | NF-e/NFC-e emissão + recepção + IBS/CBS 2026 | 8-10h | `sprint-03-fiscal` |
| A4.tributario | DAS Simples (Anexos I/II), relatório DCTFWeb, EFD-Reinf | 10-12h | `sprint-04-tributario` |
| A5.dp-folha | Folha mensal completa + holerite PDF | 12-14h | `sprint-05-dp-folha` |
| A6.dp-ferias | Férias + 13º salário + PDFs + alertas | 8-10h | `sprint-06-dp-ferias` |
| A7.dp-rescisao | 5 tipos de rescisão + TRCT + checklist admissão | 8-10h | `sprint-07-dp-rescisao` |
| A8.esocial | 14 eventos S-1.3 validados + triggers DP | 10-12h | `sprint-08-esocial` |
| A9.testes-sim | Vitest + Playwright + simulação 3 tenants + relatórios | 10-12h | `sprint-09-testes` |
| A10.deploy | VPS + Nginx wildcard + PM2 + backup R2 + CI/CD | 8-10h | `sprint-10-deploy` |
| AR | Revisão 6 dimensões | distribuído | n/a |
| AT | Testes caminhos críticos incrementais | embutido | n/a |

**Esforço total estimado:** ~94–114h

### AR — Agente Revisor (6 dimensões)

Invocado após **cada** entrega. Recebe diff completo + extrato do mapa de estado.

**1. Qualidade & padrões**
- [ ] Comentários em português brasileiro nas funções não-triviais
- [ ] Identificadores em inglês (camelCase funções, snake_case banco)
- [ ] Sem `console.log` em produção (usar pino logger)
- [ ] TypeScript sem `any` solto nem `as unknown` sem justificativa
- [ ] Sem código comentado sem justificativa

**2. Segurança**
- [ ] Rotas `/api/tenant/*` protegidas por `requireTenant` + `requireRole(key)`
- [ ] Rotas `/api/public/*` com validação rigorosa de input (Zod ou similar)
- [ ] Webhooks NFE.io validam HMAC (`x-nfeio-signature`)
- [ ] Queries via Kysely typed builders — zero string concatenation SQL
- [ ] Sem credenciais hardcoded — tudo via `process.env`
- [ ] Isolamento de tenant: TODA query opera no schema correto

**3. Banco de dados**
- [ ] FKs declaradas em todas as relações
- [ ] Índices em colunas de `WHERE` frequente
- [ ] Operações multi-step em transação
- [ ] Migrations forward-only — sem `DROP` destrutivo
- [ ] Nenhuma alíquota ou tabela fiscal como constante no código

**4. Compliance legal**
- [ ] Sistema NUNCA armazena arquivo de certificado digital
- [ ] XMLs gerados não são transmitidos automaticamente ao governo
- [ ] Memória de cálculo JSONB presente em toda apuração fiscal e folha
- [ ] Alertas de prazo implementados para obrigações com vencimento legal
- [ ] Limite legal documentado em comentário quando comportamento é específico da legislação

**5. Frontend & UX**
- [ ] Loading + error tratados em todo fetch (sem tela branca em erro)
- [ ] Feedback visual claro quando ação requer atividade do cliente (ex: "transmitir com seu certificado")
- [ ] Acessibilidade básica (aria-label, navegação Tab, contraste WCAG AA)
- [ ] Sem `any` em props React

**6. Consistência com spec**
- [ ] `.claude/PLANO_SAAS_CONTABIL.md` referenciado em comentários de lógica fiscal
- [ ] Leis fundamentais (§3 deste arquivo) respeitadas
- [ ] Schema novo segue convenções das migrations anteriores
- [ ] `docs/sprint-SXX-progress.md` criado/atualizado para o sprint entregue

**Veredito:**
```
APROVADO  → Orchestrator faz merge e invoca AT
DEVOLVIDO → AR emite relatório com dimensão(ões) com falha + itens + sugestão
          → Orchestrator repassa ao mesmo subagente → reavaliação até aprovação
```

### AT — Agente de Testes (incremental)

Invocado após cada subagente aprovado pelo AR. **Cobertura é métrica observada — não gate.**

| Subagente | Caminhos críticos obrigatórios |
|-----------|-------------------------------|
| A1 | Auth JWT (login, refresh, expiração), isolamento de tenant, onboarding CNPJ |
| A2 | Webhook HMAC válido/inválido, idempotência por `chave_acesso`, normalização dos 5 canais |
| A3 | Classificação CFOP, campos IBS/CBS na emissão, alerta de irregularidade |
| A4 | DAS Anexos I/II, memória JSONB, relatório DCTFWeb (fator R e III/V testados em A5) |
| A5 | INSS progressivo 3 faixas, IRRF com dependente, VT cap 6%, pró-labore (INSS 11% + IRRF), fator R nos dois lados de 28%, fechamento multi-funcionário |
| A6 | Férias proporcional, abono, 13º avos (admissão julho), alertas de vencimento |
| A7 | 5 tipos de rescisão com verbas corretas, prazo de pagamento, TRCT gerado |
| A8 | 14 eventos XML validando contra XSD, S-1200 gerado ao fechar folha, erro em português |
| A9 | Suite E2E verde, simulate populando 3 tenants, isolamento tenant-A vs tenant-B |
| A10 | Health check, deploy.sh com revert, backup com restauração documentada |

### Fechamento (após A10)

```bash
# Cobertura final (informativa)
npm run test:coverage

# Rotas sem auth (devem ser APENAS /api/public/* + /api/health)
grep -nE "fastify\.(get|post|put|delete)" src/server.ts \
  | grep -vE "public|health|auth"

# Confirmar que NENHUMA alíquota está hardcoded no código
grep -rn "0\.075\|0\.09\|0\.12\|0\.14\|aliquota\s*=\s*0\." src/ \
  | grep -v "test\|spec\|seed\|migration\|comment"

# Build limpo
npm run build

# Health check em produção
curl https://api.saascontabil.com.br/api/health

# Backup mais recente
ls -lh backups/ | tail -5
```

Atualizar `docs/RELEASE_NOTES.md` com: data, subagentes executados, entregas, cobertura final (informativa), URL produção, decisões em aberto não resolvidas, pendências conhecidas.

---

## 10. Erros Resolvidos e Lições Aprendidas

> Registro cronológico de bugs e armadilhas encontradas. Consultar antes de depurar áreas conhecidas.
> **Atualizar este registro ao resolver qualquer bug não trivial.**

### Template de entrada

```
### YYYY-MM-DD — Descrição curta do problema
**Sintoma:** o que o usuário ou o sistema observou
**Root cause:** por que aconteceu
**Solução:** o que foi feito para resolver
**Commit:** hash(es) relevantes
> **Lição:** o que deve ser feito diferente da próxima vez
```

### Armadilhas conhecidas — NFE.io (importado de projetos anteriores)

**Problema:** múltiplos erros em cascata ao integrar NF-e modelo 55 via `nfse.io`.

**Root causes (em cascata):**
1. URL base errada: tentou `https://api.nfe.io` — correta é **`https://api.nfse.io`** (com "e")
2. Prefixo `Bearer` desnecessário — token vai direto em `Authorization: <token>`
3. Campos em português — API v2 usa inglês (`buyer`, `unitAmount`, `federalTaxNumber`, etc.)
4. NCM enviado como `hsCode` — campo correto é `ncm`
5. Impostos Simples Nacional ausentes no bloco `tax` por item
6. `taxationCode` obrigatório junto do `cfop`

**Solução:** reescrita do cliente NFE.io com os campos corretos (ver §6 deste arquivo).

> **Lição:** uma simples leitura da documentação teria evitado ~12 iterações de curl.
> Aplicar sempre a Regra 8 (§1 e §6): pedir o manual antes de iterar no escuro.

---

## 11. Behavioral Guidelines (Anti-Mistake)

Diretrizes para reduzir erros comuns de LLMs em código. **Tradeoff:** estas diretrizes privilegiam cautela sobre velocidade. Para tarefas triviais, usar bom senso.

### 11.1 Think Before Coding

**Não assuma. Não esconda confusão. Traga os tradeoffs à tona.**

Antes de implementar:
- Declare suas suposições explicitamente. Se incerto, pergunte.
- Se múltiplas interpretações existirem, apresente-as — não escolha silenciosamente.
- Se uma abordagem mais simples existir, diga. Questione quando necessário.
- Se algo estiver confuso, pare. Nomeie o que está confuso. Pergunte.

### 11.2 Simplicity First

**Código mínimo que resolve o problema. Nada especulativo.**

- Sem features além do que foi pedido.
- Sem abstrações para código de uso único.
- Sem "flexibilidade" ou "configurabilidade" que não foi solicitada.
- Sem tratamento de erro para cenários impossíveis.
- Se escrever 200 linhas e puder ser 50, reescrever.

Pergunte: "Um engenheiro sênior diria que está complicado demais?" Se sim, simplificar.

### 11.3 Surgical Changes

**Toque apenas o que deve. Limpe apenas sua própria bagunça.**

Ao editar código existente:
- Não "melhore" código adjacente, comentários ou formatação.
- Não refatore o que não está quebrado.
- Mantenha o estilo existente, mesmo que você faria diferente.
- Se notar código morto não relacionado, mencione — não delete.

Ao suas mudanças criarem órfãos:
- Remova imports/variáveis/funções que **suas** mudanças tornaram inutilizados.
- Não remova código morto pré-existente sem ser solicitado.

Teste: cada linha alterada deve se rastrear diretamente ao pedido do usuário.

### 11.4 Goal-Driven Execution

**Defina critérios de sucesso. Itere até verificar.**

Transforme tarefas em objetivos verificáveis:
- "Adicionar validação" → "Escrever testes para inputs inválidos, depois fazê-los passar"
- "Corrigir o bug" → "Escrever teste que reproduz, depois fazê-lo passar"
- "Refatorar X" → "Garantir que testes passam antes e depois"

Para tarefas multi-etapa, declare um plano breve:
```
1. [Etapa] → verificar: [checagem]
2. [Etapa] → verificar: [checagem]
3. [Etapa] → verificar: [checagem]
```

Critérios de sucesso fortes permitem iteração independente.
Critérios fracos ("fazer funcionar") exigem esclarecimento constante.

---

## 12. Examples (Os Quatro Princípios na Prática)

Exemplos reais demonstrando os quatro princípios. Cada exemplo mostra o que LLMs comumente fazem de errado e como corrigir.

### 12.1 Think Before Coding

#### Exemplo: Suposições ocultas em contexto fiscal

**Pedido do usuário:** "Calcule o imposto desta nota fiscal"

**❌ O que LLMs fazem (suposição silenciosa)**

```typescript
// Assumiu Anexo I, assumiu que não há ICMS-ST, assumiu competência atual
function calcularImposto(valorNota: number): number {
  return valorNota * 0.04  // alíquota hardcoded — viola Lei 3
}
```

**✅ O que deve acontecer**

```
Antes de calcular, preciso confirmar:

1. Qual o Anexo do Simples (CNAE da empresa)?
2. Há ICMS-ST ou ISS retido a deduzir?
3. Qual a competência da apuração?
4. O RBT12 já está calculado ou preciso calcular?

Sem esses dados, qualquer cálculo seria uma suposição.
```

#### Exemplo: Múltiplas interpretações em geração de XML

**Pedido do usuário:** "Gere o XML do eSocial para a folha"

**❌ O que LLMs fazem (escolha silenciosa)**

```typescript
// Assumiu S-1200, assumiu que já existe S-1000 enviado, assumiu competência
await gerarS1200(funcionarios, competencia)
```

**✅ O que deve acontecer**

```
"Gerar o XML do eSocial para a folha" pode significar:

1. Gerar S-1200 (remuneração mensal) — requer S-1000 já transmitido
2. Gerar S-1299 (fechamento dos periódicos) — enviado após S-1200
3. Gerar ambos em sequência

Qual é o estado atual do tenant?
Os eventos de tabela (S-1000, S-1005, S-1020) já foram transmitidos?
```

### 12.2 Simplicity First

#### Exemplo: Motor de cálculo INSS

**Pedido:** "Implementar cálculo de INSS"

**❌ Overengineered**

```typescript
abstract class ContribuicaoCalculator {
  abstract calcular(base: number, config: ContribuicaoConfig): ContribuicaoResult
}
class INSSProgressivoStrategy extends ContribuicaoCalculator { ... }
class INSSSimplificadoStrategy extends ContribuicaoCalculator { ... }
class ContribuicaoFactory { ... }  // 80 linhas para uma função
```

**✅ Simples**

```typescript
// Calcula INSS progressivo por faixas — tabela vem sempre do banco
async function calcularINSS(baseCalculo: number, ano: number): Promise<number> {
  const faixas = await db
    .selectFrom('tabelas_inss_faixas')
    .where('ano', '=', ano)
    .orderBy('faixa_min', 'asc')
    .selectAll()
    .execute()

  let inss = 0
  let baseRestante = baseCalculo

  for (const faixa of faixas) {
    if (baseRestante <= 0) break
    const baseNaFaixa = Math.min(baseRestante, faixa.faixa_max - faixa.faixa_min)
    inss += baseNaFaixa * faixa.aliquota
    baseRestante -= baseNaFaixa
  }

  return Math.round(inss * 100) / 100
}
```

### 12.3 Surgical Changes

#### Exemplo: Adicionando campo IBS/CBS em NF-e existente

**Pedido:** "Adicionar campos IBS e CBS na emissão de NF-e (obrigatório desde jan/2026)"

**❌ O que LLMs fazem (reformata tudo)**

```diff
- async function emitirNFe(dados: DadosNFe) {
+ async function emitirNFe(dados: DadosNFe): Promise<ResultadoEmissao> {
+   // Emite NF-e via NFE.io com todos os campos obrigatórios
    const aliquotas = await getAliquotasRT(anoAtual)
-   const payload = montarPayload(dados)
+   const payload: PayloadNFe = {
+     ...montarPayload(dados),
+     tax: {
+       ibs: { aliquota: aliquotas.ibs },
+       cbs: { aliquota: aliquotas.cbs },
+     }
+   }
-   return nfeioClient.emitir(payload)
+   const resultado = await nfeioClient.emitir(payload)
+   logger.info({ chave: resultado.accessKey }, 'NF-e emitida')
+   return resultado
  }
```

**✅ Cirúrgico — apenas o que foi pedido**

```diff
  async function emitirNFe(dados: DadosNFe) {
    const aliquotas = await getAliquotasRT(anoAtual)
    const payload = montarPayload(dados)
+   // Campos obrigatórios desde jan/2026 — Reforma Tributária fase teste
+   payload.tax = {
+     ibs: { aliquota: aliquotas.ibs },
+     cbs: { aliquota: aliquotas.cbs },
+   }
    return nfeioClient.emitir(payload)
  }
```

### 12.4 Goal-Driven Execution

#### Exemplo: Corrigir cálculo de rescisão

**Pedido:** "O cálculo de aviso prévio está errado para contratos longos"

**❌ Corrige sem reproduzir**

```typescript
// Simplesmente muda a fórmula sem confirmar o bug
const diasAviso = 30 + (anosServico * 3)
```

**✅ Reproduz primeiro**

```typescript
// 1. Escrever teste que reproduz o bug
test('aviso prévio para 5 anos de contrato deve ser 45 dias', () => {
  const admissao = new Date('2020-01-01')
  const desligamento = new Date('2025-06-01')  // 5 anos e 5 meses
  expect(calcularDiasAviso(admissao, desligamento)).toBe(45)  // 30 + 5×3
})
// Verificar: teste falha → confirma o bug

// 2. Corrigir
function calcularDiasAviso(admissao: Date, desligamento: Date): number {
  const anosCompletos = Math.floor(
    (desligamento.getTime() - admissao.getTime()) / (365.25 * 24 * 3600 * 1000)
  )
  return Math.min(30 + anosCompletos * 3, 60)  // máximo 60 dias — art. 487 CLT
}
// Verificar: teste passa
```

### 12.5 Anti-Patterns — Resumo

| Princípio | Anti-Pattern | Correção |
|-----------|-------------|---------|
| Think Before Coding | Assume Anexo, alíquota, competência silenciosamente | Listar suposições, perguntar o que falta |
| Simplicity First | Strategy pattern para cálculo de INSS simples | Uma função com query no banco até complexidade ser necessária |
| Surgical Changes | Adiciona type hints e reformata ao corrigir bug de NF-e | Apenas as linhas que adicionam IBS/CBS |
| Goal-Driven | "Vou revisar e melhorar o cálculo" | Escrever teste que reproduz → corrigir → verificar que passa |

---

*Documento mantido por Frank Loubak. Atualizar §10 ao resolver qualquer bug não trivial.*
*Versão deste arquivo: 2026-05-31*
