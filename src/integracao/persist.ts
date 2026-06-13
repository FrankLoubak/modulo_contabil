/**
 * Persistência idempotente de NotaFiscalEvento no schema do tenant (Sprint A2).
 *
 * Idempotência por `chave_acesso` (UNIQUE): reentrega do mesmo evento faz UPDATE
 * do estado mutável (status, totais, URLs), nunca duplica. Itens são
 * re-sincronizados (delete + insert) dentro da mesma transação.
 */
import type { Kysely } from 'kysely'
import type { NotaFiscalEvento } from './canonical.js'
import type { Database } from '../types.js'
import { toJsonb } from './jsonb.js'

export interface PersistResult {
  id: string
}

/** Insere ou atualiza a nota (por chave_acesso) e re-sincroniza seus itens. */
export async function persistNotaFiscal(
  db: Kysely<Database>,
  ev: NotaFiscalEvento,
): Promise<PersistResult> {
  return db.transaction().execute(async (trx) => {
    const nota = await trx
      .insertInto('notas_fiscais')
      .values({
        chave_acesso: ev.chaveAcesso,
        tipo: ev.tipo,
        direcao: ev.direcao,
        origem: ev.origem,
        numero: ev.numero ?? null,
        serie: ev.serie ?? null,
        data_emissao: ev.dataEmissao ?? null,
        emitente_cnpj: ev.emitente.cnpj,
        emitente_razao: ev.emitente.razaoSocial ?? null,
        destinatario_cnpj: ev.destinatario?.cnpj ?? null,
        destinatario_cpf: ev.destinatario?.cpf ?? null,
        destinatario_razao: ev.destinatario?.razaoSocial ?? null,
        status: ev.status,
        valor_total: ev.totais.valorTotal,
        totais: toJsonb(ev.totais),
        xml_url: ev.xmlUrl ?? null,
        danfe_url: ev.danfeUrl ?? null,
        nfeio_id: ev.nfeioId ?? null,
      })
      .onConflict((oc) =>
        oc.column('chave_acesso').doUpdateSet({
          // Só o estado mutável é atualizado numa reentrega
          status: ev.status,
          valor_total: ev.totais.valorTotal,
          totais: toJsonb(ev.totais),
          xml_url: ev.xmlUrl ?? null,
          danfe_url: ev.danfeUrl ?? null,
          nfeio_id: ev.nfeioId ?? null,
          updated_at: new Date(),
        }),
      )
      .returning('id')
      .executeTakeFirstOrThrow()

    // Re-sincroniza itens: remove os antigos e regrava os do evento
    await trx.deleteFrom('notas_fiscais_itens').where('nota_id', '=', nota.id).execute()
    if (ev.itens.length > 0) {
      await trx
        .insertInto('notas_fiscais_itens')
        .values(
          ev.itens.map((it) => ({
            nota_id: nota.id,
            descricao: it.descricao,
            ncm: it.ncm ?? null,
            cfop: it.cfop ?? null,
            quantidade: it.quantidade,
            valor_unitario: it.valorUnitario,
            valor_total: it.valorTotal,
            impostos: it.impostos !== undefined ? toJsonb(it.impostos) : null,
          })),
        )
        .execute()
    }

    return { id: nota.id }
  })
}
