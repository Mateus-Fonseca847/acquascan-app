/**
 * Instruções no grafo REAL de Petrópolis (gerado por tools/grafo): 300 pares aleatórios com
 * semente fixa. Só roda se o arquivo existir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../test/auxiliares';
import { gerarPassos } from './passos';
import { criarRoteador } from './roteador';
import type { GrafoBruto } from './tipos';

const arquivo = fileURLToPath(
  new URL('../../../tools/grafo/saida/grafo-petropolis.json', import.meta.url),
);

/** Semente dos pares aleatórios (a mesma do script de verificação). */
const SEMENTE = 20261016;

describe.skipIf(!existsSync(arquivo))('instruções no grafo real de Petrópolis', () => {
  it('300 pares: soma das distâncias, índices crescentes, sem passo duplicado nem em frente colado em outro', () => {
    const grafo = JSON.parse(readFileSync(arquivo, 'utf8')) as GrafoBruto;
    const roteador = criarRoteador(grafo);
    const rnd = mulberry32(SEMENTE);
    const no = () => {
      const n = grafo.nos[Math.floor(rnd() * grafo.nos.length)]!;
      return { latitude: n.lat, longitude: n.lon };
    };
    let rotas = 0;
    for (let k = 0; k < 300; k++) {
      const r = roteador.rotear(no(), no());
      if (r.status !== 'ok' || r.distanciaRedeM < 1) continue;
      rotas++;
      const passos = gerarPassos(r, roteador);
      expect(passos[0]!.tipo).toBe('partida');
      expect(passos.at(-1)!.tipo).toBe('chegada');
      const soma = passos.reduce((s, p) => s + p.distanciaM, 0);
      expect(Math.abs(soma - r.distanciaRedeM)).toBeLessThan(1);
      for (let i = 1; i < passos.length; i++) {
        const a = passos[i - 1]!;
        const b = passos[i]!;
        expect(b.indiceNaLinha).toBeGreaterThanOrEqual(a.indiceNaLinha);
        expect(b.acumuladaM).toBeGreaterThanOrEqual(a.acumuladaM - 1e-6);
        // travessia curta (menos de 15 m) só sobra como último passo antes da chegada
        if (a.tipo === 'travessia' && b.acumuladaM - a.acumuladaM < 15) {
          expect(b.tipo === 'chegada' || b.texto.startsWith('O destino fica')).toBe(true);
        }
        // nenhum passo duplicado (mesmo texto no mesmo lugar)
        expect(!(a.texto === b.texto && a.acumuladaM === b.acumuladaM)).toBe(true);
        // nenhum "em frente" seguido de outro a menos de 15 m (ruído de trecho minúsculo)
        expect(
          !(
            a.manobra === 'em_frente' &&
            b.manobra === 'em_frente' &&
            b.acumuladaM - a.acumuladaM < 15
          ),
        ).toBe(true);
      }
    }
    expect(rotas).toBeGreaterThan(200);
  });
});
