import { describe, expect, it } from 'vitest';
import {
  AGORA,
  criarMundo,
  leitura,
  mulberry32,
  mundoPonte,
  p,
  type Ponto,
} from '../test/auxiliares';

const N0 = p(0, 150);
const S0 = p(0, -150);
const critico = [leitura(1, 'CRITICO', 2)];
const atencao = [leitura(1, 'ATENCAO', 2)];

describe('rotear: cenários', () => {
  it('sem risco: a mais curta, e maisCurta nula', () => {
    const { desvio, roteador } = mundoPonte();
    const r = desvio.rotear(N0, S0, [leitura(1, 'ESTAVEL', 2)], AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.modo).toBe('sem_risco');
    expect(r.maisCurta).toBeNull();
    expect(r.avisos).toEqual([]);
    const curta = roteador.rotear(N0, S0);
    if (curta.status !== 'ok') throw new Error('x');
    expect(r.recomendada.rota.distanciaRedeM).toBeCloseTo(curta.distanciaRedeM, 6);
    expect(r.recomendada.distanciaTotalM).toBeCloseTo(1300, 0);
  });

  it('rio crítico com alternativa: segura, sem travessia, e devolve a mais curta', () => {
    const { desvio } = mundoPonte();
    const r = desvio.rotear(N0, S0, critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.modo).toBe('segura');
    expect(r.recomendada.travessiasCriticas).toBe(0);
    expect(r.recomendada.exposicaoCriticaM).toBe(0);
    expect(r.recomendada.distanciaTotalM).toBeCloseTo(3100, 0);
    expect(r.avisos).not.toContain('ATRAVESSA_RIO_CRITICO');
    expect(r.maisCurta).not.toBeNull();
    expect(r.maisCurta!.travessiasCriticas).toBe(1);
    expect(r.maisCurta!.exposicaoCriticaM).toBeGreaterThan(100);
  });

  it('ponte única sobre rio crítico: menos_exposta, atravessa e avisa, mas a rota existe', () => {
    const { desvio } = mundoPonte({ contorno: false });
    const r = desvio.rotear(N0, S0, critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.modo).toBe('menos_exposta');
    expect(r.recomendada.travessiasCriticas).toBe(1);
    expect(r.avisos).toEqual(
      expect.arrayContaining(['ATRAVESSA_RIO_CRITICO', 'EXPOSICAO_RIO_CRITICO']),
    );
    expect(r.maisCurta).toBeNull(); // a recomendada já é a mais curta
  });

  it('origem sobre a ponte bloqueada: ainda há rota', () => {
    const sem = mundoPonte({ contorno: false }).desvio.rotear(p(500, 20), S0, critico, AGORA);
    if (sem.status !== 'ok') throw new Error(sem.status);
    expect(sem.modo).toBe('menos_exposta');
    expect(sem.recomendada.travessiasCriticas).toBe(1);
    const com = mundoPonte().desvio.rotear(p(500, 20), S0, critico, AGORA);
    expect(com.status).toBe('ok');
  });

  it('origem e destino dentro da zona do rio: a rota é calculada', () => {
    const { desvio } = mundoPonte();
    const r = desvio.rotear(p(480, 30), p(520, -30), critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(['segura', 'menos_exposta']).toContain(r.modo);
    expect(r.recomendada.distanciaTotalM).toBeGreaterThan(0);
  });

  it('ilhas desconexas: sem_caminho, com e sem risco', () => {
    const m = criarMundo({
      nos: [
        [0, 150],
        [500, 150],
        [0, -150],
        [500, -150],
      ],
      arestas: [
        { de: 0, para: 1 },
        { de: 2, para: 3 },
      ],
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-100, 0],
            [600, 0],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 250, y: 0 }],
    });
    for (const l of [critico, [leitura(1, 'ESTAVEL', 1)]]) {
      const r = m.desvio.rotear(p(0, 150), p(500, -150), l, AGORA);
      expect(r.status).toBe('sem_caminho');
      expect(r.recomendada).toBeNull();
    }
  });

  it('propaga origem_longe e destino_longe', () => {
    const { desvio } = mundoPonte();
    expect(desvio.rotear(p(9000, 9000), S0, critico, AGORA).status).toBe('origem_longe');
    expect(desvio.rotear(N0, p(9000, 9000), critico, AGORA).status).toBe('destino_longe');
  });

  it('diferença de exposição menor que 100 m e sem travessia: maisCurta nula', () => {
    const { desvio } = mundoPonte();
    const r = desvio.rotear(N0, p(1000, 150), critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.modo).toBe('segura');
    expect(r.maisCurta).toBeNull();
  });

  it('atenção penaliza mas não bloqueia: a ponte continua sendo usada', () => {
    const { desvio } = mundoPonte();
    const r = desvio.rotear(N0, S0, atencao, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.modo).toBe('segura');
    expect(r.recomendada.travessiasAtencao).toBe(1);
    expect(r.recomendada.travessiasCriticas).toBe(0);
    expect(r.avisos).not.toContain('ATRAVESSA_RIO_CRITICO');
    const ponte = r.recomendada.rota.trechos.find((t) => t.multiplicador > 1)!;
    expect(ponte.multiplicador).toBeCloseTo(1.6, 6); // 1 + 3 x max(f15 = 0,115; 60/300 = 0,2)
  });

  it('falha segura: o desvio continua com estado de 3 h e avisa; com 8 h é liberado', () => {
    const { desvio } = mundoPonte();
    const velha = desvio.rotear(N0, S0, [leitura(1, 'CRITICO', 180)], AGORA);
    if (velha.status !== 'ok') throw new Error(velha.status);
    expect(velha.modo).toBe('segura');
    expect(velha.avisos).toContain('ESTADO_ANTIGO_EM_USO');
    const liberada = desvio.rotear(N0, S0, [leitura(1, 'CRITICO', 480)], AGORA);
    if (liberada.status !== 'ok') throw new Error(liberada.status);
    expect(liberada.modo).toBe('sem_risco');
    expect(liberada.avisos).toEqual(['ESTACAO_SEM_LEITURA_ATUAL']);
  });
});

