/**
 * Decide se um way do OpenStreetMap pode ser percorrido a pé.
 *
 * ESTA TABELA SERÁ REVISADA COM A EQUIPE. Cada linha abaixo é uma decisão de projeto, não um
 * fato do OSM: mudar uma classe de lado muda quais caminhos o app oferece.
 *
 * Ordem em que as regras são aplicadas (a primeira que bate decide):
 *
 *   1. Sem tag `highway`                                              -> NÃO (não é via)
 *   2. `highway` excluída (motorway, motorway_link, trunk, trunk_link,
 *      construction, proposed, raceway)                              -> NÃO (sempre; nem foot=yes muda)
 *   3. `highway` fora da lista de incluídas (ex.: bridleway, platform) -> NÃO
 *   4. `area=yes` (polígono, não é uma linha de caminho)              -> NÃO
 *   5. `foot=no`                                                      -> NÃO
 *   6. `foot=yes|designated|permissive`                               -> SIM (vale mais que o `access`)
 *   7. `access=no|private`                                            -> NÃO
 *   8. qualquer outro caso                                            -> SIM
 *
 * Classes incluídas (e os `*_link` das que têm):
 *   footway, path, pedestrian, steps, residential, living_street, service, unclassified,
 *   tertiary, secondary, primary, track, cycleway, corridor.
 *
 * Observações para a revisão:
 *   - `service` entra inteira, o que inclui acessos de garagem (`service=driveway`) e vias de
 *     estacionamento. Pode gerar atalhos por dentro de lotes.
 *   - `primary`/`secondary` entram porque, em Petrópolis, muitas vezes são a única ligação entre
 *     bairros; nem sempre há calçada.
 *   - `foot=permissive` não está na especificação original (`yes`/`designated`); foi tratado como
 *     `yes` porque diz exatamente que o pedestre pode passar.
 *   - `access=customers`, `delivery`, `permissive` etc. NÃO bloqueiam. Só `no` e `private`.
 *   - `oneway` é IGNORADO: pedestre anda nos dois sentidos. A única exceção é `oneway:foot=yes`
 *     (ou `-1`, sentido contrário ao desenho do way), tratada em `sentidoUnicoAPe`.
 */
import type { Tags } from './osm';

const INCLUIDAS = new Set([
  'footway',
  'path',
  'pedestrian',
  'steps',
  'residential',
  'living_street',
  'service',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'track',
  'cycleway',
  'corridor',
]);

const EXCLUIDAS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'construction',
  'proposed',
  'raceway',
]);

const FOOT_PERMITIDO = new Set(['yes', 'designated', 'permissive']);
const ACCESS_PROIBIDO = new Set(['no', 'private']);

export interface Avaliacao {
  caminhavel: boolean;
  /** Qual regra decidiu (útil para depurar e para a revisão da tabela). */
  motivo: string;
}

export function avaliarCaminhavel(tags: Tags | undefined): Avaliacao {
  const highway = tags?.['highway'];
  if (!tags || !highway) return { caminhavel: false, motivo: 'sem highway' };

  if (EXCLUIDAS.has(highway)) return { caminhavel: false, motivo: `highway=${highway} excluída` };
  if (!INCLUIDAS.has(highway))
    return { caminhavel: false, motivo: `highway=${highway} não incluída` };
  if (tags['area'] === 'yes') return { caminhavel: false, motivo: 'area=yes' };

  const foot = tags['foot'];
  if (foot === 'no') return { caminhavel: false, motivo: 'foot=no' };
  if (foot !== undefined && FOOT_PERMITIDO.has(foot)) {
    return { caminhavel: true, motivo: `foot=${foot}` };
  }

  const access = tags['access'];
  if (access !== undefined && ACCESS_PROIBIDO.has(access)) {
    return { caminhavel: false, motivo: `access=${access}` };
  }
  return { caminhavel: true, motivo: `highway=${highway}` };
}

export const caminhavel = (tags: Tags | undefined): boolean => avaliarCaminhavel(tags).caminhavel;

/**
 * Sentido único para pedestres. `oneway:foot=yes` vale no sentido do desenho do way ('frente');
 * `-1` vale no sentido contrário ('tras'). Sem a tag (o normal), o pedestre anda nos dois sentidos.
 */
export function sentidoUnicoAPe(tags: Tags | undefined): 'frente' | 'tras' | null {
  const valor = tags?.['oneway:foot'];
  if (valor === 'yes') return 'frente';
  if (valor === '-1') return 'tras';
  return null;
}
