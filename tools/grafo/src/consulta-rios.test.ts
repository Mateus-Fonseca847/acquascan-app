import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baixarOuUsarCache, montarConsulta } from './baixar';
import { BBOX_PETROPOLIS, USER_AGENT } from './config';
import { montarConsultaRios } from './consulta-rios';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'grafo-rios-teste-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('montarConsultaRios', () => {
  const consulta = montarConsultaRios({ sul: 1, oeste: 2, norte: 3, leste: 4 });

  it('pede os ways waterway river, stream, canal e drain da caixa', () => {
    expect(consulta).toContain('[out:json]');
    expect(consulta).toContain('way["waterway"~"^(river|stream|canal|drain)$"](1,2,3,4)');
  });

  it('pede as relações type=waterway com name, e traz membros e nós pela recursão', () => {
    expect(consulta).toContain('rel["type"="waterway"]["name"](1,2,3,4)');
    expect(consulta).toContain('(._;>;)');
    expect(consulta).toContain('out body;');
  });

  it('é uma consulta só, diferente da das ruas', () => {
    expect(consulta).not.toContain('highway');
    expect(consulta).not.toBe(montarConsulta({ sul: 1, oeste: 2, norte: 3, leste: 4 }));
  });
});

describe('download dos rios: mesmo cliente, outra consulta', () => {
  const resposta = JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] });
  const consulta = montarConsultaRios(BBOX_PETROPOLIS);
  const opcoes = (fetchImpl: typeof fetch, extra: object = {}) => ({
    bbox: BBOX_PETROPOLIS,
    consulta,
    prefixoCache: 'rios',
    dirCache: dir,
    fetchImpl,
    dormir: vi.fn(async () => {}),
    ...extra,
  });

  it('envia a consulta dos rios, identifica o projeto e guarda o cache com prefixo "rios"', async () => {
    const fetchFalso = vi.fn(async () => new Response(resposta, { status: 200 }));
    const r = await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch));

    const init = (fetchFalso.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(decodeURIComponent(String(init.body))).toContain('rel["type"="waterway"]');
    expect((init.headers as Record<string, string>)['user-agent']).toBe(USER_AGENT);
    expect(r.arquivoCache).toMatch(/rios-[0-9a-f]{12}\.json$/);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('na execução seguinte usa o cache; --atualizar baixa de novo', async () => {
    await baixarOuUsarCache(
      opcoes(vi.fn(async () => new Response(resposta)) as unknown as typeof fetch),
    );

    const semRede = vi.fn(async () => new Response(resposta));
    const cache = await baixarOuUsarCache(opcoes(semRede as unknown as typeof fetch));
    expect(semRede).not.toHaveBeenCalled();
    expect(cache.doCache).toBe(true);

    await baixarOuUsarCache(opcoes(semRede as unknown as typeof fetch, { atualizar: true }));
    expect(semRede).toHaveBeenCalledTimes(1);
  });

  it('o cache dos rios e o das ruas não se misturam', async () => {
    const f = vi.fn(async () => new Response(resposta));
    const rios = await baixarOuUsarCache(opcoes(f as unknown as typeof fetch));
    const ruas = await baixarOuUsarCache({
      bbox: BBOX_PETROPOLIS,
      dirCache: dir,
      fetchImpl: f as unknown as typeof fetch,
      dormir: async () => {},
    });
    expect(rios.arquivoCache).not.toBe(ruas.arquivoCache);
    expect(ruas.arquivoCache).toMatch(/overpass-[0-9a-f]{12}\.json$/); // o comando de ruas continua igual
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('resposta parcial (200 com aviso de erro) é falha e nunca entra no cache', async () => {
    const parcial = () =>
      new Response(
        JSON.stringify({ remark: 'runtime error: Query ran out of memory', elements: [] }),
        {
          status: 200,
        },
      );
    const fetchFalso = vi.fn().mockImplementation(async () => parcial());

    await expect(baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch))).rejects.toThrow(
      /3 tentativas/,
    );
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(await readdir(dir)).toEqual([]);
  });

  it('um aviso "timed out" também é rejeitado, mesmo que depois a rede responda bem', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ remark: 'runtime error: Query timed out in "query"', elements: [{}] }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(new Response(resposta, { status: 200 }));

    const r = await baixarOuUsarCache(opcoes(fetchFalso as unknown as typeof fetch));
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(r.texto).toBe(resposta); // só a resposta completa foi guardada
  });
});
