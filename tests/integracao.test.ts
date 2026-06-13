/**
 * Caminhos críticos do A2 (AT): normalização dos canais e idempotência por
 * chave_acesso na persistência.
 *
 * Requer Postgres de dev no ar (docker compose up -d).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NotaFiscalEvento } from '../src/integracao/canonical.js'
import { normalizeFromRest } from '../src/integracao/normalize/from-rest.js'
import { normalizeFromCsv } from '../src/integracao/normalize/from-csv.js'
import { persistNotaFiscal } from '../src/integracao/persist.js'
import { pool, publicDb, withTenantDb } from '../src/db.js'
import { provisionTenant, schemaForSlug } from '../src/tenant/provision.js'

const CHAVE = '1'.repeat(44)

describe('normalização dos canais', () => {
  it('REST → canônico (origem api) e rejeita payload inválido', () => {
    const ev = normalizeFromRest({
      tipo: 'NFe',
      chaveAcesso: CHAVE,
      emitente: { cnpj: '46070993000179', razaoSocial: 'ACME' },
      itens: [{ descricao: 'Produto', quantidade: 2, valorUnitario: 10, valorTotal: 20 }],
      totais: { valorTotal: 20, ibs: 0.02, cbs: 0.18 },
    })
    expect(ev.origem).toBe('api')
    expect(ev.direcao).toBe('saida') // default
    expect(ev.status).toBe('autorizada') // default
    expect(ev.itens).toHaveLength(1)

    // chave de acesso inválida → lança
    expect(() => normalizeFromRest({ tipo: 'NFe', chaveAcesso: '123', emitente: { cnpj: '46070993000179' }, itens: [{ descricao: 'x', quantidade: 1, valorUnitario: 1, valorTotal: 1 }], totais: { valorTotal: 1 } })).toThrow()
  })

  it('CSV → canônico (origem csv) com um item', () => {
    const ev = normalizeFromCsv({
      chave_acesso: CHAVE,
      tipo: 'NFe',
      emitente_cnpj: '46070993000179',
      descricao: 'Produto',
      quantidade: '3',
      valor_unitario: '5,50',
      valor_total: '16,50',
    })
    expect(ev.origem).toBe('csv')
    expect(ev.itens[0]?.valorUnitario).toBe(5.5) // vírgula decimal convertida
    expect(ev.totais.valorTotal).toBe(16.5)
  })
})

describe('persistência idempotente', () => {
  const SLUG = 'a2_persist'

  beforeAll(async () => {
    await provisionTenant(SLUG)
  })

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaForSlug(SLUG)} CASCADE`)
    await publicDb.destroy()
  })

  function evento(over: Partial<NotaFiscalEvento> = {}): NotaFiscalEvento {
    return {
      origem: 'api',
      tipo: 'NFe',
      direcao: 'saida',
      chaveAcesso: CHAVE,
      emitente: { cnpj: '46070993000179', razaoSocial: 'ACME' },
      itens: [{ descricao: 'A', quantidade: 1, valorUnitario: 10, valorTotal: 10 }],
      totais: { valorTotal: 10 },
      status: 'autorizada',
      ...over,
    }
  }

  it('mesma chave_acesso 2x não duplica e atualiza o status', async () => {
    await withTenantDb(SLUG, async (db) => {
      await persistNotaFiscal(db, evento())
      await persistNotaFiscal(db, evento({ status: 'cancelada' }))

      const count = await db
        .selectFrom('notas_fiscais')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('chave_acesso', '=', CHAVE)
        .executeTakeFirstOrThrow()
      expect(Number(count.n)).toBe(1)

      const nota = await db
        .selectFrom('notas_fiscais')
        .select('status')
        .where('chave_acesso', '=', CHAVE)
        .executeTakeFirstOrThrow()
      expect(nota.status).toBe('cancelada')
    })
  })

  it('re-sincroniza itens (2 itens → depois 1 item)', async () => {
    const chave2 = '2'.repeat(44)
    await withTenantDb(SLUG, async (db) => {
      await persistNotaFiscal(
        db,
        evento({
          chaveAcesso: chave2,
          itens: [
            { descricao: 'A', quantidade: 1, valorUnitario: 10, valorTotal: 10 },
            { descricao: 'B', quantidade: 1, valorUnitario: 5, valorTotal: 5 },
          ],
        }),
      )
      await persistNotaFiscal(
        db,
        evento({ chaveAcesso: chave2, itens: [{ descricao: 'A', quantidade: 1, valorUnitario: 10, valorTotal: 10 }] }),
      )

      const nota = await db
        .selectFrom('notas_fiscais')
        .select('id')
        .where('chave_acesso', '=', chave2)
        .executeTakeFirstOrThrow()
      const count = await db
        .selectFrom('notas_fiscais_itens')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('nota_id', '=', nota.id)
        .executeTakeFirstOrThrow()
      expect(Number(count.n)).toBe(1)
    })
  })
})
