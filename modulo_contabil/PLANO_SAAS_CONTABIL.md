---
name: saas-contabil
description: >
  Plano arquitetural completo de um SaaS que substitui integralmente um escritório
  contábil para empresas do Simples Nacional. Cobre fiscal (NF-e/NFC-e), apuração
  de impostos, departamento pessoal e eSocial, com transmissão delegada ao cliente.
version: 1.0
regime: Simples Nacional
tipos-nf: NF-e, NFC-e
modelo: SaaS multi-tenant (schema-per-tenant PostgreSQL)
transmissao: delegada ao cliente (certificado digital nunca armazenado no SaaS)
reforma-tributaria: contemplada 2026–2033
stack: Node.js · React · TypeScript · PostgreSQL · Redis · NFE.io
---

# Plano Arquitetural — SaaS Contábil

> **Como usar este arquivo no Claude Code**
> Coloque-o em `.claude/PLANO_SAAS_CONTABIL.md` na raiz do repositório.
> No início de cada sessão de sprint, referencie a seção correspondente:
> _"Implemente o Sprint S-01 conforme `.claude/PLANO_SAAS_CONTABIL.md#sprint-s-01`"_

---

## Índice de Seções

| # | Seção | Âncora |
|---|-------|--------|
| 0 | Aviso legal e premissas | [#aviso-legal](#aviso-legal) |
| 1 | Visão geral dos domínios | [#visao-geral](#visao-geral) |
| 2 | Decisão de arquitetura multi-tenant | [#multi-tenant](#multi-tenant) |
| 3 | Camada de integração universal | [#integracao](#integracao) |
| 4 | Domínio Fiscal — NF-e / NFC-e | [#fiscal](#fiscal) |
| 5 | Reforma Tributária 2026–2033 | [#reforma-tributaria](#reforma-tributaria) |
| 6 | Apuração — Simples Nacional | [#apuracao](#apuracao) |
| 7 | Obrigações acessórias | [#obrigacoes-acessorias](#obrigacoes-acessorias) |
| 8 | Departamento Pessoal | [#departamento-pessoal](#departamento-pessoal) |
| 9 | eSocial S-1.3 | [#esocial](#esocial) |
| 10 | Catálogo de skills | [#skills](#skills) |
| 11 | Stack técnica | [#stack](#stack) |
| 12 | Roadmap de sprints | [#roadmap](#roadmap) |
| 13 | Limites legais | [#limites-legais](#limites-legais) |
| 14 | Riscos e mitigações | [#riscos](#riscos) |
| 15 | Decisões em aberto | [#decisoes-abertas](#decisoes-abertas) |

---

## Aviso Legal

> ⚠️ Este plano descreve uma arquitetura de software. Não constitui assessoria jurídica,
> contábil ou tributária. Alíquotas e regras mudam com frequência — todas as tabelas
> fiscais devem estar em banco de dados versionado, nunca como constantes no código.

### Premissas confirmadas pelo cliente

- Regime: **Simples Nacional** (inclui MEI com empregado como subperfil)
- NF: **NF-e** (produtos/mercadorias) + **NFC-e** (consumidor final/PDV)
- DP: escopo **total** — folha, férias, 13º, rescisão, eSocial, FGTS
- Modelo: **SaaS multi-tenant**
- Transmissão: **delegada** — sistema prepara tudo; cliente transmite com seu certificado
- Reforma Tributária: **contemplada** na arquitetura

### Limite legal central (inegociável)

O sistema **NUNCA** armazena certificados digitais dos clientes.
Toda transmissão ao governo (eSocial, EFD-Reinf, DAS, SPED) é de responsabilidade do cliente,
usando seu próprio certificado A1/A3. O sistema entrega arquivos validados e prontos.

---

## Visão Geral

Seis domínios funcionais independentes, integrados por barramento de eventos interno.

```
┌─────────────────────────────────────────────────────────────┐
│                    SAAS CONTÁBIL                            │
│                                                             │
│  D6 ─ Integração & API  ←─ qualquer sistema de vendas      │
│         │                                                   │
│         ▼                                                   │
│  D1 ─ Fiscal Entrada    ←─ NFE.io (NF-e emitidas/recebidas)│
│         │                                                   │
│         ▼                                                   │
│  D2 ─ Apuração Tributária  (DAS, DARF, IBS/CBS)            │
│         │                                                   │
│  D3 ─ Obrigações Acessórias (Relatório DCTFWeb, Reinf, PGDAS)│
│                                                             │
│  D4 ─ Departamento Pessoal (Folha, Férias, 13º, Rescisão)  │
│         │                                                   │
│  D5 ─ eSocial  (XMLs S-1.3 validados → download do cliente)│
└─────────────────────────────────────────────────────────────┘
```

| Domínio | Função | Equivalente no escritório |
|---------|--------|--------------------------|
| D1 — Fiscal Entrada | Captura e classifica NF-e/NFC-e emitidas e recebidas | Conferência de notas pelo assistente fiscal |
| D2 — Apuração Tributária | Calcula DAS, DARF retido, IBS/CBS | Apuração mensal pelo contador |
| D3 — Obrigações Acessórias | Gera PGDAS-D instrução, relatório de conferência DCTFWeb, EFD-Reinf | Escrituração e entrega de declarações |
| D4 — Departamento Pessoal | Folha, férias, 13º, rescisão, afastamentos | DP completo |
| D5 — eSocial | Gera XMLs S-1000→S-2500, valida, entrega ao cliente | Envio de eventos trabalhistas |
| D6 — Integração & API | Conecta qualquer sistema de vendas | Recepção de documentos do cliente |

---

## Multi-Tenant

### Decisão: schema-per-tenant no PostgreSQL ✅

**Justificativa:** schema-per-tenant oferece isolamento próximo ao de banco separado,
com custo operacional de instância única. Migração de schema por tenant é independente.
Banco separado só se justificaria acima de ~500 clientes com cláusula contratual explícita.

| Critério | Banco separado | **Schema-per-tenant ✅** | Tabela compartilhada |
|----------|---------------|-------------------------|----------------------|
| Isolamento de dados | Máximo | Alto (schema PostgreSQL) | Médio (RLS) |
| Custo operacional | Alto (1 instância/cliente) | Moderado (1 instância) | Baixo |
| Adequação à LGPD | Excelente | Excelente | Requer controles extras |
| Complexidade dev | Alta | Média | Baixa inicialmente |
| Escalabilidade | Complexa | Boa | Máxima, maior risco |

### Resolução de tenant

```
Subdomínio: empresa.seuSaaS.com.br  →  tenant_id = "empresa"
Header:     X-Tenant-ID: empresa    →  tenant_id = "empresa"
```

Middleware resolve o tenant **antes** de qualquer query.
Todas as queries usam `SET search_path = tenant_{id}`.

### Tabelas base por schema

```sql
-- Criadas automaticamente no onboarding de cada CNPJ
empresa                  -- CNPJ, razão social, regime, CNAE, endereço
socios                   -- CPF, nome, percentual, pró-labore
certificado_referencia   -- APENAS metadados: validade, tipo (A1/A3), titular
                         -- ⚠️ NUNCA o arquivo do certificado
funcionarios             -- CPF, PIS, cargo, CBO, salário, admissão, tipo contrato
configuracoes_tributarias -- Anexo Simples, fator R, CNAE — específico do tenant
```

> ⚠️ **Tabelas de legislação nacional ficam no SCHEMA PÚBLICO, não no schema do tenant:**
> `tabelas_simples_anexos`, `tabelas_inss_faixas`, `tabelas_irrf_faixas`, `tabelas_sm`, `aliquotas_rt`.
> Motivo: são idênticas para todos os tenants. Duplicá-las por schema exigiria atualizar N schemas
> a cada mudança de lei — e qualquer schema esquecido geraria cálculo de imposto errado silencioso.
> Atualização legislativa deve ser um único UPDATE auditável no schema público.

---

## Integração

### Skill: `universal-sales-integrator`

Todos os canais normalizam para o modelo canônico `NotaFiscalEvento` interno.
Os domínios D1–D5 nunca conhecem a origem dos dados.

| Canal | Como funciona | Exemplos |
|-------|---------------|---------|
| REST API (push) | Sistema externo POST com payload JSON. SaaS publica contrato OpenAPI. | ERPs, e-commerce, PDV próprio |
| Webhook receptor | SaaS expõe endpoint que recebe eventos de plataformas já com NF emitida | Mercado Pago, PagSeguro, Stripe |
| NFE.io Webhook | Empresa configura NFE.io para disparar webhook a cada NF. Captura automática. | Qualquer sistema que use NFE.io |
| Import CSV/XML | Upload manual ou SFTP. Parser com mapeamento configurável por tenant. | ERP legado, Excel, Omie |
| Polling NFE.io | SaaS consulta NFE.io periodicamente. Fallback quando webhook indisponível. | Sistemas sem suporte a webhook |
| MCP Connector | skill `mcp-builder` cria conectores para ERPs populares | Bling, Omie, Nuvemshop, Tiny |

### Modelo canônico `NotaFiscalEvento`

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
  totais: TotaisNF              // inclui IBS/CBS desde 2026
  status: 'autorizada' | 'cancelada' | 'rejeitada' | 'pendente'
  xml_url?: string
  danfe_url?: string
}
```

---

## Fiscal

### Skill: `nfe-processor`

#### NF-e emitidas (saídas)

- Monta payload NFE.io com dados do tenant e itens da venda
- Preenche campos **IBS (0,1%) e CBS (0,9%)** obrigatórios desde jan/2026
- Classifica CFOP automaticamente por tipo de operação (dentro/fora do estado, devolução)
- Armazena XML autorizado, chave, número, série, valor, impostos destacados
- Registra webhook NFE.io para atualizar status (autorizada/cancelada/rejeitada)

#### NF-e recebidas (entradas / fornecedores)

- Consulta NFE.io pela chave de acesso → valida na SEFAZ, obtém XML completo
- Extrai itens, NCM, CFOP, valores de ICMS, PIS, COFINS, IPI destacados
- Aplica regra de crédito do Simples Nacional (crédito limitado — motor aplica a regra correta)
- Vincula à entrada de estoque (se módulo ativo)
- Alerta sobre irregularidades: CNPJ inativo, nota cancelada, divergência de valor

#### NFC-e (PDV / consumidor final)

- Recebe eventos de venda do PDV via API ou webhook
- Consolida por período para base de cálculo do DAS
- Fluxo simplificado — sem consulta de fornecedor

### API NFE.io — endpoints principais

```
POST /v1/companies/{company_id}/nfce          # Emitir NFC-e
POST /v1/companies/{company_id}/nfe           # Emitir NF-e
GET  /v1/companies/{company_id}/nfe/{id}      # Consultar NF
GET  /v1/companies/{company_id}/nfe?pageCount=50  # Listar
POST /v1/nfe/check                            # Validar chave de acesso na SEFAZ
```

> ℹ️ O SaaS usa a API NFE.io com as credenciais configuradas pelo próprio cliente.
> O certificado digital fica na NFE.io — não no SaaS.

---

## Reforma Tributária

> Todas as alíquotas abaixo são do estado atual da lei (LC 214/2025).
> Armazenar em tabela `aliquotas_rt` versionada por `ano_calendario`. Nunca como constante.

| Ano | O que muda | Ação no sistema |
|-----|-----------|-----------------|
| **2026** | Fase teste: CBS 0,9% + IBS 0,1% destacados na NF. PIS/COFINS mantidos. Sem penalidade por erro de cálculo. | Preencher campos IBS/CBS obrigatórios em toda NF emitida. Cálculo de compensação opcional. |
| **2027** | CBS entra em vigor plena (~8,8%). PIS e COFINS extintos. IPI zerado (exceto ZFM). | Substituir cálculo PIS/COFINS por CBS. Remover IPI do motor (salvo exceções ZFM). |
| **2029–2032** | IBS aumenta progressivamente. ICMS e ISS reduzidos gradualmente (4 etapas anuais). | Motor paramétrico por ano-calendário. Tabela de alíquotas atualizável sem redeploy. |
| **2033** | Extinção total de ICMS, ISS, PIS, COFINS, IPI. IVA Dual (CBS+IBS) pleno + IS. | Desativar módulos legados. IS calculado sobre produtos selecionados (tabaco, bebidas, combustíveis). |

### Skill: `reform-tax-engine`

```typescript
// Exemplo de consulta ao motor paramétrico
const aliquotas = await getAliquotasRT(ano_calendario: 2027, uf: 'MG')
// Retorna: { cbs: 0.088, ibs: 0.0092, is: 0, icms_reducao: 0.10, iss_reducao: 0.10 }
```

---

## Apuração

### Skill: `simples-nacional-calculator`

#### Lógica de apuração — passo a passo

```
1. Busca NF-es do tenant dos últimos 12 meses → calcula RBT12
2. Identifica Anexo pelo CNAE principal:
   - Anexo I  → Comércio
   - Anexo II → Indústria
   - Anexo III → Serviços (regra geral)
   - Anexo IV → Serviços (construção civil, vigilância, limpeza)
   - Anexo V  → Serviços (intelectuais — verificar fator R)
3. Localiza faixa na tabela do Anexo pelo RBT12
4. Calcula alíquota efetiva:
   aliquota_efetiva = (RBT12 × aliquota_nominal - parcela_deduzir) / RBT12
5. Aplica alíquota_efetiva sobre a Receita Bruta do mês
6. Segrega por tributo (IRPJ, CSLL, COFINS, PIS, CPP, ICMS ou ISS)
7. Desconta ICMS-ST e ISS retido na fonte quando houver
8. Gera memória de cálculo auditável em PDF
```

> ⚠️ Fator R (Anexo V vs III): `fator_r = folha_12_meses / receita_12_meses`.
> Se fator_r ≥ 28% → Anexo III. Caso contrário → Anexo V.
> **Dependência de implementação:** o fator R exige dados de folha (D4), que é implementado
> APÓS a apuração no roadmap. Por isso o motor entrega em duas etapas:
> Sprint S-04 cobre Anexos I e II (não dependem de fator R — caso do varejo);
> o fator R e os Anexos III/V são destravados no Sprint S-06, após a folha existir.
> Enquanto a folha não tiver 12 meses de histórico, o tenant pode informar a folha
> acumulada manualmente em `configuracoes_tributarias.folha_12m_manual`.

#### Retenções na fonte

| Retenção | Base legal | Quando se aplica | Alíquota |
|----------|-----------|-----------------|----------|
| IRRF sobre serviços | IN RFB 2.110/2022 | Serviços tomados com retenção | 1,5% a 4,65% (varia pelo serviço) |
| INSS retido | Lei 9.711/1998 | Cessão de mão de obra | 11% |
| ISS retido | Lei 116/2003 + lei municipal | Serviços tomados no município | Alíquota do município do tomador |

---

## Obrigações Acessórias

### Skill: `tax-obligations-generator`

| Obrigação | Periodicidade | O sistema faz | O cliente faz |
|-----------|--------------|---------------|---------------|
| **PGDAS-D (DAS)** | Mensal | Calcula RBT12, alíquota efetiva, valor do DAS. Gera PDF de memória + guia passo a passo. | Acessa PGDAS-D online, confirma valores, gera guia, paga. |
| **DCTFWeb** | Mensal | Gera **relatório de conferência** com os valores que devem aparecer na declaração (INSS da folha, retenções). A DCTFWeb é gerada AUTOMATICAMENTE no e-CAC a partir do eSocial S-1299 + EFD-Reinf transmitidos — não existe XML de DCTFWeb a enviar. | Confere valores no e-CAC, transmite a declaração e emite o DARF. |
| **EFD-Reinf** | Mensal | Gera eventos R-2010, R-2020, R-4010 com retenções IR/INSS/CSRF. | Transmite com certificado digital. |
| **DEFIS** | Anual | Consolida 12 meses de faturamento, sócios, lucros. Gera relatório de preenchimento. | Preenche e transmite (março/abril do ano seguinte). |
| **DASN-SIMEI** | Anual | Se tenant for MEI: gera relatório com receita bruta do ano. | Transmite no período de entrega. |

> ⚠️ **Limite técnico PGDAS-D:** não possui API pública de transmissão automatizada.
> O sistema entrega cálculo completo com memória auditável + guia visual.
> Esta é a única obrigação principal que requer intervenção humana inevitável.

---

## Departamento Pessoal

### Skill: `payroll-engine` — Folha mensal

#### Cadastro de funcionários

```typescript
interface Funcionario {
  cpf: string
  pis_pasep: string
  nome: string
  cargo: string
  cbo: string                    // Classificação Brasileira de Ocupações
  salario_base: number
  data_admissao: Date
  tipo_contrato: 'CLT' | 'temporario' | 'aprendiz'
  dependentes: Dependente[]      // para IRRF
  beneficios: Beneficio[]        // VT, VR, plano saúde
  conta_bancaria: ContaBancaria
}
```

#### Cálculo mensal — sequência obrigatória

```
1. Salário bruto
   + horas extras (50% diurnas, 100% noturnas ou domingos/feriados)
   + adicional noturno (20% sobre hora noturna)
   + insalubridade (10/20/40% do salário mínimo nacional)
   + periculosidade (30% do salário base)

2. Desconto INSS (empregado) — tabela progressiva vigente 2026:
   Faixa 1: até R$ 1.518,00      → 7,5%
   Faixa 2: R$ 1.518,01–2.793,88 → 9,0%
   Faixa 3: R$ 2.793,89–4.190,83 → 12,0%
   Faixa 4: R$ 4.190,84–8.157,41 → 14,0%
   (Cálculo progressivo — não flat sobre o total)
   ⚠️ Verificar tabela vigente no início de cada ano.

3. Base IRRF = Bruto − INSS − (dependentes × dedução_por_dependente) − pensão_alimentícia
   Aplica tabela progressiva mensal vigente.

4. Desconto VT = min(6% × salário_bruto, custo_total_VT)
   (empregador cobre a diferença)

5. Desconto de faltas = (salário_bruto / dias_úteis_mês) × dias_faltados

6. FGTS patronal = 8% × salário_bruto  → não desconta do empregado, é custo da empresa

7. INSS patronal → no Simples Nacional está incluso no DAS (informativo apenas)

8. Gera holerite PDF por funcionário
9. Gera totais para DCTFWeb e FGTS Digital
```

---

### Skill: `vacation-manager` — Férias

```
Período aquisitivo: 12 meses de trabalho
Período concessivo: 12 meses seguintes (empresa deve conceder)

Alertas automáticos: 60 dias → 30 dias → 15 dias antes do vencimento do concessivo

Cálculo:
  salário_férias = salário_base × (dias_férias / 30)
  terço_constitucional = salário_férias / 3
  abono_pecuniário = (salário_férias / 30) × dias_vendidos  [máx 10 dias, se solicitado]
  total = salário_férias + terço + abono (se houver)

Documentos gerados:
  - Aviso de Férias (prazo mínimo: 30 dias antes do início)
  - Recibo de Férias (pago até 2 dias antes do início)
  - Evento S-2230 eSocial (afastamento)
```

---

### Skill: `thirteenth-salary-manager` — 13º Salário

```
1ª parcela (antecipação):
  - Paga entre fevereiro e novembro (ou na rescisão)
  - Valor: metade do salário base do mês
  - Desconta INSS
  - NÃO desconta IRRF na 1ª parcela

2ª parcela:
  - Paga até 20 de dezembro
  - Base = salário bruto (com adicionais) × (meses trabalhados / 12)
  - Desconta INSS sobre base total do 13º
  - Desconta IRRF sobre base total do 13º (separado da folha regular)
  - Abate 1ª parcela já paga

Avos: mês com ≥ 15 dias trabalhados conta como mês completo.
```

---

### Skill: `termination-calculator` — Rescisão

| Tipo | Verbas calculadas |
|------|------------------|
| **Demissão sem justa causa** | Saldo salário + aviso prévio indenizado (ou trabalhado) + férias vencidas + férias proporcionais + 1/3 + 13º proporcional + FGTS + **multa 40% FGTS** |
| **Pedido de demissão** | Saldo salário + férias vencidas + proporcionais + 1/3 + 13º proporcional (desconta 30 dias se não cumprir aviso) |
| **Demissão por justa causa** | Apenas saldo salário + férias vencidas + 1/3 (perde: aviso, 13º proporcional, multa FGTS) |
| **Rescisão por acordo** | Metade do aviso indenizado + 80% multa FGTS + demais verbas integrais (art. 484-A CLT) |
| **Término de contrato** | Saldo + férias + 13º + FGTS sem multa |

> ⚠️ **Prazo de pagamento (crítico):** Demissão sem justa causa → 10 dias corridos da comunicação.
> Sistema gera alerta com data limite imediatamente ao iniciar rescisão.
> Atraso = multa de 1 salário mínimo por dia (art. 477, §8º CLT).

### Skill: `fgts-digital-guide` — FGTS Digital

```
Recolhimento mensal até dia 20 do mês seguinte (ou dia útil anterior se fim de semana)
Base = somatório de (8% × salário_bruto) de todos os funcionários
Sistema gera: relatório por funcionário + total + instrução de recolhimento no FGTS Digital
```

---

## eSocial

### Skill: `esocial-event-factory`

Versão: **S-1.3** (NT 06/2026 aplicada desde fevereiro de 2026)
Eventos gerados como XML, validados contra XSD oficial, disponibilizados para download.

#### Eventos de tabela (configuração inicial)

| Evento | Nome | Gatilho | Prazo |
|--------|------|---------|-------|
| S-1000 | Info do Empregador | Cadastro do tenant ou alteração | Antes de todos os demais |
| S-1005 | Tabela de Estabelecimentos | Cadastro ou alteração | Antes dos demais |
| S-1020 | Tabela de Lotações Tributárias | Cadastro inicial | Antes dos demais |
| S-1070 | Processos Administrativos/Judiciais | Ação judicial trabalhista | Antes do uso |

#### Eventos de vínculo (admissão/alteração/desligamento)

| Evento | Nome | Gatilho | Prazo |
|--------|------|---------|-------|
| S-2200 | Cadastramento Inicial do Vínculo | Admissão de funcionário | Até dia anterior ao início |
| S-2190 | Admissão Preliminar | Urgência (dados mínimos) | Até o início das atividades |
| S-2205 | Alteração de Dados Cadastrais | Atualização de dados | Até 15 dias após alteração |
| S-2206 | Alteração de Contrato de Trabalho | Mudança salarial, cargo, jornada | Até o dia do evento |
| S-2230 | Afastamento Temporário | Férias, atestado, licença | Até o início do afastamento |
| S-2299 | Desligamento | Rescisão do contrato | Até o dia do desligamento |

#### Eventos periódicos (mensais — prazo: dia 15 do mês seguinte)

| Evento | Nome | Gatilho |
|--------|------|---------|
| S-1200 | Remuneração do Trabalhador | Fechamento mensal da folha |
| S-1202 | Remuneração Regime Geral Prev. | Trabalhador com vínculo diferenciado |
| S-1299 | Fechamento dos Eventos Periódicos | Sinaliza fim dos eventos do mês |

#### Eventos de SST (Saúde e Segurança do Trabalho)

| Evento | Nome | Prazo |
|--------|------|-------|
| S-2210 | CAT — Comunicação de Acidente | Até 1 dia útil após o acidente |
| S-2220 | Monitoramento Saúde (ASO) | Até 15 dias após o exame |
| S-2240 | Condições Ambientais do Trabalho | Antes do S-2200 |

#### Validação e entrega

```
1. XML gerado pelo sistema
2. Validado contra XSD oficial S-1.3 (download do portal gov.br)
3. Erros exibidos em português com campo específico apontado
4. XML disponibilizado para download na área do cliente
5. Alerta 3 dias antes do vencimento de cada evento periódico
6. Guia visual de transmissão pelo portal eSocial Empresas
7. Cliente registra número de protocolo após transmissão (histórico)
```

> ℹ️ O SaaS **NÃO transmite** eventos eSocial. O cliente baixa o XML e transmite
> com seu certificado digital no portal eSocial ou via software de folha.

---

## Skills

### Catálogo completo — por prioridade de implementação

| Skill | Domínio | Descrição | Prioridade |
|-------|---------|-----------|-----------|
| `saas-tenant-manager` | Fundação | Ciclo de vida de tenants, schemas PostgreSQL, onboarding de CNPJ, validação Receita Federal | **P0 — Bloqueante** |
| `universal-sales-integrator` | Integração | API REST, webhook, CSV/XML, polling NFE.io, MCP connectors | **P0 — Bloqueante** |
| `nfe-processor` | Fiscal | NF-e e NFC-e emitidas e recebidas via NFE.io | **P0 — Bloqueante** |
| `simples-nacional-calculator` | Tributário | Apuração DAS, anexos I–V, alíquota efetiva, fator R, retenções | **P1 — Alta** |
| `tax-obligations-generator` | Tributário | PGDAS-D instrução, relatório conferência DCTFWeb, EFD-Reinf, DEFIS guide | **P1 — Alta** |
| `payroll-engine` | DP | Folha mensal: INSS, IRRF, VT, encargos patronais, holerite PDF | **P1 — Alta** |
| `vacation-manager` | DP | Período aquisitivo/concessivo, alertas, cálculo, aviso, recibo | **P1 — Alta** |
| `thirteenth-salary-manager` | DP | 1ª e 2ª parcela, proporcional, recibo PDF | **P2 — Média** |
| `termination-calculator` | DP | 5 tipos de rescisão, TRCT, prazo de pagamento | **P2 — Média** |
| `esocial-event-factory` | eSocial | Geração e validação de 15+ eventos XML S-1.3 | **P2 — Média** |
| `reform-tax-engine` | Tributário | Motor paramétrico IBS/CBS/IS para transição 2026–2033 | **P2 — Média** |
| `compliance-calendar` | Transversal | Calendário de obrigações com alertas automáticos por tenant | **P3 — Baixa** |
| `fgts-digital-guide` | DP | Guia FGTS Digital, reconciliação com folha, instrução de recolhimento | **P3 — Baixa** |

### Skills existentes que serão reaproveitadas

| Skill existente | Onde usar |
|-----------------|-----------|
| `docx` | Relatórios gerenciais, memória de cálculo do DAS |
| `xlsx` | Holerites em massa, DRE resumido, exportação para contador |
| `pdf` | Holerites individuais, DANFEs, recibos, guias |
| `pdf-reading` | Leitura de DANFEs e XMLs recebidos |
| `frontend-design` | Dashboard do tenant, componentes React |
| `mcp-builder` | Conectores Bling, Omie, Nuvemshop, Tiny ERP |
| `skill-creator` | Pipeline de criação e avaliação das skills novas |

---

## Stack

| Camada | Tecnologia | Justificativa |
|--------|-----------|--------------|
| Frontend | React + TypeScript + Vite | Stack já dominado; SSR opcional com Next.js para SEO |
| Backend API | Node.js + Express/Fastify | Stack já dominado; ecossistema fiscal BR coberto em npm |
| Banco de dados | PostgreSQL (schema-per-tenant) | Schemas isolados, excelente para dados fiscais relacionais |
| Fila de eventos | Bull + Redis | Processamento assíncrono de NF-es, XMLs, notificações |
| Geração de PDF | Skill `pdf` existente | Holerites, DANFEs, guias, recibos |
| Geração de XML | `xmlbuilder2` (npm) | eSocial e EFD-Reinf com suporte a namespaces e XSD |
| Validação XSD | `libxmljs2` (npm) | Validação de XMLs contra schemas governamentais |
| Integração NF | NFE.io REST API | Cobre NF-e/NFC-e/NFS-e, webhook nativo, sem certificado no SaaS |
| Autenticação | JWT + RBAC por tenant | Roles: `admin_tenant`, `operador`, `visualizador` |
| Infraestrutura | Hostinger VPS + Docker Compose | Familiaridade operacional, custo controlado |
| CI/CD | GitHub Actions | Já usado pelo solicitante |

### Convenção de código (padrão do projeto)

```
Comentários: Português
Variáveis e funções: inglês (camelCase)
Commits: inglês
Nomes de arquivos: kebab-case
```

---

## Roadmap

### Sprint S-01 — Fundação SaaS
**Skills:** `saas-tenant-manager`, `frontend-design`
**Entregáveis:**
- Schema-per-tenant funcional no PostgreSQL
- Cadastro de CNPJ com validação na Receita Federal (via NFE.io)
- Preenchimento automático: razão social, endereço, CNAE, regime
- Autenticação JWT com RBAC por tenant
- Dashboard base com sidebar de navegação por módulo
- Wizard de onboarding de 5 passos

---

### Sprint S-02 — Integração Fiscal
**Skills:** `universal-sales-integrator`
**Entregáveis:**
- Endpoint REST de entrada de NF (contrato OpenAPI publicado)
- Webhook receptor (NFE.io + plataformas de pagamento)
- Polling NFE.io com rate limit respeitado
- Import CSV/XML com mapeamento configurável por tenant
- Modelo canônico `NotaFiscalEvento` persistido
- Testes de contrato para cada canal de entrada

---

### Sprint S-03 — Processamento de NF
**Skills:** `nfe-processor`, `pdf`
**Entregáveis:**
- Emissão de NF-e e NFC-e via NFE.io (com IBS/CBS 2026)
- Consulta de NF de fornecedores por chave de acesso
- Classificação automática de CFOP
- Listagem e busca de notas por período, tipo e status
- Alertas de irregularidades em notas de fornecedores
- Visualização de DANFE em PDF

---

### Sprint S-04 — Apuração DAS
**Skills:** `simples-nacional-calculator`, `pdf`
**Entregáveis:**
- Motor de cálculo RBT12 + faixas Simples (Anexos I–V)
- Cálculo do fator R para Anexo V vs III
- Alíquota efetiva + memória de cálculo completa
- Identificação e dedução de ICMS-ST e ISS retido
- PDF de memória de cálculo para auditoria
- Guia passo a passo para preenchimento no PGDAS-D

---

### Sprint S-05 — Obrigações Acessórias
**Skills:** `tax-obligations-generator`, `compliance-calendar`
**Entregáveis:**
- Cálculo e instrução PGDAS-D com memória auditável
- Relatório de conferência DCTFWeb em PDF (valores esperados no e-CAC após transmissão eSocial/Reinf)
- Geração de eventos EFD-Reinf (R-2010, R-2020, R-4010)
- Relatório DEFIS para preenchimento manual
- Calendário de obrigações com alertas por tenant (60/30/15 dias)
- Dashboard de status de obrigações do mês

---

### Sprint S-06 — Folha de Pagamento
**Skills:** `payroll-engine`, `pdf`
**Entregáveis:**
- Cadastro completo de funcionários com todos os campos legais
- Cálculo mensal: INSS progressivo, IRRF, VT, extras, adicionais
- Totais para DCTFWeb e FGTS Digital
- Holerite PDF individual por funcionário
- Relatório de folha consolidada do mês
- Histórico de folhas por funcionário

---

### Sprint S-07 — Férias e 13º Salário
**Skills:** `vacation-manager`, `thirteenth-salary-manager`
**Entregáveis:**
- Controle de períodos aquisitivo e concessivo por funcionário
- Alertas de vencimento (60/30/15 dias)
- Cálculo de férias com opção de abono pecuniário
- Aviso de Férias e Recibo de Férias em PDF
- Cálculo de 1ª e 2ª parcela do 13º
- Recibo de 13º em PDF
- Evento S-2230 (afastamento) enviado ao módulo eSocial

---

### Sprint S-08 — Admissão e Rescisão
**Skills:** `termination-calculator`
**Entregáveis:**
- Checklist de documentos de admissão com status por item
- Cálculo de rescisão para os 5 tipos (com memória de cálculo)
- TRCT gerado em PDF
- Alerta de prazo de pagamento (data limite imediata)
- Evento S-2200 (admissão) e S-2299 (desligamento) ao módulo eSocial

---

### Sprint S-09 — eSocial
**Skills:** `esocial-event-factory`
**Entregáveis:**
- Geração de todos os eventos de tabela (S-1000, S-1005, S-1020)
- Geração de eventos de vínculo (S-2200, S-2205, S-2206, S-2230, S-2299)
- Geração de eventos periódicos (S-1200, S-1299)
- Geração de eventos SST (S-2210, S-2220, S-2240)
- Validação de cada XML contra XSD oficial S-1.3
- Interface de download com guia visual de transmissão
- Registro de protocolo após transmissão pelo cliente

---

### Sprint S-10 — FGTS Digital
**Skills:** `fgts-digital-guide`, `payroll-engine`
**Entregáveis:**
- Geração de relatório FGTS por funcionário
- Totais mensais conciliados com a folha
- Instrução de recolhimento no FGTS Digital
- Alerta de vencimento (dia 20 de cada mês)

---

### Sprint S-11 — Reforma Tributária
**Skills:** `reform-tax-engine`, `nfe-processor`
**Entregáveis:**
- Tabela `aliquotas_rt` versionada por ano-calendário (2026–2033)
- Motor de cálculo IBS/CBS paramétrico
- Campos IBS/CBS nas NF-es (já obrigatórios desde jan/2026)
- Painel de acompanhamento da transição por ano
- Processo de atualização de alíquotas sem redeploy

---

### Sprint S-12 — Conectores e Refinamento
**Skills:** `mcp-builder`, `skill-creator`
**Entregáveis:**
- MCP connector Bling
- MCP connector Omie
- MCP connector Nuvemshop
- Relatórios gerenciais (DRE simplificada, fluxo de caixa básico)
- Notificações por e-mail/WhatsApp de prazos críticos
- Onboarding de novas skills via `skill-creator`

---

## Limites Legais

### O sistema PODE fazer (sem responsabilidade legal do SaaS)

- ✅ Calcular e exibir valores de impostos, encargos e contribuições
- ✅ Gerar XMLs prontos para transmissão (eSocial, EFD-Reinf) e relatório de conferência da DCTFWeb
- ✅ Emitir NF-e/NFC-e via NFE.io usando credenciais e certificado do próprio cliente (configurado na NFE.io, não no SaaS)
- ✅ Gerar holerites, recibos, avisos de férias, TRCT — documentos internos
- ✅ Alertar sobre prazos e inconsistências
- ✅ Consultar CNPJ e CPF na Receita Federal via NFE.io

### O sistema NÃO pode fazer (requer ação do cliente com certificado)

- ❌ Transmitir eventos eSocial (exige certificado A1/A3 do CNPJ do cliente)
- ❌ Transmitir a DCTFWeb no e-CAC (confissão de dívida — gerada automaticamente pelo governo a partir do eSocial/Reinf; cliente confirma e transmite com certificado)
- ❌ Transmitir EFD-Reinf (idem)
- ❌ Gerar ou pagar o DAS automaticamente (PGDAS-D sem API pública de transmissão)
- ❌ Assinar contratos, termos de rescisão ou documentos com validade jurídica
- ❌ Representar a empresa perante Receita Federal ou Ministério do Trabalho
- ❌ Escrituração contábil completa SPED Contábil (fora do escopo — Simples Nacional dispensado)
- ❌ Representação em fiscalização ou processos (sempre requer contador com CRC)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Mudança de alíquotas Simples Nacional / tabela INSS | **Alta — anual** | Motor 100% paramétrico. Alíquotas em tabela de BD versionada. Atualização sem redeploy. |
| Mudança no schema eSocial (nova versão S-x.x) | **Alta — bienal** | XSDs baixados do portal oficial. Versionamento de schemas. Alertas quando NT é publicada. |
| NFE.io descontinuar serviço ou mudar preços | **Média** | Abstração de serviço fiscal (interface) que permite trocar o provider. Alternativas: Focus NFe, eNotas, Plugnotas. |
| Cliente não renovar certificado digital | **Alta** | Alerta 60/30/15 dias antes do vencimento (data registrada no onboarding como metadado). |
| Erro de cálculo gerando DAS incorreto | **Média** | Memória de cálculo auditável. Aviso claro que cliente deve confirmar no PGDAS-D antes de gerar guia. |
| Vazamento de dados de funcionários ou NF (LGPD) | **Baixa-Média** | Schema isolado por tenant. Criptografia em repouso. Logs de acesso. DPA com clientes. |
| Reforma Tributária gerar campos NF antes do previsto | **Média** | Monitoramento de NTs da ENCAT e portal NFE.io. Atualizações de layout com prioridade máxima. |

---

## Decisões Abertas

Estes pontos devem ser decididos antes da implementação dos respectivos sprints.

| Decisão | Impacta | Opções |
|---------|---------|--------|
| Módulo de estoque vinculado às NF-es? | Sprint S-03 | A) Sim — rastrear entradas/saídas por NCM. B) Não — manter fiscal puro. C) Opcional por tenant. |
| Suporte a Lucro Presumido no futuro? | Arquitetura | Afeta modelagem do motor de cálculo. Motor paramétrico facilita adição — deve ser previsto agora se houver intenção. |
| Módulo de contas a pagar/receber? | Roadmap | Integração DP+Fiscal+Financeiro. Aumenta escopo mas cria diferencial competitivo relevante. |
| Qual provider de NF-e se NFE.io for inviável? | Sprint S-03 | Focus NFe, eNotas, Plugnotas — APIs similares. Definir interface de abstração agora. |
| Plano de precificação afeta features? | Produto | Freemium com limite de notas? Por funcionário? Por tenant? Impacta como features são empacotadas por tier. |
| Suporte a escrituração contábil SPED Contábil? | Escopo | Simples Nacional dispensado. Confirmar se não haverá tenants em Lucro Presumido/Real no futuro. |

---

## Cobertura vs. Escritório Contábil

| Função do escritório | Status | Observação |
|---------------------|--------|-----------|
| Emissão e conferência de notas fiscais | ✅ Automatizado | Via NFE.io + `nfe-processor` |
| Apuração mensal Simples Nacional (DAS) | ✅ Automatizado | Cálculo + memória de cálculo auditável |
| Preenchimento do PGDAS-D | ⚡ Assistido | Sistema calcula; cliente preenche e transmite |
| Conferência da DCTFWeb | ⚡ Relatório gerado | Declaração nasce automaticamente no e-CAC via eSocial/Reinf; cliente confere e transmite |
| Geração de EFD-Reinf | ⚡ XML gerado | XML pronto; transmissão com certificado do cliente |
| Folha de pagamento mensal | ✅ Automatizado | INSS, IRRF, VT, holerite PDF |
| Controle e cálculo de férias | ✅ Automatizado | Avisos, recibos, eSocial |
| 13º Salário | ✅ Automatizado | 1ª e 2ª parcela, proporcional |
| Cálculo de rescisão | ✅ Automatizado | 5 tipos, TRCT, prazo de pagamento |
| Envio de eventos eSocial | ⚡ XML gerado | Validado; transmissão com certificado do cliente |
| Controle de prazos e obrigações | ✅ Automatizado | Calendário de alertas por tenant |
| Adaptação à Reforma Tributária | ✅ Paramétrico | Motor versionado por ano-calendário até 2033 |
| Escrituração contábil SPED Contábil | ❌ Fora do escopo | Não obrigatório para Simples Nacional |
| Representação em fiscalização/processos | ❌ Fora do escopo | Sempre requer contador com CRC |

> **Resultado:** o sistema cobre automaticamente ~80% das tarefas rotineiras de
> um escritório contábil para empresas do Simples Nacional. O restante são
> transmissões que legalmente exigem assinatura digital do próprio cliente.
> Nenhuma responsabilidade legal contábil recai sobre o SaaS.
