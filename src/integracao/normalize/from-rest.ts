/**
 * Normalizador do canal REST push (ERPs/PDV enviam JSON no nosso contrato).
 * Contrato definido por nós → validação rigorosa com Zod (CLAUDE.md §4).
 */
import { z } from 'zod'
import type { NotaFiscalEvento } from '../canonical.js'

const itemSchema = z.object({
  descricao: z.string().min(1),
  ncm: z.string().optional(),
  cfop: z.string().optional(),
  quantidade: z.number().nonnegative(),
  valorUnitario: z.number().nonnegative(),
  valorTotal: z.number().nonnegative(),
  impostos: z.record(z.unknown()).optional(),
})

const restSchema = z.object({
  tipo: z.enum(['NFe', 'NFCe']),
  direcao: z.enum(['saida', 'entrada']).default('saida'),
  chaveAcesso: z.string().regex(/^\d{44}$/, 'chave de acesso deve ter 44 dígitos'),
  numero: z.string().optional(),
  serie: z.string().optional(),
  dataEmissao: z.coerce.date().optional(),
  emitente: z.object({ cnpj: z.string().regex(/^\d{14}$/), razaoSocial: z.string().optional() }),
  destinatario: z
    .object({
      cnpj: z.string().regex(/^\d{14}$/).optional(),
      cpf: z.string().regex(/^\d{11}$/).optional(),
      razaoSocial: z.string().optional(),
    })
    .optional(),
  itens: z.array(itemSchema).min(1),
  totais: z.object({
    valorTotal: z.number().nonnegative(),
    ibs: z.number().optional(),
    cbs: z.number().optional(),
    icms: z.number().optional(),
    pis: z.number().optional(),
    cofins: z.number().optional(),
  }),
  status: z.enum(['autorizada', 'cancelada', 'rejeitada', 'pendente']).default('autorizada'),
})

/** Valida o payload REST e devolve o evento canônico. Lança ZodError se inválido. */
export function normalizeFromRest(payload: unknown): NotaFiscalEvento {
  const d = restSchema.parse(payload)
  // Mapeamento com spreads condicionais: exactOptionalPropertyTypes não aceita
  // chaves com valor undefined, que é o que o Zod produz em campos opcionais.
  return {
    origem: 'api',
    tipo: d.tipo,
    direcao: d.direcao,
    chaveAcesso: d.chaveAcesso,
    ...(d.numero !== undefined ? { numero: d.numero } : {}),
    ...(d.serie !== undefined ? { serie: d.serie } : {}),
    ...(d.dataEmissao !== undefined ? { dataEmissao: d.dataEmissao } : {}),
    emitente: {
      cnpj: d.emitente.cnpj,
      ...(d.emitente.razaoSocial !== undefined ? { razaoSocial: d.emitente.razaoSocial } : {}),
    },
    ...(d.destinatario !== undefined
      ? {
          destinatario: {
            ...(d.destinatario.cnpj !== undefined ? { cnpj: d.destinatario.cnpj } : {}),
            ...(d.destinatario.cpf !== undefined ? { cpf: d.destinatario.cpf } : {}),
            ...(d.destinatario.razaoSocial !== undefined
              ? { razaoSocial: d.destinatario.razaoSocial }
              : {}),
          },
        }
      : {}),
    itens: d.itens.map((it) => ({
      descricao: it.descricao,
      ...(it.ncm !== undefined ? { ncm: it.ncm } : {}),
      ...(it.cfop !== undefined ? { cfop: it.cfop } : {}),
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
      ...(it.impostos !== undefined ? { impostos: it.impostos } : {}),
    })),
    totais: {
      valorTotal: d.totais.valorTotal,
      ...(d.totais.ibs !== undefined ? { ibs: d.totais.ibs } : {}),
      ...(d.totais.cbs !== undefined ? { cbs: d.totais.cbs } : {}),
      ...(d.totais.icms !== undefined ? { icms: d.totais.icms } : {}),
      ...(d.totais.pis !== undefined ? { pis: d.totais.pis } : {}),
      ...(d.totais.cofins !== undefined ? { cofins: d.totais.cofins } : {}),
    },
    status: d.status,
  }
}
