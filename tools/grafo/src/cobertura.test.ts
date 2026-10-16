import { describe, expect, it } from 'vitest';
import { aresta, grafoDe, pt } from './auxiliares-teste';
import { analisarCobertura, type WaterwayParaCobertura } from './cobertura';

const waterway = (
  osmWayId: number,
  nome: string | null,
  pontosM: [number, number][],
  extras: Partial<WaterwayParaCobertura> = {},
): WaterwayParaCobertura => ({
  osmWayId,
  nome,
  waterway: 'river',
  coberto: false,
  comprimentoM: 1000,
  pontos: pontosM.map(([x, y]) => pt(x, y)),
  alvo: false,
  ...extras,
});

describe('analisarCobertura', () => {
  // Quatro ruas verticais em x = 0, 300, 600 e 900, cada uma de y = -50 a y = 50, mais uma solta.
  const ruas = grafoDe([
    aresta([
      [0, -50],
      [0, 50],
    ]), // 0: só o rio alvo
    aresta([
      [300, -50],
      [300, 50],
    ]), // 1: só um outro rio
    aresta([
      [600, -50],
      [600, 50],
    ]), // 2: alvo e outro, ao mesmo tempo
    aresta([
      [900, -50],
      [900, 50],
    ]), // 3: um rio sem nome
    aresta([
      [2000, -50],
      [2000, 50],
    ]), // 4: não cruza nada
  ]);
  // Rios horizontais em y = 0, cobrindo cada rua. Os outros rios têm 2 ways com o mesmo nome.
  const waterways = [
    waterway(
      1,
      'Rio Piabanha',
      [
        [-100, 0],
        [100, 0],
      ],
      { alvo: true },
    ),
    waterway(
      2,
      'Rio Palatino',
      [
        [250, 0],
        [350, 0],
      ],
      { comprimentoM: 600, coberto: true },
    ),
    waterway(
      3,
      'Palatino',
      [
        [560, 0],
        [640, 0],
      ],
      { comprimentoM: 400, coberto: false },
    ),
    waterway(
      4,
      'Rio Piabanha',
      [
        [550, 0],
        [650, 0],
      ],
      { alvo: true },
    ),
    waterway(
      5,
      null,
      [
        [850, 0],
        [950, 0],
      ],
      { comprimentoM: 200 },
    ),
  ];
  const r = analisarCobertura(ruas, waterways);

  it('conta as ruas que cruzam algum waterway e separa alvo de outros', () => {
    expect(r.waterways).toBe(5);
    expect(r.arestasQueCruzam).toBe(4);
    expect(r.cruzamRioAlvo).toBe(2); // ruas 0 e 2
    expect(r.cruzamOutros).toBe(3); // ruas 1, 2 e 3
    expect(r.soOutros).toBe(2); // ruas 1 e 3
    expect(r.ambos).toBe(1); // rua 2
  });

  it('lista os outros waterways agrupados por nome, com km, % coberto e arestas cruzadas', () => {
    const palatino = r.outros.find((o) => o.nome.includes('Palatino'))!;
    expect(palatino.ways).toBe(2); // "Rio Palatino" e "Palatino" são o mesmo nome normalizado
    expect(palatino.km).toBe(1); // 0,6 + 0,4
    expect(palatino.pctCoberto).toBe(60);
    expect(palatino.arestas).toBe(2); // ruas 1 e 2

    const semNome = r.outros.find((o) => o.nome === '(sem nome)')!;
    expect(semNome).toMatchObject({ ways: 1, arestas: 1, km: 0.2 });
  });

  it('o que é rio alvo não aparece entre os outros', () => {
    expect(r.outros.map((o) => o.nome).some((n) => n.includes('Piabanha'))).toBe(false);
  });

  it('ordena por arestas cruzadas e respeita o limite da lista', () => {
    expect(r.outros[0]!.nome).toMatch(/Palatino/);
    const topo1 = analisarCobertura(ruas, waterways, { topo: 1 });
    expect(topo1.outros).toHaveLength(1);
    expect(topo1.totalGruposOutros).toBe(2);
  });

  it('sem nenhum waterway, nada é cruzado', () => {
    expect(analisarCobertura(ruas, [])).toMatchObject({ arestasQueCruzam: 0, outros: [] });
  });
});
