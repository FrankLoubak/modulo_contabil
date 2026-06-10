<div align="center">

# 🧾 ContaAI

### SaaS Contábil com Inteligência Artificial
**Substituto digital de escritório contábil para empresas do Simples Nacional**

---

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow?style=flat-square)](.)
[![Regime](https://img.shields.io/badge/regime-Simples%20Nacional-blue?style=flat-square)](.)
[![Reforma Tributária](https://img.shields.io/badge/reforma%20tributária-2026--2033-orange?style=flat-square)](.)
[![Stack](https://img.shields.io/badge/stack-Node.js%20·%20React%20·%20PostgreSQL-informational?style=flat-square)](.)
[![Licença](https://img.shields.io/badge/licença-proprietária-red?style=flat-square)](.)

</div>

---

## O que é

**ContaAI** é um SaaS multi-tenant que automatiza os serviços de um escritório contábil para pequenas e médias empresas do **Simples Nacional** — sem armazenar certificados digitais, sem assumir responsabilidade legal de transmissão, e sem exigir conhecimento contábil do usuário.

O sistema cobre aproximadamente **80% das tarefas rotineiras** de um escritório: apuração de impostos, emissão e conferência de notas fiscais, folha de pagamento, férias, 13º, rescisão e geração de eventos eSocial.

> **Modelo de responsabilidade:** o sistema prepara todos os arquivos e cálculos.
> A transmissão às plataformas governamentais é sempre feita pelo cliente com seu próprio certificado digital.

---

## Funcionalidades

### 📄 Fiscal
- Emissão de NF-e e NFC-e via [NFE.io](https://nfe.io)
- Consulta e validação de NF-e de fornecedores (chave de acesso → SEFAZ)
- Classificação automática de CFOP por tipo de operação
- Campos IBS/CBS obrigatórios desde jan/2026 (Reforma Tributária)
- Alertas de irregularidades em notas recebidas

### 🧮 Tributário — Simples Nacional
- Cálculo do DAS com RBT12, faixas dos Anexos I–V e fator R
- Alíquota efetiva com memória de cálculo auditável em PDF
- Deduções de ICMS-ST e ISS retido na fonte
- Geração de instrução PGDAS-D passo a passo
- Relatório de conferência da DCTFWeb (gerada automaticamente no e-CAC via eSocial/Reinf) e eventos EFD-Reinf prontos para transmissão
- Relatório DEFIS e DASN-SIMEI (MEI)

### 👥 Departamento Pessoal
- Folha mensal: INSS progressivo, IRRF, VT, extras, adicionais
- Holerite individual em PDF
- Controle de férias: períodos aquisitivo/concessivo + alertas de vencimento
- Cálculo de 13º salário (1ª e 2ª parcela + proporcional)
- Rescisão para 5 tipos: sem justa causa, pedido de demissão, justa causa, acordo (art. 484-A CLT), término de contrato
- TRCT gerado + alerta automático de prazo de pagamento

### 📋 eSocial S-1.3
- Geração de 15+ eventos XML validados contra XSD oficial
- Eventos de tabela: S-1000, S-1005, S-1020
- Eventos de vínculo: S-2200, S-2205, S-2206, S-2230, S-2299
- Eventos periódicos: S-1200, S-1299 (prazo dia 15)
- SST: S-2210 (CAT), S-2220 (ASO), S-2240 (riscos)
- Guia visual de transmissão pelo portal eSocial Empresas

### 🔌 Integrações
| Canal | Descrição |
|-------|-----------|
| REST API | Endpoint com contrato OpenAPI público |
| Webhook | Recebe eventos de plataformas de pagamento e NFE.io |
| Import CSV/XML | Mapeamento configurável por tenant |
| Polling NFE.io | Fallback automático para sistemas sem webhook |
| MCP Connectors | Bling, Omie, Nuvemshop, Tiny ERP |

---

## Reforma Tributária 2026–2033

O motor fiscal é **paramétrico e versionado por ano-calendário**. Alíquotas e regras são armazenadas em banco de dados — nunca como constantes no código.

| Ano | Mudança | Status no sistema |
|-----|---------|-------------------|
| 2026 | CBS 0,9% + IBS 0,1% em fase de teste | ✅ Campos obrigatórios implementados |
| 2027 | CBS plena (~8,8%), extinção PIS/COFINS | 🗓 Previsto no motor |
| 2029–2032 | IBS crescente, ICMS/ISS reduzidos gradualmente | 🗓 Tabela versionada por ano |
| 2033 | IVA Dual pleno, extinção ICMS/ISS/PIS/COFINS/IPI | 🗓 Previsto no motor |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTAAI SAAS                           │
│                                                             │
│  D6 ─ Integração & API  ←── qualquer sistema de vendas     │
│            │                                                │
│            ▼                                                │
│  D1 ─ Fiscal Entrada    ←── NFE.io (NF-e/NFC-e)            │
│            │                                                │
│            ▼                                                │
│  D2 ─ Apuração Tributária   (DAS · DARF · IBS/CBS)         │
│            │                                                │
│  D3 ─ Obrigações Acessórias (DCTFWeb · EFD-Reinf · PGDAS)  │
│                                                             │
│  D4 ─ Departamento Pessoal  (Folha · Férias · Rescisão)    │
│            │                                                │
│  D5 ─ eSocial S-1.3  (XMLs validados → download cliente)   │
└─────────────────────────────────────────────────────────────┘
```

### Multi-tenant: schema-per-tenant no PostgreSQL

Cada empresa cliente possui seu próprio schema isolado.
Isolamento de dados equivalente a banco separado, com custo operacional de instância única.

```
empresa-a.contaai.com.br  →  schema: tenant_empresa_a
empresa-b.contaai.com.br  →  schema: tenant_empresa_b
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + Fastify |
| Banco de dados | PostgreSQL (schema-per-tenant) |
| Fila | Bull + Redis |
| Geração de XML | xmlbuilder2 + validação libxmljs2 |
| Integração NF | NFE.io REST API |
| Autenticação | JWT + RBAC por tenant |
| Infraestrutura | Hostinger VPS + Docker Compose |
| CI/CD | GitHub Actions |

---

## Roadmap de Sprints

| Sprint | Módulo | Status |
|--------|--------|--------|
| S-01 | Fundação SaaS — multi-tenant, onboarding CNPJ, auth | 🔲 Planejado |
| S-02 | Integração fiscal — REST, webhook, CSV, polling | 🔲 Planejado |
| S-03 | Processamento NF-e / NFC-e | 🔲 Planejado |
| S-04 | Apuração DAS — Simples Nacional | 🔲 Planejado |
| S-05 | Obrigações acessórias — conferência DCTFWeb, EFD-Reinf, PGDAS | 🔲 Planejado |
| S-06 | Folha de pagamento | 🔲 Planejado |
| S-07 | Férias e 13º salário | 🔲 Planejado |
| S-08 | Admissão e rescisão | 🔲 Planejado |
| S-09 | eSocial S-1.3 | 🔲 Planejado |
| S-10 | FGTS Digital | 🔲 Planejado |
| S-11 | Reforma Tributária — motor paramétrico | 🔲 Planejado |
| S-12 | Conectores MCP + refinamento | 🔲 Planejado |

---

## Limites legais

O sistema foi desenhado para operar **sem responsabilidade legal contábil** sobre o SaaS.

**O sistema faz:**
- ✅ Calcula impostos, encargos e contribuições
- ✅ Gera XMLs validados (eSocial, EFD-Reinf) + relatório de conferência DCTFWeb
- ✅ Emite NF-e/NFC-e usando credenciais do próprio cliente na NFE.io
- ✅ Gera holerites, recibos, TRCT e avisos em PDF
- ✅ Alerta sobre prazos e inconsistências fiscais

**Requer ação do cliente com certificado digital:**
- ⚡ Transmissão de eventos eSocial
- ⚡ Transmissão da DCTFWeb no e-CAC e envio da EFD-Reinf
- ⚡ Confirmação e pagamento do DAS no PGDAS-D
- ⚡ Assinatura de documentos com validade jurídica

**Fora do escopo:**
- ❌ Escrituração contábil SPED Contábil (não obrigatório para Simples Nacional)
- ❌ Representação em fiscalizações ou processos administrativos

---

## Documentação técnica

| Arquivo | Descrição |
|---------|-----------|
| `.claude/PLANO_SAAS_CONTABIL.md` | Plano arquitetural completo para uso com Claude Code |
| `docs/REFORMA_TRIBUTARIA.md` | Cronograma detalhado da transição 2026–2033 |
| `docs/ESOCIAL_EVENTOS.md` | Referência de todos os eventos S-1.3 implementados |
| `docs/LIMITES_LEGAIS.md` | Escopo de responsabilidade do SaaS |

---

## Convenção de código

```
Comentários:        Português
Variáveis/funções:  inglês (camelCase)
Commits:            inglês (Conventional Commits)
Arquivos:           kebab-case
```

---

## Aviso

> Este software é uma ferramenta de auxílio à gestão contábil.
> Não substitui a responsabilidade legal de um contador registrado no CRC para
> obrigações que exijam assinatura profissional. Alíquotas e regras tributárias
> mudam com frequência — verifique sempre a legislação vigente.

---

<div align="center">

Desenvolvido por [Frank Loubak](https://github.com/FrankLoubak)

</div>
