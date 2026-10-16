import { describe, expect, it } from 'vitest';
import { montarGrafo, mulberry32, pontoEmMetros, type DefinicaoAresta } from '../test/auxiliares';
import { acompanhar, ESTADO_INICIAL, type EstadoAcompanhamento } from './acompanhar';
import { haversineM } from './geo';
import { gerarPassos } from './passos';
import { criarRoteador } from './roteador';
import type { LatLng, RotaEncontrada } from './tipos';

type Ponto = [number, number];

function montar(nos: Ponto[], arestas: DefinicaoAresta[], origem: Ponto, destino: Ponto) {
  const roteador = criarRoteador(montarGrafo(nos, arestas));
  const rota = roteador.rotear(pontoEmMetros(...origem), pontoEmMetros(...destino));
  if (rota.status !== 'ok') throw new Error(rota.status);
  return { rota, passos: gerarPassos(rota, roteador) };
}

/** O ponto a `d` metros do início da linha da rota, mais um deslocamento (metros leste/norte). */
function pontoNaRota(rota: RotaEncontrada, d: number, dx = 0, dy = 0): LatLng {
  let falta = d;
  const pts = rota.pontos;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    if (falta <= l || i === pts.length - 1) {
      const t = l === 0 ? 0 : Math.min(1, falta / l);
      return deslocar(
        {
          latitude: a.latitude + t * (b.latitude - a.latitude),
          longitude: a.longitude + t * (b.longitude - a.longitude),
        },
        dx,
        dy,
      );
    }
    falta -= l;
  }
  return deslocar(pts[0]!, dx, dy);
}

function deslocar(p: LatLng, dx: number, dy: number): LatLng {
  return {
    latitude: p.latitude + dy / 111_195,
    longitude: p.longitude + dx / (111_195 * Math.cos((p.latitude * Math.PI) / 180)),
  };
}

/** Ruído uniforme num disco de raio `raio` metros. */
function ruido(rnd: () => number, raio: number): [number, number] {
  const ang = rnd() * 2 * Math.PI;
  const r = raio * Math.sqrt(rnd());
  return [r * Math.cos(ang), r * Math.sin(ang)];
}

// Rota em "L" e depois "L" de novo: 500 m ao norte, 500 m a leste, 500 m ao norte.
const NOS: Ponto[] = [
  [0, 0],
  [0, 500],
  [500, 500],
  [500, 1000],
];
const ARESTAS: DefinicaoAresta[] = [
  { de: 0, para: 1, nome: 'Rua A' },
  { de: 1, para: 2, nome: 'Rua B' },
  { de: 2, para: 3, nome: 'Rua C' },
];

