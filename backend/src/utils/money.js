// Cálculos monetários com decimal.js. Nunca use Number para somar ou multiplicar dinheiro.
import Decimal from 'decimal.js';

// Instância isolada: 2 casas, arredondamento comercial (meio para cima).
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Converte número, string, Decimal ou Prisma.Decimal em Decimal. */
export function dec(value) {
  if (value === null || value === undefined || value === '') return new D(0);
  if (value instanceof D) return value;
  // Prisma.Decimal tem toString() exato
  return new D(typeof value === 'object' ? value.toString() : value);
}

/** Arredonda para centavos. */
export function money(value) {
  return dec(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Percentual de um valor, arredondado a centavos. Ex.: percentOf(50, 40) = 20.00 */
export function percentOf(amount, percent) {
  return money(dec(amount).times(dec(percent)).dividedBy(100));
}

export function sum(values) {
  return money(values.reduce((acc, v) => acc.plus(dec(v)), new D(0)));
}

/** Representação para JSON: string com 2 casas ("20.00"), sem perda de precisão. */
export function toMoneyString(value) {
  return money(value).toFixed(2);
}

/** Valida e normaliza uma entrada monetária vinda da API (string ou número) — rejeita mais de 2 casas. */
export function parseMoneyInput(value) {
  const d = dec(value);
  if (!d.isFinite()) throw new Error('Valor monetário inválido');
  if (d.decimalPlaces() > 2) throw new Error('Use no máximo 2 casas decimais');
  return d;
}
