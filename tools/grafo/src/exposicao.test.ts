import { describe, expect, it } from 'vitest';
import { aresta, grafoDe, pt, segmentoRio } from './auxiliares-teste';
import { distSegmentos } from './espacial';
import {
  calcularExposicao,
  lerSegmentosGeoJson,
  montarArquivoExposicao,
  type EntradaExposicao,
} from './exposicao';
import { ProjecaoLocal } from './geo';

/** O rio de quase todos os testes: uma reta de leste a oeste no eixo y = 0. */
const rio = (id = 0) =>
  segmentoRio(id, [
    [-1000, 0],
    [1000, 0],
  ]);

function exporUma(arestaM: [number, number][], rios = [rio()], opcoes = {}) {
  const r = calcularExposicao(grafoDe([aresta(arestaM)]), rios, opcoes);
  return r.entradas;
}
const daEntrada = (entradas: EntradaExposicao[], segmentoId = 0) =>
  entradas.find((e) => e.segmentoId === segmentoId);

describe('cruza e distância mínima', () => {
  it('em X: a rua atravessa o rio', () => {
    const e = daEntrada(
      exporUma([
        [0, -50],
        [0, 50],
      ]),
    )!;
    expect(e.cruza).toBe(true);
    expect(e.distMinM).toBe(0);
    expect(e.ponto![0]).toBeCloseTo(pt(0, 0)[0], 5); // o ponto do cruzamento
    expect(e.ponto![1]).toBeCloseTo(pt(0, 0)[1], 5);
  });

  it('toque na ponta: a rua termina a 0,3 m do rio e conta como cruzamento', () => {
    const e = daEntrada(
      exporUma([
        [0, 0.3],
        [0, 100],
      ]),
    )!;
    expect(e.cruza).toBe(true);
    expect(e.distMinM).toBeCloseTo(0.3, 1);
  });

  it('a 2 m da ponta não é cruzamento, mas a rua continua exposta (entra pela faixa de 50 m)', () => {
    const e = daEntrada(
      exporUma([
        [0, 2],
        [0, 100],
      ]),
    )!;
    expect(e.cruza).toBe(false);
    expect(e.distMinM).toBeCloseTo(2, 1);
    expect(e.f50).toBeGreaterThan(0);
  });

  it('a tolerância do toque é configurável', () => {
    expect(
      daEntrada(
        exporUma(
          [
            [0, 2],
            [0, 100],
          ],
          [rio()],
          { toqueM: 3 },
        ),
      )!.cruza,
    ).toBe(true);
    expect(
      daEntrada(
        exporUma(
          [
            [0, 0.3],
            [0, 100],
          ],
          [rio()],
          { toqueM: 0.1 },
        ),
      )!.cruza,
    ).toBe(false);
  });

  it('paralelas não cruzam, e a distância mínima é a da faixa entre as linhas', () => {
    const e = daEntrada(
      exporUma([
        [-200, 10],
        [200, 10],
      ]),
    )!;
    expect(e.cruza).toBe(false);
    expect(e.distMinM).toBe(10);
  });

  it('rua longe do rio (mais de 50 m) não gera entrada', () => {
    expect(
      exporUma([
        [-200, 60],
        [200, 60],
      ]),
    ).toEqual([]);
  });

  it('cruzamento no meio de uma rua com várias curvas', () => {
    const e = daEntrada(
      exporUma([
        [-80, 100],
        [-80, 40],
        [0, 20],
        [60, -30],
        [60, -90],
      ]),
    )!;
    expect(e.cruza).toBe(true);
  });
});

