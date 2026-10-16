/**
 * Guarda de plataforma: src/ roda no celular (Hermes), sem Node. Falha se algum arquivo de
 * produção (todos menos *.test.ts) usar 'node:*', Buffer, fs, path, process ou require.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MODULOS = [
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

const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function dependenciasDoNode(codigo: string): string[] {
  const limpo = semComentarios(codigo);
  const regras: [string, RegExp][] = [
    ["import de 'node:*'", /(?:from|import)\s*\(?\s*['"]node:/],
    ['require()', /\brequire\s*\(/],
    ['Buffer', /\bBuffer\b/],
    ['process', /\bprocess\b/],
    ['__dirname/__filename', /\b__(?:dirname|filename)\b/],
    ['import.meta.dirname', /import\.meta\.(?:dirname|filename)/],
    [
      'import de módulo do Node sem o prefixo',
      new RegExp(`(?:from|import)\\s*\\(?\\s*['"](?:${MODULOS.join('|')})['"]`),
    ],
  ];
  return regras.filter(([, r]) => r.test(limpo)).map(([nome]) => nome);
}

const dirSrc = dirname(fileURLToPath(import.meta.url));
const arquivos = readdirSync(dirSrc).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));

describe('restrição de plataforma (Hermes, sem Node)', () => {
  it('encontra os arquivos de produção para varrer', () => {
    expect(arquivos).toEqual(
      expect.arrayContaining([
        'index.ts',
        'desvio.ts',
        'estados.ts',
        'politica.ts',
        'validar.ts',
        'geo.ts',
        'tipos.ts',
      ]),
    );
  });

  it.each(arquivos)('%s não depende de Node', (arquivo) => {
    expect(dependenciasDoNode(readFileSync(join(dirSrc, arquivo), 'utf8')), arquivo).toEqual([]);
  });

  it.each([
    ["import { x } from 'node:fs';", "import de 'node:*'"],
    ['const b = Buffer.from("a");', 'Buffer'],
    ['const x = process.env.A;', 'process'],
    ['const f = require("fs");', 'require()'],
  ])('o detector acusa %s', (codigo, esperado) => {
    expect(dependenciasDoNode(codigo)).toContain(esperado);
  });

  it('o detector ignora comentários', () => {
    expect(dependenciasDoNode('// usa process e Buffer\nconst a = 1;')).toEqual([]);
  });
});