describe('multiplicadores', () => {
  it('crítico usa f50 (ou a travessia mínima, o que for maior)', () => {
    const m = mundoPonte({ contorno: false });
    const f50 = m.exposicao.entradas.find((e) => e[0] === 6)![6]!;
    const r = m.desvio.rotear(N0, S0, critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    const ponte = r.recomendada.rota.trechos.find((t) => t.arestaId === 6)!;
    expect(f50).toBeGreaterThan(0.2);
    expect(ponte.multiplicador).toBeCloseTo(1 + 49 * f50, 4);
    expect(Number.isFinite(ponte.multiplicador)).toBe(true); // Infinity só existe na passada estrita
  });

  it('travessia curta: a fração mínima é limitada a 1 (min(1, 60/comprimento))', () => {
    const m = criarMundo({
      nos: [
        [0, 20],
        [0, -20],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-100, 0],
            [100, 0],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 0, y: 0 }],
    });
    const r = m.desvio.rotear(p(0, 20), p(0, -20), critico, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.recomendada.rota.trechos[0]!.multiplicador).toBeCloseTo(50, 6);
  });

  it('vários rios na mesma rua: as frações (partes separadas da rua) se SOMAM', () => {
    const m = criarMundo({
      nos: [
        [0, 0],
        [400, 0],
      ],
      arestas: [{ de: 0, para: 1 }],
      rios: [
        {
          rio: 'A',
          pontos: [
            [100, -300],
            [100, 300],
          ],
        },
        {
          rio: 'B',
          pontos: [
            [300, -300],
            [300, 300],
          ],
        },
      ],
      estacoes: [
        { id: 1, rio: 'A', x: 100, y: 0 },
        { id: 2, rio: 'B', x: 300, y: 0 },
      ],
    });
    const leituras = [leitura(1, 'CRITICO', 2), leitura(2, 'CRITICO', 2)];
    const r = m.desvio.rotear(p(0, 0), p(400, 0), leituras, AGORA);
    if (r.status !== 'ok') throw new Error(r.status);
    // Cada amostra da rua pertence a um só rio (o mais próximo): as frações são partes
    // separadas da rua e somam (antes valia o máximo, o que subestimava a exposição).
    const soma = m.exposicao.entradas.reduce((t, e) => t + e[6]!, 0);
    const mult = r.recomendada.rota.trechos[0]!.multiplicador;
    expect(soma).toBeGreaterThan(0.4);
    expect(mult).toBeCloseTo(1 + 49 * soma, 4);
  });

  it('ESTAVEL e DESCONHECIDO não penalizam', () => {
    const { desvio } = mundoPonte({ contorno: false });
    for (const l of [[leitura(1, 'ESTAVEL', 1)], []]) {
      const r = desvio.rotear(N0, S0, l, AGORA);
      if (r.status !== 'ok') throw new Error(r.status);
      expect(r.modo).toBe('sem_risco');
      expect(r.recomendada.rota.trechos.every((t) => t.multiplicador === 1)).toBe(true);
    }
  });
});

