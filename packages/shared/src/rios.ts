/**
 * Nomes de rios. Ficam aqui porque a API, o app e as ferramentas de dados (tools/grafo) precisam
 * comparar o nome de um rio do mesmo jeito: "Rio Piabanha" (como vem da API), "Piabanha" (como
 * está na lista de rios alvo) e "RIO PIABANHÁ" (como alguém digitou no OpenStreetMap).
 */

/**
 * Minúsculas, sem acento, sem espaços sobrando e sem o prefixo "rio ". Só o prefixo "rio ": o
 * resto do nome fica como está, então "Rio Piabanha do Sul" vira "piabanha do sul".
 *
 * Quem compara deve usar IGUALDADE entre nomes normalizados, nunca "contém".
 */
export function normalizarNome(nome: string): string {
  const semAcento = nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return semAcento.startsWith('rio ') ? semAcento.slice(4).trim() : semAcento;
}