describe('frações f15, f30 e f50', () => {
  it('rua paralela ao rio a 10 m: f15 = 1 e f30 = 1', () => {
    const e = daEntrada(
      exporUma([
        [-200, 10],
        [200, 10],
      ]),
    )!;
    expect([e.f15, e.f30, e.f50]).toEqual([1, 1, 1]);
  });

  it('a 20 m: f15 = 0 e f30 = 1', () => {
    const e = daEntrada(
      exporUma([
        [-200, 20],
        [200, 20],
      ]),
    )!;
    expect([e.f15, e.f30, e.f50]).toEqual([0, 1, 1]);
  });

  it('a 40 m: só a f50', () => {
    const e = daEntrada(
      exporUma([
        [-200, 40],
        [200, 40],
      ]),
    )!;
    expect([e.f15, e.f30, e.f50]).toEqual([0, 0, 1]);
  });

  it('um pouco além das faixas: 16 m sai da f15 e 31 m sai da f30', () => {
    expect(
      daEntrada(
        exporUma([
          [-200, 16],
          [200, 16],
        ]),
      )!.f15,
    ).toBe(0);
    expect(
      daEntrada(
        exporUma([
          [-200, 31],
          [200, 31],
        ]),
      )!.f30,
    ).toBe(0);
  });

  it('rua que cruza em ângulo: cruza = 1 e fração pequena', () => {
    // Cruza o rio a 30 graus: só um trecho curto da rua fica a até 15 m dele.
    const e = daEntrada(
      exporUma([
        [-173, -100],
        [173, 100],
      ]),
    )!;
    expect(e.cruza).toBe(true);
    expect(e.f15).toBeGreaterThan(0);
    expect(e.f15).toBeLessThan(0.25);
    expect(e.f30).toBeGreaterThan(e.f15);
  });

  it('rua que cruza perpendicular: 30 m de 90 m ficam a até 15 m (com o erro da amostragem)', () => {
    // Vai de 45 m ao sul do rio até 45 m ao norte (os extremos em exatamente 50 m cairiam na borda).
    const e = daEntrada(
      exporUma([
        [0, -45],
        [0, 45],
      ]),
    )!;
    expect(Math.abs(e.f15 - 30 / 90)).toBeLessThan(0.06);
    expect(Math.abs(e.f30 - 60 / 90)).toBeLessThan(0.06);
    expect(e.f50).toBe(1);
  });

  it('rua longa e meio exposta: o rio cobre só a primeira metade, fração perto de 0,5', () => {
    const metade = segmentoRio(0, [
      [0, 0],
      [1000, 0],
    ]);
    const e = daEntrada(
      exporUma(
        [
          [0, 10],
          [2000, 10],
        ],
        [metade],
      ),
    )!;
    expect(Math.abs(e.f15 - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(e.f30 - 0.5)).toBeLessThan(0.03);
  });

  it('a fração vale para qualquer passo de amostragem razoável', () => {
    const e1 = daEntrada(
      exporUma(
        [
          [0, -50],
          [0, 50],
        ],
        [rio()],
        { passoM: 1 },
      ),
    )!;
    expect(Math.abs(e1.f15 - 0.3)).toBeLessThan(0.02);
  });

  it('as distâncias saem arredondadas a 0,1 m e as frações a 0,01', () => {
    const e = daEntrada(
      exporUma([
        [-200, 12.34567],
        [100, 17.7],
      ]),
    )!;
    expect(e.distMinM).toBeCloseTo(12.3, 5);
    for (const f of [e.f15, e.f30, e.f50]) expect(Math.round(f * 100) / 100).toBe(f);
  });
});

describe('várias linhas de rio: cada amostra vai para o segmento mais próximo', () => {
  const duasLinhas = [
    segmentoRio(0, [
      [-500, 0],
      [500, 0],
    ]),
    segmentoRio(1, [
      [-500, 12],
      [500, 12],
    ]),
  ];

  it('rua mais perto de um segmento fica só com ele, e a soma das frações não passa de 1', () => {
    const entradas = exporUma(
      [
        [-200, 4],
        [200, 4],
      ],
      duasLinhas,
    );
    expect(daEntrada(entradas, 0)).toMatchObject({ f15: 1, f30: 1, f50: 1 });
    expect(daEntrada(entradas, 1)).toBeUndefined(); // nenhuma amostra é mais perto dele
  });

  it('rua que atravessa os dois divide as amostras e a soma não passa de 1', () => {
    const entradas = exporUma(
      [
        [0, -6],
        [0, 18],
      ],
      duasLinhas,
    );
    const a = daEntrada(entradas, 0)!;
    const b = daEntrada(entradas, 1)!;
    expect(a.cruza && b.cruza).toBe(true);
    expect(a.f50 + b.f50).toBeLessThanOrEqual(1.0000001);
    expect(Math.abs(a.f50 - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(b.f50 - 0.5)).toBeLessThan(0.1);
  });

  it('em empate, fica com o segmento de menor id', () => {
    const entradas = exporUma(
      [
        [-200, 6],
        [200, 6],
      ],
      duasLinhas,
    );
    expect(daEntrada(entradas, 0)).toMatchObject({ f15: 1 });
    expect(daEntrada(entradas, 1)).toBeUndefined();
  });

  it('para qualquer rua e qualquer quantidade de segmentos, a soma de cada faixa é no máximo 1', () => {
    const rios = [0, 1, 2, 3].map((i) =>
      segmentoRio(i, [
        [-300 + i * 90, -60 + i * 25],
        [300 - i * 40, 80 - i * 30],
      ]),
    );
    let semente = 5;
    const sorteio = () => {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return semente / 4294967296;
    };
    const ruas = Array.from({ length: 80 }, () =>
      aresta([
        [sorteio() * 600 - 300, sorteio() * 200 - 100],
        [sorteio() * 600 - 300, sorteio() * 200 - 100],
        [sorteio() * 600 - 300, sorteio() * 200 - 100],
      ]),
    );
    const { entradas } = calcularExposicao(grafoDe(ruas), rios);
    const soma = new Map<number, [number, number, number]>();
    for (const e of entradas) {
      const s = soma.get(e.arestaId) ?? [0, 0, 0];
      s[0] += e.f15;
      s[1] += e.f30;
      s[2] += e.f50;
      soma.set(e.arestaId, s);
    }
    expect(soma.size).toBeGreaterThan(10);
    for (const s of soma.values()) for (const f of s) expect(f).toBeLessThanOrEqual(1.03); // 3 casas de arredondamento
  });
});

describe('o índice espacial dá o mesmo resultado que comparar tudo com tudo', () => {
  it('cruza e distância mínima de 150 ruas contra 12 rios', () => {
    let semente = 77;
    const sorteio = () => {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return semente / 4294967296;
    };
    const ponto = (): [number, number] => [sorteio() * 3000 - 1500, sorteio() * 3000 - 1500];
    const rios = Array.from({ length: 12 }, (_, i) => segmentoRio(i, [ponto(), ponto(), ponto()]));
    const ruas = Array.from({ length: 150 }, () => aresta([ponto(), ponto()]));

    const { entradas } = calcularExposicao(grafoDe(ruas), rios);
    const porPar = new Map(entradas.map((e) => [`${e.arestaId},${e.segmentoId}`, e]));
    const plano = new ProjecaoLocal(pt(0, 0)[0], pt(0, 0)[1]);
    const xy = (p: readonly [number, number]) => [plano.x(p[1]), plano.y(p[0])] as const;

    let comparados = 0;
    ruas.forEach((rua, arestaId) => {
      for (const seg of rios) {
        let menor = Infinity;
        for (let k = 1; k < rua.geometria.length; k++) {
          for (let j = 1; j < seg.pontos.length; j++) {
            const [ax, ay] = xy(rua.geometria[k - 1]!);
            const [bx, by] = xy(rua.geometria[k]!);
            const [cx, cy] = xy(seg.pontos[j - 1]!);
            const [dx, dy] = xy(seg.pontos[j]!);
            menor = Math.min(menor, distSegmentos(ax, ay, bx, by, cx, cy, dx, dy));
          }
        }
        const achada = porPar.get(`${arestaId},${seg.id}`);
        if (menor <= 0.5) {
          expect(achada?.cruza, `aresta ${arestaId} x segmento ${seg.id}`).toBe(true);
          comparados++;
        }
        if (achada) expect(Math.abs(achada.distMinM - menor)).toBeLessThan(0.06);
        // A entrada só some quando a rua está longe e não cruza: nada a mais de 50 m.
        if (!achada) expect(menor > 50 || menor > 0.5).toBe(true);
      }
    });
    expect(comparados).toBeGreaterThan(3); // o teste de fato exercita cruzamentos
  });
});

describe('arquivo de saída', () => {
  const segmentos = [
    segmentoRio(
      0,
      [
        [-1000, 0],
        [1000, 0],
      ],
      'Piabanha',
      { coberto: true },
    ),
  ];
  const resultado = calcularExposicao(
    grafoDe([
      aresta([
        [-200, 12.34],
        [200, 12.34],
      ]),
      aresta([
        [0, -50],
        [0, 50],
      ]),
    ]),
    segmentos,
  );
  const arquivo = montarArquivoExposicao({
    geradoEm: new Date('2026-10-16T12:00:00Z'),
    grafo: { nos: 1, arestas: 2, sha256: 'abc123' },
    rios: { sha256: 'def456' },
    segmentos,
    resultado,
  });

  it('traz a versão, o hash do grafo, os parâmetros e os segmentos', () => {
    expect(arquivo.versao).toBe(1);
    expect(arquivo.geradoEm).toBe('2026-10-16T12:00:00.000Z');
    expect(arquivo.grafo).toEqual({ nos: 1, arestas: 2, sha256: 'abc123' });
    expect(arquivo.rios).toEqual({ sha256: 'def456' });
    expect(arquivo.parametros).toEqual({ passoM: 5, faixasM: [15, 30, 50] });
    expect(arquivo.segmentos).toEqual([{ id: 0, rio: 'Piabanha', osmWayId: 1000, coberto: true }]);
  });

  it('as entradas são listas compactas [aresta, segmento, cruza, dist, f15, f30, f50]', () => {
    expect(arquivo.entradas).toHaveLength(2);
    expect(arquivo.entradas[0]).toEqual([0, 0, 0, 12.3, 1, 1, 1]);
    const [arestaId, segmentoId, cruza, dist] = arquivo.entradas[1]!;
    expect([arestaId, segmentoId, cruza, dist]).toEqual([1, 0, 1, 0]);
    expect(arquivo.entradas[1]).toHaveLength(7);
  });

  it('não leva o ponto do cruzamento (só serve ao relatório)', () => {
    expect(resultado.entradas[1]!.ponto).toBeDefined();
    expect(JSON.stringify(arquivo)).not.toContain('ponto');
  });

  it('o JSON sai compacto: sem espaços nem quebras de linha', () => {
    const json = JSON.stringify(arquivo);
    expect(json).not.toMatch(/\n/);
    expect(json).toContain('"entradas":[[0,0,0,12.3,1,1,1]');
  });
});

describe('lerSegmentosGeoJson', () => {
  const feature = (props: object, tipo = 'LineString') => ({
    type: 'Feature',
    properties: { rio: 'Piabanha', osmWayId: 5, coberto: false, ...props },
    geometry: {
      type: tipo,
      coordinates: [
        [-43.17, -22.5],
        [-43.171, -22.501],
      ],
    },
  });

  it('converte [lon, lat] do GeoJSON para [lat, lon]', () => {
    const [s] = lerSegmentosGeoJson({ features: [feature({ id: 3 })] });
    expect(s).toMatchObject({ id: 3, rio: 'Piabanha', osmWayId: 5, coberto: false });
    expect(s!.pontos[0]).toEqual([-22.5, -43.17]);
  });

  it('um arquivo de versão antiga (sem id) manda rodar o grafo:rios de novo', () => {
    expect(() => lerSegmentosGeoJson({ features: [feature({})] })).toThrow(/pnpm grafo:rios/);
  });

  it('rejeita o que não é GeoJSON ou não é LineString', () => {
    expect(() => lerSegmentosGeoJson({})).toThrow(/FeatureCollection/);
    expect(() => lerSegmentosGeoJson({ features: [feature({ id: 1 }, 'Point')] })).toThrow(
      /LineString/,
    );
  });
});
