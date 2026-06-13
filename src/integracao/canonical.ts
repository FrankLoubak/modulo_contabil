/**
 * Modelo canônico interno de nota fiscal (CLAUDE.md §5 / PLANO — Integração).
 *
 * Todos os 5 canais (REST push, webhook NFE.io, CSV/XML, polling, MCP) normalizam
 * para `NotaFiscalEvento`. Os domínios fiscais (A3+) só conhecem este formato —
 * nunca a origem nem o payload bruto do provedor.
 */

export type OrigemEvento = 'api' | 'webhook' | 'nfeio' | 'csv' | 'polling' | 'mcp'
export type TipoNota = 'NFe' | 'NFCe'
export type DirecaoNota = 'saida' | 'entrada'
export type StatusNota = 'autorizada' | 'cancelada' | 'rejeitada' | 'pendente'

export interface ItemNF {
  descricao: string
  ncm?: string
  cfop?: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  // Impostos destacados por item (ICMS/PIS/COFINS/IBS/CBS...). JSONB no banco.
  impostos?: Record<string, unknown>
}

export interface TotaisNF {
  valorTotal: number
  // Reforma Tributária — obrigatórios desde jan/2026 (lidos de aliquotas_rt, nunca hardcoded)
  ibs?: number
  cbs?: number
  // Tributos clássicos quando destacados
  icms?: number
  pis?: number
  cofins?: number
  outros?: Record<string, unknown>
}

export interface NotaFiscalEvento {
  origem: OrigemEvento
  tipo: TipoNota
  direcao: DirecaoNota
  chaveAcesso: string // 44 dígitos — chave de idempotência
  numero?: string
  serie?: string
  dataEmissao?: Date
  emitente: { cnpj: string; razaoSocial?: string }
  destinatario?: { cnpj?: string; cpf?: string; razaoSocial?: string }
  itens: ItemNF[]
  totais: TotaisNF
  status: StatusNota
  xmlUrl?: string
  danfeUrl?: string
  nfeioId?: string // id da nota na NFE.io, para correlação
}
