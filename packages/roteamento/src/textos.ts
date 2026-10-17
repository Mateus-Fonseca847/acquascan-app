/**
 * Textos das instruções de rota em português do Brasil: formatação de distância e duração, rumo
 * cardeal e escolha de preposição pelo tipo do nome da via. Só strings e números, sem plataforma.
 *
 * LIMITAÇÃO: a preposição é HEURÍSTICA, decidida pela primeira palavra do nome ("Rua", "Beco"...).
 * Nomes fora das listas usam a forma neutra ("em" e "por").
 */

/** Distância para mostrar: menos de 100 m arredonda a 5 m, até 1000 m a 10 m, acima "1,2 km". */
export function formatarDistancia(metros: number): string {
  const m = Math.max(0, metros);
  if (m < 100) return `${Math.round(m / 5) * 5} m`;
  if (m <= 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

/** Duração para mostrar: "menos de 1 min", "12 min a pé", "1 h 05 min". */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, segundos);
  if (s < 60) return 'menos de 1 min';
  const minutosTotais = Math.round(s / 60);
  if (minutosTotais < 60) return `${minutosTotais} min a pé`;
  const horas = Math.floor(minutosTotais / 60);
  const minutos = minutosTotais % 60;
  return `${horas} h ${String(minutos).padStart(2, '0')} min`;
}

const CARDEAIS = [
  'norte',
  'nordeste',
  'leste',
  'sudeste',
  'sul',
  'sudoeste',
  'oeste',
  'noroeste',
] as const;

/** O ponto cardeal (oito) de um rumo em graus (0 = norte, 90 = leste). Fronteiras a 22,5 graus. */
export function rumoCardeal(graus: number): (typeof CARDEAIS)[number] {
  const g = ((graus % 360) + 360) % 360;
  return CARDEAIS[Math.floor((g + 22.5) / 45) % 8]!;
}

export type Genero = 'f' | 'm' | 'n';

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * TABELA ÚNICA dos tipos de via (primeira palavra do nome) e do gênero que a preposição usa.
 * A comparação é pela primeira palavra do nome SEM acento e SEM diferença de maiúsculas, então as
 * chaves abaixo estão normalizadas ("praca" vale para "Praça" e "PRAÇA"). Quem não está aqui é
 * neutro e usa "em" e "por" ("em Bosque dos Namorados"). Esta lista será revisada com a equipe:
 * para incluir um tipo, basta uma linha.
 *
 * - 'f' (feminino): na, pela, à. - 'm' (masculino): no, pelo.
 */
export const TIPOS_DE_VIA: Readonly<Record<string, 'f' | 'm'>> = {
  // femininos
  rua: 'f',
  avenida: 'f',
  travessa: 'f',
  alameda: 'f',
  estrada: 'f',
  praca: 'f',
  ladeira: 'f',
  servidao: 'f',
  rodovia: 'f',
  via: 'f',
  passarela: 'f',
  ponte: 'f',
  vila: 'f',
  viela: 'f',
  vereda: 'f',
  trilha: 'f',
  passagem: 'f',
  escadaria: 'f',
  rampa: 'f',
  marginal: 'f',
  linha: 'f',
  // masculinos
  beco: 'm',
  caminho: 'm',
  largo: 'm',
  viaduto: 'm',
  tunel: 'm',
  parque: 'm',
  jardim: 'm',
  acesso: 'm',
  corredor: 'm',
  patio: 'm',
  morro: 'm',
  campo: 'm',
};

/** O gênero pelo tipo do nome (primeira palavra). Fora da tabela: neutro. */
export function generoDoNome(nome: string): Genero {
  const primeira = normalizarTexto(nome).split(' ')[0] ?? '';
  return Object.prototype.hasOwnProperty.call(TIPOS_DE_VIA, primeira)
    ? TIPOS_DE_VIA[primeira]!
    : 'n';
}

/** Como se refere a uma via: o nome, ou uma descrição pela classe quando não tem nome. */
export interface ReferenciaVia {
  texto: string;
  genero: Genero;
  /** A via não tem nome: o texto é uma descrição pela classe ("passagem de pedestres"). */
  semNome: boolean;
}

export function referenciaDaVia(nome: string | null, classe: string): ReferenciaVia {
  if (nome !== null && nome.trim() !== '')
    return { texto: nome.trim(), genero: generoDoNome(nome), semNome: false };
  switch (classe) {
    case 'footway':
      return { texto: 'passagem de pedestres', genero: 'f', semNome: true };
    case 'steps':
      return { texto: 'escadaria', genero: 'f', semNome: true };
    case 'path':
    case 'track':
      return { texto: 'caminho', genero: 'm', semNome: true };
    case 'service':
      return { texto: 'via de serviço', genero: 'f', semNome: true };
    default:
      return { texto: 'via', genero: 'f', semNome: true };
  }
}

export type Preposicao = 'em' | 'por' | 'a' | 'de';

const FORMAS: Record<Preposicao, Record<Genero, string>> = {
  em: { f: 'na', m: 'no', n: 'em' },
  por: { f: 'pela', m: 'pelo', n: 'por' },
  // "até a Rua X", "da Rua X": sem forma neutra definida, o neutro usa a feminina ("rua")
  a: { f: 'a', m: 'o', n: 'a' },
  de: { f: 'da', m: 'do', n: 'da' },
};

/** "na Rua X", "pelo Beco Y", "em Z". */
export function comPreposicao(prep: Preposicao, ref: ReferenciaVia): string {
  return `${FORMAS[prep][ref.genero]} ${ref.texto}`;
}