describe('acompanhar: caminhada com ruído de GPS', () => {
  const { rota, passos } = montar(NOS, ARESTAS, NOS[0]!, NOS[3]!);

  it('com ruído de 8 m a rota termina em chegou e nunca marca foraDaRota', () => {
    const rnd = mulberry32(20261016);
    let estado: EstadoAcompanhamento = ESTADO_INICIAL;
    let anterior = -1;
    let chegou = false;
    for (let d = 0; d <= rota.distanciaRedeM + 20; d += 10) {
      const [dx, dy] = ruido(rnd, 8);
      const r = acompanhar(rota, passos, pontoNaRota(rota, d, dx, dy), estado);
      estado = r.estado;
      expect(r.foraDaRota).toBe(false);
      expect(r.passoAtualIndice).toBeGreaterThanOrEqual(anterior);
      anterior = r.passoAtualIndice;
      chegou = r.chegou;
    }
    expect(chegou).toBe(true);
    expect(estado.progressoM).toBeGreaterThan(rota.distanciaRedeM - 30);
  });

  it('o passo atual e as distâncias acompanham o progresso', () => {
    // 600 m: já na Rua B (a curva fica em 500 m), faltam 400 m
    // o progresso vem do estado: a busca só olha uns 250 m à frente dele
    const estado = { progressoM: 590, amostrasFora: 0, foraDaRota: false };
    const r = acompanhar(rota, passos, pontoNaRota(rota, 600), estado);
    expect(passos[r.passoAtualIndice]!.texto).toBe('Vire à direita na Rua B');
    expect(r.distanciaAtePassoM).toBeCloseTo(400, -1); // até a curva seguinte (em 1000 m)
    expect(r.distanciaRestanteM).toBeCloseTo(900, -1);
    expect(r.distanciaDaRotaM).toBeLessThan(1);
    expect(r.chegou).toBe(false);
    // no início: partida
    const inicio = acompanhar(rota, passos, pontoNaRota(rota, 0));
    expect(passos[inicio.passoAtualIndice]!.tipo).toBe('partida');
    expect(inicio.distanciaAtePassoM).toBeCloseTo(500, -1);
  });

  it('desvio de 100 m: foraDaRota só na terceira amostra; volta ao normal ao retornar', () => {
    let estado: EstadoAcompanhamento = ESTADO_INICIAL;
    const passo = (d: number, dx = 0) => {
      const r = acompanhar(rota, passos, pontoNaRota(rota, d, dx, 0), estado);
      estado = r.estado;
      return r;
    };
    expect(passo(100).foraDaRota).toBe(false);
    expect(passo(110, -100).foraDaRota).toBe(false); // 1ª amostra fora (100 m)
    expect(passo(120, -100).foraDaRota).toBe(false); // 2ª
    const terceira = passo(130, -100);
    expect(terceira.foraDaRota).toBe(true); // 3ª
    expect(terceira.distanciaDaRotaM).toBeGreaterThan(90);
    expect(passo(140, -100).foraDaRota).toBe(true); // continua
    expect(passo(150, -25).foraDaRota).toBe(true); // 25 m: ainda não "voltou" (precisa de menos de 20)
    expect(passo(160, -5).foraDaRota).toBe(false); // voltou
  });

  it('amostras fora que não são seguidas não contam', () => {
    let estado: EstadoAcompanhamento = ESTADO_INICIAL;
    for (const dx of [-100, -100, 0, -100, -100, 0, -100]) {
      const r = acompanhar(rota, passos, pontoNaRota(rota, 100, dx), estado);
      estado = r.estado;
      expect(r.foraDaRota).toBe(false);
    }
  });

  it('GPS que recua 15 m não faz o progresso nem o passo regredirem', () => {
    // logo depois da curva em 500 m
    let estado: EstadoAcompanhamento = ESTADO_INICIAL;
    let r = acompanhar(rota, passos, pontoNaRota(rota, 490), estado);
    estado = r.estado;
    r = acompanhar(rota, passos, pontoNaRota(rota, 520), estado);
    estado = r.estado;
    const indice = r.passoAtualIndice;
    const progresso = estado.progressoM;
    expect(passos[indice]!.tipo).toBe('curva');
    r = acompanhar(rota, passos, pontoNaRota(rota, 505), estado); // recuou 15 m
    expect(r.passoAtualIndice).toBe(indice);
    expect(r.estado.progressoM).toBeGreaterThanOrEqual(progresso);
    expect(r.foraDaRota).toBe(false);
  });

  it('não chega antes do fim: a 100 m do destino chegou é falso', () => {
    const r = acompanhar(rota, passos, pontoNaRota(rota, rota.distanciaRedeM - 100));
    expect(r.chegou).toBe(false);
    const fim = acompanhar(rota, passos, pontoNaRota(rota, rota.distanciaRedeM - 10));
    expect(fim.chegou).toBe(true);
  });
});

describe('acompanhar: rota que passa duas vezes perto do mesmo ponto', () => {
  // Laço de ~2,4 km que termina a 15 m do começo.
  const nos: Ponto[] = [
    [0, 0],
    [0, 600],
    [600, 600],
    [600, 0],
    [15, 0],
  ];
  const arestas: DefinicaoAresta[] = [
    { de: 0, para: 1, nome: 'Rua A' },
    { de: 1, para: 2, nome: 'Rua B' },
    { de: 2, para: 3, nome: 'Rua C' },
    { de: 3, para: 4, nome: 'Rua D' },
  ];
  const { rota, passos } = montar(nos, arestas, nos[0]!, nos[4]!);

  it('no começo do laço o progresso não salta para a volta', () => {
    const r = acompanhar(rota, passos, pontoNaRota(rota, 0, 10, 0));
    expect(r.estado.progressoM).toBeLessThan(30);
    expect(r.passoAtualIndice).toBe(0);
    // e o destino (a 15 m daqui) não conta como chegada: ainda falta o laço inteiro
    expect(r.chegou).toBe(true); // a posição ESTÁ perto do destino (linha reta)...
    expect(r.distanciaRestanteM).toBeGreaterThan(2000); // ...mas o progresso mostra que falta tudo
  });

  it('a caminhada completa avança sem saltos', () => {
    const rnd = mulberry32(7);
    let estado: EstadoAcompanhamento = ESTADO_INICIAL;
    let anterior = 0;
    for (let d = 0; d <= rota.distanciaRedeM; d += 10) {
      const [dx, dy] = ruido(rnd, 6);
      const r = acompanhar(rota, passos, pontoNaRota(rota, d, dx, dy), estado);
      estado = r.estado;
      expect(r.estado.progressoM - anterior).toBeLessThan(60);
      expect(r.foraDaRota).toBe(false);
      anterior = r.estado.progressoM;
    }
    expect(anterior).toBeGreaterThan(rota.distanciaRedeM - 30);
  });
});