describe('escolherApoio', () => {
  const apoio = (id: number, x: number, y: number) => ({ id, ...p(x, y) });

  it('prefere o alcançável sem travessia a um mais perto que exige atravessar', () => {
    const { desvio } = mundoPonte({ contorno: false });
    const lista = desvio.escolherApoio(
      N0,
      [apoio(10, 0, -150), apoio(11, 1000, 150)],
      critico,
      AGORA,
    );
    expect(lista.map((x) => x.apoio.id)).toEqual([11, 10]);
    expect(lista[0]!.resultado.modo).toBe('segura');
    expect(lista[1]!.resultado.modo).toBe('menos_exposta');
  });

  it('todos exigem travessia: ordena por distância mais exposição', () => {
    const { desvio } = mundoPonte({ contorno: false });
    const lista = desvio.escolherApoio(
      N0,
      [apoio(10, 1000, -150), apoio(11, 500, -150)],
      critico,
      AGORA,
    );
    expect(lista.every((x) => x.resultado.modo === 'menos_exposta')).toBe(true);
    expect(lista.map((x) => x.apoio.id)).toEqual([11, 10]);
  });

  it('o inalcançável fica por último, e a lista vazia dá vazio', () => {
    const { desvio } = mundoPonte();
    const lista = desvio.escolherApoio(
      N0,
      [apoio(10, 9000, 9000), apoio(11, 1000, -150)],
      critico,
      AGORA,
    );
    expect(lista.map((x) => x.apoio.id)).toEqual([11, 10]);
    expect(lista[1]!.resultado.status).toBe('destino_longe');
    expect(desvio.escolherApoio(N0, [], critico, AGORA)).toEqual([]);
  });

  it('considera os 2 mais próximos pela rota além do limite em linha reta', () => {
    const { desvio } = mundoPonte({ contorno: false });
    const apoios = [apoio(1, 0, -150), apoio(2, 20, -150), apoio(3, 40, -150), apoio(4, 1000, 150)];
    const lista = desvio.escolherApoio(N0, apoios, critico, AGORA, 3);
    expect(lista).toHaveLength(4); // 3 em linha reta + o 4º, entre os 2 mais próximos pela rota
    expect(lista[0]!.apoio.id).toBe(4);
  });
});

describe('propriedade: tudo ESTAVEL equivale ao roteador normal', () => {
  it('em 100 pares aleatórios de uma malha com rio', () => {
    const rnd = mulberry32(2026);
    const nos: Ponto[] = [];
    const lado = 7;
    for (let i = 0; i < lado; i++) {
      for (let j = 0; j < lado; j++) nos.push([i * 150 + rnd() * 40, j * 150 + rnd() * 40]);
    }
    const arestas = [];
    for (let i = 0; i < lado; i++) {
      for (let j = 0; j < lado; j++) {
        if (i + 1 < lado) arestas.push({ de: i * lado + j, para: (i + 1) * lado + j });
        if (j + 1 < lado) arestas.push({ de: i * lado + j, para: i * lado + j + 1 });
      }
    }
    const m = criarMundo({
      nos,
      arestas,
      rios: [
        {
          rio: 'Piabanha',
          pontos: [
            [-50, 400],
            [600, 520],
            [1000, 450],
          ],
        },
      ],
      estacoes: [{ id: 1, rio: 'Piabanha', x: 500, y: 490 }],
    });
    const ponto = () => p(rnd() * 900, rnd() * 900);
    for (let k = 0; k < 100; k++) {
      const o = ponto();
      const d = ponto();
      const esperado = m.roteador.rotear(o, d);
      const r = m.desvio.rotear(o, d, [leitura(1, 'ESTAVEL', 1)], AGORA);
      expect(r.status).toBe(esperado.status);
      if (r.status === 'ok' && esperado.status === 'ok') {
        expect(r.modo).toBe('sem_risco');
        expect(r.recomendada.rota.custo).toBeCloseTo(esperado.custo, 6);
        expect(r.recomendada.rota.trechos.map((t) => t.arestaId)).toEqual(
          esperado.trechos.map((t) => t.arestaId),
        );
      }
    }
  });
});
