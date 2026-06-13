/**
 * Validação de CNPJ (dígitos verificadores — módulo 11).
 * Opera sobre 14 dígitos numéricos; a sanitização (remover ./-) fica a cargo
 * de quem chama (o Zod do onboarding exige `^\d{14}$`).
 */

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

function digitoVerificador(digits: number[], pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + peso * (digits[i] ?? 0), 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** Retorna true se o CNPJ (14 dígitos) tiver dígitos verificadores válidos. */
export function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false
  // Rejeita sequências repetidas (00000000000000, 11111111111111, ...)
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const digits = cnpj.split('').map(Number)
  const dv1 = digitoVerificador(digits.slice(0, 12), PESOS_1)
  if (dv1 !== digits[12]) return false
  const dv2 = digitoVerificador(digits.slice(0, 13), PESOS_2)
  return dv2 === digits[13]
}
