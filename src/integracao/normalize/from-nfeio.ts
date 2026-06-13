/**
 * Normalizador do canal NFE.io (webhook + emissão) → NotaFiscalEvento.
 *
 * ⚠️ STUB DELIBERADO. O payload exato do webhook da NFE.io não foi confirmado
 * (a doc pública não expõe o schema de notificação nem a assinatura; ver
 * docs/plan-A2-integracao.md). Para não inventar nomes de campo (CLAUDE.md §6),
 * este normalizador será preenchido a partir de uma ENTREGA REAL capturada.
 *
 * Campos esperados conforme §6 (a confirmar): `authorization.accessKey`,
 * `buyer`, `items[].{description,ncm,cfop,quantity,unitAmount}`, `payments`.
 */
import type { NotaFiscalEvento } from '../canonical.js'

export function normalizeFromNfeio(_payload: unknown): NotaFiscalEvento {
  throw new Error(
    'normalizeFromNfeio: não implementado — aguardando payload real do webhook NFE.io (Regra 8)',
  )
}

/**
 * Distribuição (entradas): NF-e recebida pela chave → NotaFiscalEvento.
 * STUB pelo mesmo motivo — o schema do retorno da distribuição não foi
 * confirmado. direcao será 'entrada'.
 */
export function normalizeFromNfeioDistribuicao(_payload: unknown): NotaFiscalEvento {
  throw new Error(
    'normalizeFromNfeioDistribuicao: não implementado — aguardando payload real da distribuição (Regra 8)',
  )
}
