/**
 * Cliente REST da NFE.io (CLAUDE.md §6).
 *
 * Armadilhas confirmadas contra a API viva (2026-06-13):
 *   - Base de emissão: https://api.nfse.io
 *   - Auth: header `Authorization: <token>` — SEM prefixo `Bearer`
 *   - Campos em inglês: federalTaxNumber, name, tradeName, taxRegime...
 *
 * Modelo de credencial: 1 API key por conta (env NFEIO_API_KEY) → N companies
 * (companyId por tenant, vindo do banco). A API key NÃO fica no banco.
 */
import { env } from '../env.js'

export class NfeioError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'NfeioError'
  }
}

export interface NfeioClientOptions {
  apiKey: string
  baseUrl?: string // emissão (default api.nfse.io)
  consultaBaseUrl?: string // consulta CNPJ/distribuição
}

// Dados básicos de uma empresa na NFE.io (subconjunto usado pelo SaaS)
export interface NfeioCompany {
  id: string
  name: string
  tradeName?: string
  federalTaxNumber: number
  taxRegime?: string
  status?: string
}

export class NfeioClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly consultaBaseUrl: string

  constructor(opts: NfeioClientOptions) {
    if (opts.apiKey === '') throw new Error('NfeioClient: apiKey vazia')
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl ?? env.NFEIO_BASE_URL).replace(/\/$/, '')
    this.consultaBaseUrl = (opts.consultaBaseUrl ?? env.NFEIO_CONSULTA_BASE_URL).replace(/\/$/, '')
  }

  /** Cliente a partir do ambiente (NFEIO_API_KEY). Lança se não configurado. */
  static fromEnv(): NfeioClient {
    if (env.NFEIO_API_KEY === undefined || env.NFEIO_API_KEY === '') {
      throw new Error('NFEIO_API_KEY não configurada no ambiente')
    }
    return new NfeioClient({ apiKey: env.NFEIO_API_KEY })
  }

  /** Consulta os dados de uma company (emitente) por id. */
  getCompany(companyId: string): Promise<NfeioCompany> {
    return this.request<{ company: NfeioCompany }>('GET', this.baseUrl, `/v2/companies/${companyId}`).then(
      (r) => r.company,
    )
  }

  /**
   * Consulta básica de CNPJ (LegalEntities) na Receita Federal.
   * Path confirmado na doc; host da API de consulta ainda a confirmar (o
   * NFEIO_CONSULTA_BASE_URL default deu 404 — pode exigir produto habilitado).
   */
  consultarCnpj(federalTaxNumber: string): Promise<unknown> {
    return this.request('GET', this.consultaBaseUrl, `/v2/legalentities/basicInfo/${federalTaxNumber}`)
  }

  // Executa a requisição com o header de auth correto e trata erros (Regra 8:
  // expõe status + corpo para não depurar no escuro).
  private async request<T>(method: string, base: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: this.apiKey, // SEM Bearer (CLAUDE.md §6)
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const text = await res.text()
    const parsed: unknown = text === '' ? undefined : safeJson(text)

    if (!res.ok) {
      throw new NfeioError(res.status, `NFE.io ${method} ${path} → ${res.status}`, parsed ?? text)
    }
    return parsed as T
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
