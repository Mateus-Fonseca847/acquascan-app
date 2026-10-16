import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../test/auxiliares';
import { HeapBinario } from './heap';

describe('HeapBinario', () => {
  it('devolve as entradas em ordem crescente de chave, com o nó e o g de cada uma', () => {
    const heap = new HeapBinario(4);
    const entradas = [
      [5, 50, 1],
      [1, 10, 2],
      [3, 30, 3],
      [2, 20, 4],
      [4, 40, 5],
    ] as const;
    for (const [chave, no, g] of entradas) heap.inserir(chave, no, g);

    const saida: number[][] = [];
    while (heap.tamanho > 0) {
      saida.push([heap.chaveTopo]);
      heap.extrair();
      saida[saida.length - 1]!.push(heap.noExtraido, heap.gExtraido);
    }
    expect(saida).toEqual([
      [1, 10, 2],
      [2, 20, 4],
      [3, 30, 3],
      [4, 40, 5],
      [5, 50, 1],
    ]);
  });

  it('cresce além da capacidade inicial e continua ordenando (10 mil entradas aleatórias)', () => {
    const sorteio = mulberry32(42);
    const heap = new HeapBinario(4);
    const chaves: number[] = [];
    for (let i = 0; i < 10_000; i++) {
      const chave = sorteio() * 1000;
      chaves.push(chave);
      heap.inserir(chave, i, chave);
    }
    chaves.sort((a, b) => a - b);

    for (const esperada of chaves) {
      expect(heap.chaveTopo).toBe(esperada);
      heap.extrair();
      expect(heap.gExtraido).toBe(esperada);
    }
    expect(heap.tamanho).toBe(0);
  });

  it('aceita chaves repetidas e pode ser limpo e reaproveitado', () => {
    const heap = new HeapBinario();
    heap.inserir(1, 1, 0);
    heap.inserir(1, 2, 0);
    heap.inserir(1, 3, 0);
    heap.limpar();
    expect(heap.tamanho).toBe(0);
    heap.inserir(9, 7, 0);
    heap.extrair();
    expect(heap.noExtraido).toBe(7);
  });
});
