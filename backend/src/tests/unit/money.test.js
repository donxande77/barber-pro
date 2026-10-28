import { describe, it, expect } from 'vitest';
import { money, percentOf, sum, toMoneyString, parseMoneyInput, dec } from '../../utils/money.js';

describe('cálculos monetários', () => {
  it('comissão de 40% sobre R$ 50,00 é R$ 20,00 (exemplo do requisito)', () => {
    expect(toMoneyString(percentOf('50.00', 40))).toBe('20.00');
  });

  it('não sofre erro de ponto flutuante (0,1 + 0,2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // o problema que evitamos
    expect(toMoneyString(sum(['0.10', '0.20']))).toBe('0.30');
  });

  it('arredonda meio centavo para cima (comercial)', () => {
    expect(toMoneyString(percentOf('33.33', 15))).toBe('5.00'); // 4,9995 → 5,00
    expect(toMoneyString(percentOf('10.05', 50))).toBe('5.03'); // 5,025 → 5,03
    expect(toMoneyString(money('2.675'))).toBe('2.68');
  });

  it('soma muitos valores sem acumular erro', () => {
    const values = Array.from({ length: 1000 }, () => '0.01');
    expect(toMoneyString(sum(values))).toBe('10.00');
  });

  it('aceita Prisma.Decimal-like (objeto com toString)', () => {
    expect(dec({ toString: () => '12.34' }).toFixed(2)).toBe('12.34');
  });

  it('rejeita entrada com mais de 2 casas ou inválida', () => {
    expect(() => parseMoneyInput('10.123')).toThrow();
    expect(() => parseMoneyInput('abc')).toThrow();
    expect(parseMoneyInput('10.5').toFixed(2)).toBe('10.50');
  });
});
