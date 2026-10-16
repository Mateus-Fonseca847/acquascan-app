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

const FEMININOS = new Set([
  'rua',
  'avenida',
  'travessa',
  'alameda',
  'estrada',
  'praca',
  'ladeira',
  'servidao',
  'rodovia',
  'via',
  'passarela',
]);
const MASCULINOS = new Set(['beco', 'caminho', 'largo', 'viaduto', 'tunel']);

/** O gênero pelo tipo do nome (primeira palavra). Fora das listas: neutro. */
export function generoDoNome(nome: string): Genero {
  const primeira = normalizarTexto(nome).split(' ')[0] ?? '';
  if (FEMININOS.has(primeira)) return 'f';
  if (MASCULINOS.has(primeira)) return 'm';
  return 'n';
}

/** Como se refere a uma via: o nome, ou uma descrição pela classe quando não tem nome. */
export interface ReferenciaVia {
  texto: string;
  genero: Genero;
}

export function referenciaDaVia(nome: string | null, classe: string): ReferenciaVia {
  if (nome !== null && nome.trim() !== '')
    return { texto: nome.trim(), genero: generoDoNome(nome) };
  switch (classe) {
    case 'footway':
      return { texto: 'passagem de pedestres', genero: 'f' };
    case 'steps':
      return { texto: 'escadaria', genero: 'f' };
    case 'path':
    case 'track':
      return { texto: 'caminho', genero: 'm' };
    case 'service':
      return { texto: 'via de serviço', genero: 'f' };
    default:
      return { texto: 'via', genero: 'f' };
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
