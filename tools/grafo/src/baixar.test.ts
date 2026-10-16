import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baixarOuUsarCache, montarConsulta } from './baixar';
import { BBOX_PETROPOLIS, USER_AGENT } from './config';

const resposta = JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] });
const ok = () => new Response(resposta, { status: 200 });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'grafo-teste-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const opcoes = (fetchImpl: typeof fetch, extra: object = {}) => ({
  bbox: BBOX_PETROPOLIS,
  dirCache: dir,
  fetchImpl,
  dormir: vi.fn(async () => {}),
  ...extra,
});

describe('montarConsulta', () => {
  it('pede os ways highway da caixa e os nós de cada um, em JSON', () => {
    const consulta = montarConsulta({ sul: 1, oeste: 2, norte: 3, leste: 4 });
    expect(consulta).toContain('[out:json]');
    expect(consulta).toContain('way["highway"](1,2,3,4)'); // sul, oeste, norte, leste
    expect(consulta).toContain('(._;>;)'); // recursão: os nós dos ways
    expect(consulta).toContain('out body;');
  });
});

describe('baixarOuUsarCache', () => {
  it('baixa uma vez, identifica o projeto e guarda no cache', async () => {
    const fetchFalso = vi.fn(async () => ok());
    const r = await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch));

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const init = (fetchFalso.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['user-agent']).toBe(USER_AGENT);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(r.doCache).toBe(false);
    expect(await readFile(r.arquivoCache, 'utf8')).toBe(resposta);
  });

  it('na execução seguinte usa o cache e não consulta a rede', async () => {
    await baixarOuUsarCache(opcoes(vi.fn(async () => ok()) as unknown as typeof fetch));

    const fetchFalso = vi.fn(async () => ok());
    const r = await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch));
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(r.doCache).toBe(true);
    expect(r.texto).toBe(resposta);
  });

  it('--atualizar baixa de novo mesmo com cache', async () => {
    await baixarOuUsarCache(opcoes(vi.fn(async () => ok()) as unknown as typeof fetch));
    const fetchFalso = vi.fn(async () => ok());
    await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch, { atualizar: true }));
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('caixa diferente usa outro arquivo de cache', async () => {
    const f = vi.fn(async () => ok());
    const a = await baixarOuUsarCache(opcoes(f as unknown as typeof fetch));
    const b = await baixarOuUsarCache(
      opcoes(f as unknown as typeof fetch, { bbox: { ...BBOX_PETROPOLIS, sul: -22.6 } }),
    );
    expect(a.arquivoCache).not.toBe(b.arquivoCache);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('tenta de novo com espera crescente em 5xx e 429, até 2 novas tentativas', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(ok());
    const o = opcoes(fetchFalso as unknown as typeof fetch);

    await baixarOuUsarCache(o);

    expect(fetchFalso).toHaveBeenCalledTimes(3);
    const esperas = o.dormir.mock.calls.map((c) => (c as unknown as [number])[0]);
    expect(esperas).toEqual([5000, 10000]);
  });

  it('desiste depois de 3 tentativas e não grava cache', async () => {
    const fetchFalso = vi.fn(async () => new Response('', { status: 503 }));
    await expect(baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch))).rejects.toThrow(
      /3 tentativas/,
    );
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(await readdir(dir)).toEqual([]);
  });

  it('erro de rede também é tentado de novo', async () => {
    const fetchFalso = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok());
    await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch));
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('um 4xx (consulta recusada) não é tentado de novo', async () => {
    const fetchFalso = vi.fn(async () => new Response('', { status: 400 }));
    await expect(baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch))).rejects.toThrow(
      /recusada/,
    );
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('resposta 200 com aviso de erro (dados parciais) não vira cache', async () => {
    const parcial = () =>
      new Response(JSON.stringify({ remark: 'runtime error: Query timed out', elements: [] }), {
        status: 200,
      });
    const fetchFalso = vi.fn().mockImplementation(async () => parcial());

    await expect(
      baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch)),
    ).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});
