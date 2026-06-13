/**
 * Validação de assinatura de webhook (gancho pluggable).
 *
 * ⚠️ O esquema EXATO da NFE.io ainda não foi confirmado (header, o que é assinado,
 * encoding do segredo). Por isso a verificação fica DESLIGADA por padrão
 * (NFEIO_WEBHOOK_SECRET ausente) — o receptor só registra a assinatura recebida.
 * Quando capturarmos uma entrega real e confirmarmos o algoritmo, basta ligar.
 *
 * A implementação abaixo é o caso comum (HMAC-SHA256 hex sobre o corpo cru) e
 * serve de ponto de partida — revisar contra a entrega real antes de exigir.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** HMAC-SHA256 do corpo cru, em hex. */
export function hmacSha256Hex(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Compara em tempo constante a assinatura recebida com a esperada. */
export function assinaturaValida(secret: string, rawBody: string, assinaturaRecebida: string): boolean {
  const esperada = hmacSha256Hex(secret, rawBody)
  const a = Buffer.from(esperada)
  const b = Buffer.from(assinaturaRecebida.trim().toLowerCase())
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
