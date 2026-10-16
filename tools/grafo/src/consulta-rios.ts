/**
 * A consulta à Overpass para os rios. Uma só, com o mesmo cache e as mesmas regras do download
 * das ruas (veja baixar.ts).
 */
import type { Bbox } from './config';

const TIMEOUT_SERVIDOR_S = 180;

/** Tipos de `waterway` que interessam: rios, córregos, canais e valas de drenagem. */
export const TIPOS_WATERWAY = ['river', 'stream', 'canal', 'drain'] as const;
export type TipoWaterway = (typeof TIPOS_WATERWAY)[number];

/**
 * (a) os ways `waterway` = river, stream, canal ou drain dentro da caixa; e (b) as relações
 * `type=waterway` com `name` (um rio inteiro, que reúne os ways de um mesmo nome, mesmo os que
 * não têm a tag). A recursão `>` traz os ways membros das relações e os nós de todos.
 */
export function montarConsultaRios(bbox: Bbox): string {
  const caixa = `${bbox.sul},${bbox.oeste},${bbox.norte},${bbox.leste}`;
  const tipos = TIPOS_WATERWAY.join('|');
  return (
    `[out:json][timeout:${TIMEOUT_SERVIDOR_S}];(` +
    `way["waterway"~"^(${tipos})$"](${caixa});` +
    `rel["type"="waterway"]["name"](${caixa});` +
    `);(._;>;);out body;`
  );
}
