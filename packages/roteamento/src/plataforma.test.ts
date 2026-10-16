/**
 * Guarda de plataforma: o código de src/ roda no celular (Hermes), que não tem nada do Node.
 * Este teste falha se algum arquivo de produção (todos menos *.test.ts) usar 'node:*', Buffer,
 * fs, path, process ou require. O tsconfig.json (sem tipos do Node) também pega isso na compilação.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MODULOS_DO_NODE = [
  'fs',
  'path',
  'os',
  'url',
  'util',
  'crypto',
  'stream',
  'buffer',
  'zlib',
  'http',
  'https',
  'child_process',
  'worker_threads',
  'perf_hooks',
  'events',
];

/** Tira os comentários, que podem citar essas palavras à vontade. */
export function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Devolve o que no código depende de Node. */
export function dependenciasDoNode(codigo: string): string[] {
  const limpo = semComentarios(codigo);
  const achados: string[] = [];
  const regras: [string, RegExp][] = [
    ["import de 'node:*'", /(?:from|import)\s*\(?\s*['"]node:/],
    ['require()', /\brequire\s*\(/],
    ['Buffer', /\bBuffer\b/],
    ['process', /\bprocess\b/],
    ['__dirname/__filename', /\b__(?:dirname|filename)\b/],
    ['import.meta.dirname', /import\.meta\.(?:dirname|filename)/],
    [
      'import de módulo do Node sem o prefixo',
      new RegExp(`(?:from|import)\\s*\\(?\\s*['"](?:${MODULOS_DO_NODE.join('|')})['"]`),
    ],
  ];
  for (const [nome, regra] of regras) if (regra.test(limpo)) achados.push(nome);
  return achados;
}

const dirSrc = dirname(fileURLToPath(import.meta.url));
const arquivosDeProducao = readdirSync(dirSrc).filter(
  (nome) => nome.endsWith('.ts') && !nome.endsWith('.test.ts'),
);

describe('restrição de plataforma (Hermes, sem Node)', () => {
  it('encontra os arquivos de produção para varrer', () => {
    expect(arquivosDeProducao).toEqual(
      expect.arrayContaining([
        'index.ts',
        'roteador.ts',
        'grade.ts',
        'heap.ts',
        'geo.ts',
        'validar.ts',
        'tipos.ts',
      ]),
    );
  });

  it.each(arquivosDeProducao)('%s não depende de Node', (arquivo) => {
    const codigo = readFileSync(join(dirSrc, arquivo), 'utf8');
    expect(dependenciasDoNode(codigo), `${arquivo} usa algo do Node`).toEqual([]);
  });

  // Prova de que o detector funciona (um teste que nunca falha não protege nada).
  describe('o detector', () => {
    it.each([
      ["import { readFileSync } from 'node:fs';", "import de 'node:*'"],
      ['const fs = require("fs");', 'require()'],
      ['const b = Buffer.from("a");', 'Buffer'],
      ['const x = process.env.A;', 'process'],
      ["import path from 'path';", 'import de módulo do Node sem o prefixo'],
      ['const d = __dirname;', '__dirname/__filename'],
    ])('acusa %s', (codigo, esperado) => {
      expect(dependenciasDoNode(codigo)).toContain(esperado);
    });

    it('ignora comentários e não acusa código limpo', () => {
      expect(
        dependenciasDoNode('// usa process e Buffer\n/* require("fs") */\nconst a = 1;'),
      ).toEqual([]);
      expect(dependenciasDoNode('const processados = 3; // ok')).toEqual([]);
    });
  });
});
