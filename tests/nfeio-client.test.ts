/**
 * Testes do cliente NFE.io — fetch mockado (sem rede).
 * O header de auth (`Authorization: <token>` sem Bearer) é a armadilha #1 do
 * CLAUDE.md §6, então é o que mais importa travar aqui.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NfeioClient, NfeioError } from '../src/nfeio/client.js'

const API_KEY = 'fake-key-123'

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NfeioClient', () => {
  it('getCompany monta URL e envia Authorization sem Bearer', async () => {
    const spy = mockFetch(200, { company: { id: 'c1', name: 'ACME', federalTaxNumber: 46070993000179 } })
    const client = new NfeioClient({ apiKey: API_KEY, baseUrl: 'https://api.nfse.io' })

    const company = await client.getCompany('c1')

    expect(company).toMatchObject({ id: 'c1', name: 'ACME' })
    const [url, init] = spy.mock.calls[0]!
    expect(url).toBe('https://api.nfse.io/v2/companies/c1')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe(API_KEY) // sem "Bearer "
  })

  it('lança NfeioError com status e corpo em resposta não-2xx', async () => {
    mockFetch(404, { message: 'not found' })
    const client = new NfeioClient({ apiKey: API_KEY })

    await expect(client.getCompany('inexistente')).rejects.toMatchObject({
      name: 'NfeioError',
      status: 404,
    })
  })

  it('consultarCnpj usa o path documentado /v2/legalentities/basicInfo/{cnpj}', async () => {
    const spy = mockFetch(200, { ok: true })
    const client = new NfeioClient({
      apiKey: API_KEY,
      consultaBaseUrl: 'https://api.nfe.io',
    })

    await client.consultarCnpj('46070993000179')

    const [url] = spy.mock.calls[0]!
    expect(url).toBe('https://api.nfe.io/v2/legalentities/basicInfo/46070993000179')
  })

  it('consultarEntradaPorChave usa o path de distribuição (configurável)', async () => {
    const spy = mockFetch(200, { nfe: {} })
    const client = new NfeioClient({
      apiKey: API_KEY,
      consultaBaseUrl: 'https://api.nfe.io',
      distribuicaoPath: '/v1/distribution/accessKey',
    })

    await client.consultarEntradaPorChave('9'.repeat(44))

    const [url] = spy.mock.calls[0]!
    expect(url).toBe(`https://api.nfe.io/v1/distribution/accessKey/${'9'.repeat(44)}`)
  })

  it('construtor rejeita apiKey vazia', () => {
    expect(() => new NfeioClient({ apiKey: '' })).toThrow()
  })

  it('NfeioError carrega status e corpo para depuração', () => {
    const err = new NfeioError(400, 'erro', { campo: 'cnpj' })
    expect(err.status).toBe(400)
    expect(err.body).toEqual({ campo: 'cnpj' })
  })
})
