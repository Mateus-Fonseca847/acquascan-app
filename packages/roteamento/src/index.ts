export { criarRoteador, Roteador } from './roteador';
export type {
  ArestaBruta,
  AtributosAresta,
  Encaixe,
  GrafoBruto,
  LatLng,
  NoBruto,
  OpcoesRota,
  ResultadoRota,
  RotaEncontrada,
  RotaSemResultado,
  Trecho,
} from './tipos';
export { acompanhar, ESTADO_INICIAL } from './acompanhar';
export type {
  EstadoAcompanhamento,
  OpcoesAcompanhamento,
  ResultadoAcompanhamento,
} from './acompanhar';
export { classificarManobra, gerarPassos } from './passos';
export type { AvisoPasso, FonteAtributos, Manobra, OpcoesPassos, Passo, TipoPasso } from './passos';
export { formatarDistancia, formatarDuracao, rumoCardeal } from './textos';
