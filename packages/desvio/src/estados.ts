/**
 * O estado EFETIVO de uma estação: o que a política decide usar a partir da última leitura e da
 * hora de agora. Lógica pura, sem relógio próprio (a hora vem de quem chama).
 *
 * Regras:
 *  - leitura com idade <= frescoMin vale como está ('medido');
 *  - mais antiga: CRITICO e ATENCAO continuam valendo até retencaoH ('falha_segura'), porque se
 *    a estação parou de enviar durante uma cheia o pior caso é o último estado ruim;
 *  - ESTAVEL antigo, qualquer leitura além de retencaoH e estação sem leitura viram DESCONHECIDO
 *    (sem penalidade, mas sinalizados);
 *  - data inválida ou do futuro (relógio do celular errado) nunca é leitura fresca: a idade é
 *    desconhecida, então um estado ruim é mantido por falha segura (sem prazo, porque não dá para
 *    medi-lo) e um ESTAVEL vira DESCONHECIDO. Nunca se descarta um aviso de perigo por causa de um relógio errado.
 */
import type { Politica } from './politica';
import type { EstadoEfetivo, LeituraEstacao } from './tipos';

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 3_600_000;

const desconhecido = (
  origem: 'sem_leitura' | 'desatualizado',
  idadeMin: number | null,
): EstadoEfetivo => ({
  estado: 'DESCONHECIDO',
  origem,
  idadeMin,
});

export function calcularEstadoEfetivo(
  leitura: LeituraEstacao | undefined,
  agora: Date,
  politica: Pick<Politica, 'frescoMin' | 'retencaoH'>,
): EstadoEfetivo {
  if (!leitura || leitura.estado === null || leitura.medidoEm === null) {
    return desconhecido('sem_leitura', null);
  }
  const estado = leitura.estado;
  const ehRuim = estado === 'CRITICO' || estado === 'ATENCAO';

  const medidoMs = Date.parse(leitura.medidoEm);
  const agoraMs = agora.getTime();
  if (!Number.isFinite(medidoMs) || !Number.isFinite(agoraMs) || medidoMs > agoraMs) {
    // Idade desconhecida: não é fresca. Estado ruim se mantém; o resto vira desconhecido.
    return ehRuim
      ? { estado, origem: 'falha_segura', idadeMin: null }
      : desconhecido('desatualizado', null);
  }

  const idadeMs = agoraMs - medidoMs;
  const idadeMin = idadeMs / MS_POR_MINUTO;
  if (idadeMs <= politica.frescoMin * MS_POR_MINUTO) return { estado, origem: 'medido', idadeMin };
  if (ehRuim && idadeMs <= politica.retencaoH * MS_POR_HORA) {
    return { estado, origem: 'falha_segura', idadeMin };
  }
  return desconhecido('desatualizado', idadeMin);
}
