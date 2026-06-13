/**
 * Normalizador do canal CSV/XML import (ERP legado, Excel).
 * Recebe um registro já parseado (Record<string,string>) — uma linha = uma nota
 * com um item. O parsing do arquivo (split/encoding) fica na rota de upload.
 *
 * Colunas esperadas (mapeamento fixo do MVP; mapeamento por tenant entra depois):
 *   chave_acesso, tipo, direcao, numero, serie, data_emissao,
 *   emitente_cnpj, emitente_razao, destinatario_cnpj, destinatario_razao,
 *   descricao, ncm, cfop, quantidade, valor_unitario, valor_total
 */
import { z } from 'zod'
import type { NotaFiscalEvento } from '../canonical.js'

const numero = z
  .string()
  .transform((s) => Number(s.replace(',', '.')))
  .pipe(z.number().nonnegative())

const csvSchema = z.object({
  chave_acesso: z.string().regex(/^\d{44}$/),
  tipo: z.enum(['NFe', 'NFCe']),
  direcao: z.enum(['saida', 'entrada']).default('saida'),
  numero: z.string().optional(),
  serie: z.string().optional(),
  data_emissao: z.coerce.date().optional(),
  emitente_cnpj: z.string().regex(/^\d{14}$/),
  emitente_razao: z.string().optional(),
  destinatario_cnpj: z.string().regex(/^\d{14}$/).optional(),
  destinatario_razao: z.string().optional(),
  descricao: z.string().min(1),
  ncm: z.string().optional(),
  cfop: z.string().optional(),
  quantidade: numero,
  valor_unitario: numero,
  valor_total: numero,
})

/** Valida uma linha CSV e devolve o evento canônico. Lança ZodError se inválido. */
export function normalizeFromCsv(record: Record<string, string>): NotaFiscalEvento {
  const d = csvSchema.parse(record)
  return {
    origem: 'csv',
    tipo: d.tipo,
    direcao: d.direcao,
    chaveAcesso: d.chave_acesso,
    ...(d.numero !== undefined ? { numero: d.numero } : {}),
    ...(d.serie !== undefined ? { serie: d.serie } : {}),
    ...(d.data_emissao !== undefined ? { dataEmissao: d.data_emissao } : {}),
    emitente: {
      cnpj: d.emitente_cnpj,
      ...(d.emitente_razao !== undefined ? { razaoSocial: d.emitente_razao } : {}),
    },
    ...(d.destinatario_cnpj !== undefined || d.destinatario_razao !== undefined
      ? {
          destinatario: {
            ...(d.destinatario_cnpj !== undefined ? { cnpj: d.destinatario_cnpj } : {}),
            ...(d.destinatario_razao !== undefined ? { razaoSocial: d.destinatario_razao } : {}),
          },
        }
      : {}),
    itens: [
      {
        descricao: d.descricao,
        ...(d.ncm !== undefined ? { ncm: d.ncm } : {}),
        ...(d.cfop !== undefined ? { cfop: d.cfop } : {}),
        quantidade: d.quantidade,
        valorUnitario: d.valor_unitario,
        valorTotal: d.valor_total,
      },
    ],
    totais: { valorTotal: d.valor_total },
    status: 'autorizada', // CSV não carrega status; assume autorizada
  }
}
