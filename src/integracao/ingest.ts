/**
 * Ingestão de um NotaFiscalEvento: persiste e registra o evento bruto em
 * `nfe_eventos_raw` (auditoria/replay). Reutilizado por todos os canais
 * (REST push agora; webhook e distribuição depois).
 *
 * O payload bruto é gravado sempre — em sucesso (status processado, com nota_id)
 * ou falha (status erro, com a mensagem) — para nunca perder o original (§4).
 */
import type { Kysely } from 'kysely'
import type { Database } from '../types.js'
import type { NotaFiscalEvento, OrigemEvento } from './canonical.js'
import { persistNotaFiscal } from './persist.js'
import { toJsonb } from './jsonb.js'

export interface IngestResult {
  id: string
  chaveAcesso: string
  status: string
}

/**
 * Registra o payload bruto de um webhook NFE.io sem processá-lo ainda.
 * A normalização (normalizeFromNfeio) só roda quando o payload real for
 * confirmado (§6); até lá guardamos com status 'recebido' para replay.
 * Retorna o id do evento bruto.
 */
export async function recordRawWebhook(
  db: Kysely<Database>,
  payload: unknown,
  assinatura?: string,
): Promise<number> {
  const row = await db
    .insertInto('nfe_eventos_raw')
    .values({
      origem: 'nfeio',
      chave_acesso: null,
      payload: toJsonb(payload),
      assinatura: assinatura ?? null,
      status_processamento: 'recebido',
      erro: null,
      nota_id: null,
      processed_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

export async function ingestEvento(
  db: Kysely<Database>,
  origem: OrigemEvento,
  rawPayload: unknown,
  evento: NotaFiscalEvento,
  assinatura?: string,
): Promise<IngestResult> {
  try {
    const { id } = await persistNotaFiscal(db, evento)
    await db
      .insertInto('nfe_eventos_raw')
      .values({
        origem,
        chave_acesso: evento.chaveAcesso,
        payload: toJsonb(rawPayload),
        assinatura: assinatura ?? null,
        status_processamento: 'processado',
        erro: null,
        nota_id: id,
        processed_at: new Date(),
      })
      .execute()
    return { id, chaveAcesso: evento.chaveAcesso, status: evento.status }
  } catch (err) {
    // Registra a falha sem perder o payload original
    await db
      .insertInto('nfe_eventos_raw')
      .values({
        origem,
        chave_acesso: evento.chaveAcesso,
        payload: toJsonb(rawPayload),
        assinatura: assinatura ?? null,
        status_processamento: 'erro',
        erro: err instanceof Error ? err.message : String(err),
        nota_id: null,
        processed_at: null,
      })
      .execute()
    throw err
  }
}
