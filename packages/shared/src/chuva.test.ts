import { describe, expect, it } from 'vitest';
import { classificarChuva } from './chuva';

describe('classificarChuva', () => {
  it.each([
    [0, 'BAIXO'],
    [9.9, 'BAIXO'],
    [10, 'MODERADO'],
    [30, 'ALTO'],
    [50, 'MUITO_ALTO'],
  ] as const)('%s mm → %s', (mm, esperado) => {
    expect(classificarChuva(mm)).toBe(esperado);
  });
});
