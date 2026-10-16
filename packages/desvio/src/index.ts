import { Desvio, type DadosDoDesvio } from './desvio';
import type { PoliticaParcial } from './politica';
import type { EstacaoCadastro } from './tipos';

export { Desvio } from './desvio';
export type { DadosDoDesvio } from './desvio';
export { POLITICA_PADRAO } from './politica';
export type { Politica, PoliticaParcial, RegraDoEstado } from './politica';
export type {
  ApoioAvaliado,
  ApoioCadastro,
  Aviso,
  CoberturaDeUmRio,
  EstacaoCadastro,
  Estado,
  EstadoDoSegmento,
  EstadoEfetivo,
  EstadosAtuais,
  ExposicaoBruta,
  InfoSegmento,
  LatLng,
  LeituraEstacao,
  ModoDesvio,
  OpcoesRotaDesvio,
  OrigemDoEstado,
  ResultadoDesvio,
  ResultadoDesvioOk,
  ResultadoDesvioSemRota,
  ResumoCobertura,
  RiosGeoJson,
  RotaAvaliada,
} from './tipos';

/**
 * Valida os dados (erros claros em português) e pré-calcula, uma vez, a estação que governa cada
 * segmento de rio e o índice das entradas de exposição por aresta.
 */
export function criarDesvio(
  dados: DadosDoDesvio,
  estacoes: readonly EstacaoCadastro[],
  politica?: PoliticaParcial,
): Desvio {
  return new Desvio(dados, estacoes, politica);
}
