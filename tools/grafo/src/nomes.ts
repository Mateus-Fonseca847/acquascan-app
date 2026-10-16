/**
 * Normalização de nomes de rios, para comparar "Rio Piabanha", "Piabanha" e "RIO PIABANHÁ".
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
