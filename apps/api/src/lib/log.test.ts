import { describe, expect, it } from 'vitest';
import { serializarRequisicao } from './log';

describe('serializarRequisicao', () => {
  it('registra só o método e o caminho', () => {
    const entrada = {
      method: 'POST',
      url: '/auth/login',
      ip: '203.0.113.7',
      hostname: 'api.exemplo.com',
      headers: { authorization: 'Bearer segredo' },
    };
    expect(serializarRequisicao(entrada)).toEqual({ method: 'POST', url: '/auth/login' });
  });

  it('descarta a query string, que pode ter a localização do usuário', () => {
    const saida = serializarRequisicao({ method: 'GET', url: '/pontos-apoio?lat=-22.5&lng=-43.1' });
    expect(saida.url).toBe('/pontos-apoio');
    expect(JSON.stringify(saida)).not.toContain('-22.5');
  });
});
