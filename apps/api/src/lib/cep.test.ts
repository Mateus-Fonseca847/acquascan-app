import { afterEach, describe, expect, it, vi } from 'vitest';
import { consultarCep } from './cep';

function responder(status: number, corpo?: unknown) {
  const fetchFalso = vi.fn().mockResolvedValue(
    new Response(corpo === undefined ? null : JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

const comCoordenadas = (coordinates: unknown) => ({ cep: '25600000', location: { coordinates } });
const semCoordenadas = { status: 'ok', latitude: null, longitude: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consultarCep', () => {
  it('converte coordenadas válidas que vêm como string', async () => {
    responder(200, comCoordenadas({ latitude: '-22.5053', longitude: '-43.1789' }));
    expect(await consultarCep('25600000')).toEqual({
      status: 'ok',
      latitude: -22.5053,
      longitude: -43.1789,
    });
  });

  it('retorna ok sem coordenadas quando elas faltam', async () => {
    responder(200, { cep: '25600000' });
    expect(await consultarCep('25600000')).toEqual(semCoordenadas);
    responder(200, comCoordenadas({}));
    expect(await consultarCep('25600000')).toEqual(semCoordenadas);
  });

  it.each([
    ['vazias', { latitude: '', longitude: '' }],
    ['só espaços', { latitude: ' ', longitude: ' ' }],
    ['não numéricas', { latitude: 'abc', longitude: 'xyz' }],
    ['fora do intervalo', { latitude: '-91', longitude: '181' }],
    ['só a latitude válida', { latitude: '-22.5', longitude: '' }],
  ])('retorna ok sem coordenadas quando elas são %s', async (_nome, coordenadas) => {
    responder(200, comCoordenadas(coordenadas));
    expect(await consultarCep('25600000')).toEqual(semCoordenadas);
  });

  it('retorna nao_encontrado em 404', async () => {
    responder(404, { name: 'CepPromiseError' });
    expect(await consultarCep('25600000')).toEqual({ status: 'nao_encontrado' });
  });

  it('retorna indisponivel em erro de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await consultarCep('25600000')).toEqual({ status: 'indisponivel' });
  });

  it('retorna indisponivel em 500', async () => {
    responder(500, { erro: 'x' });
    expect(await consultarCep('25600000')).toEqual({ status: 'indisponivel' });
  });

  it('retorna indisponivel quando o JSON é inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
    expect(await consultarCep('25600000')).toEqual({ status: 'indisponivel' });
  });

  it('aceita CEP com hífen e consulta só os dígitos', async () => {
    const fetchFalso = responder(200, comCoordenadas({ latitude: '-22.5', longitude: '-43.1' }));
    await consultarCep('25600-000');
    expect(String(fetchFalso.mock.calls[0]?.[0])).toBe(
      'https://brasilapi.com.br/api/cep/v2/25600000',
    );
  });

  it('não chama a rede com CEP de menos de 8 dígitos', async () => {
    const fetchFalso = responder(200, {});
    expect(await consultarCep('2560000')).toEqual({ status: 'nao_encontrado' });
    expect(await consultarCep('')).toEqual({ status: 'nao_encontrado' });
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
