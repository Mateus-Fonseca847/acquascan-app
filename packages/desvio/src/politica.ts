/**
 * A política de desvio: as constantes que decidem COMO o estado dos rios vira penalidade nas ruas.
 *
 * TODAS AS CONSTANTES DESTE ARQUIVO SÃO PROVISÓRIAS e precisam ser validadas com a Defesa Civil
 * antes de qualquer uso real. Foram escolhidas olhando as medições com os dados de Petrópolis
 * (veja docs/decisoes.md), não critérios técnicos de risco.
 */

export interface RegraDoEstado {
  /** Faixa de distância ao rio, em metros, cuja fração de exposição conta. Precisa ser uma das faixas do arquivo de exposição (15, 30 ou 50). */
  faixa: number;
  /** Penalidade: o multiplicador de custo de uma rua vira `1 + k × fração exposta`. */
  k: number;
  /** Uma rua que CRUZA o rio é bloqueada na passada estrita (a rota só a usa se não houver outro jeito). */
  bloqueiaTravessia: boolean;
}

export interface Politica {
  distanciaTrechoM: number;
  critico: RegraDoEstado;
  atencao: RegraDoEstado;
  frescoMin: number;
  retencaoH: number;
  larguraTravessiaM: number;
  limiarExposicaoM: number;
  diferencaMostrarMaisCurtaM: number;
  pesoExposicaoNoRanking: number;
}

export type PoliticaParcial = {
  [C in keyof Politica]?: Politica[C] extends RegraDoEstado ? Partial<RegraDoEstado> : Politica[C];
};

export const POLITICA_PADRAO: Readonly<Politica> = Object.freeze({
  /**
   * PROVISÓRIA. Um segmento de rio só é monitorado se estiver a até esta distância de uma
   * estação do MESMO rio; além disso é "sem monitoramento" e não recebe desvio. Com poucas
   * estações, o resto do rio fica sem cobertura (o mapa mostra isso em cinza).
   */
  distanciaTrechoM: 1000,

  /**
   * PROVISÓRIA. Rio em estado CRÍTICO: conta a fração da rua a até 50 m do rio, penaliza forte
   * (k = 49: uma rua toda junto ao rio custa 50 vezes o comprimento) e bloqueia as travessias
   * (ruas que cruzam o rio) enquanto houver outro caminho.
   */
  critico: Object.freeze({ faixa: 50, k: 49, bloqueiaTravessia: true }),

  /**
   * PROVISÓRIA. Rio em ATENÇÃO: conta só a faixa de 15 m, penaliza leve (k = 3) e não bloqueia.
   * Atenção é um aviso para quem puder escolher; não deve impedir uma travessia.
   */
  atencao: Object.freeze({ faixa: 15, k: 3, bloqueiaTravessia: false }),

  /**
   * PROVISÓRIA. Idade máxima, em minutos, para tratar a leitura como atual. Alinhar depois com o
   * limite de "estação sem dados" da API (as estações enviam uma leitura por minuto).
   */
  frescoMin: 20,

  /**
   * PROVISÓRIA. Por quanto tempo, em horas, um estado CRÍTICO ou ATENÇÃO antigo continua valendo
   * (FALHA SEGURA): se a estação parou de enviar durante uma cheia, o pior caso é o último
   * estado ruim, não "tudo bem". ESTÁVEL antigo não é retido.
   */
  retencaoH: 6,

  /**
   * PROVISÓRIA. Largura assumida de uma travessia, em metros. Uma rua que cruza o rio tem fração
   * efetiva mínima de `min(1, larguraTravessiaM / comprimento da rua)`, porque uma ponte curta
   * quase não tem metros "junto ao rio" medidos pela amostragem, mas é uma travessia.
   */
  larguraTravessiaM: 60,

  /**
   * PROVISÓRIA. Acima desta exposição crítica (metros da rota junto a rio crítico), o resultado
   * traz o aviso EXPOSICAO_RIO_CRITICO.
   */
  limiarExposicaoM: 50,

  /**
   * PROVISÓRIA. A rota mais curta só é mostrada junto da recomendada se tiver pelo menos esta
   * exposição crítica a mais (ou se usar travessia crítica e a recomendada não). Evita mostrar
   * duas rotas que são praticamente a mesma.
   */
  diferencaMostrarMaisCurtaM: 100,

  /**
   * PROVISÓRIA. No ranking de pontos de apoio, cada metro de exposição crítica conta como este
   * tanto de metros a mais de caminhada.
   */
  pesoExposicaoNoRanking: 10,
});

/** Junta a política padrão com os valores informados e confere se fazem sentido. */
export function resolverPolitica(parcial: PoliticaParcial = {}): Politica {
  const politica: Politica = {
    ...POLITICA_PADRAO,
    ...parcial,
    critico: { ...POLITICA_PADRAO.critico, ...parcial.critico },
    atencao: { ...POLITICA_PADRAO.atencao, ...parcial.atencao },
  };

  const positivo = (nome: string, valor: number) => {
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error(
        `Política inválida: ${nome} deve ser um número maior que zero (recebido ${valor}).`,
      );
    }
  };
  const naoNegativo = (nome: string, valor: number) => {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(
        `Política inválida: ${nome} deve ser um número maior ou igual a zero (recebido ${valor}).`,
      );
    }
  };
  positivo('distanciaTrechoM', politica.distanciaTrechoM);
  positivo('frescoMin', politica.frescoMin);
  positivo('retencaoH', politica.retencaoH);
  positivo('larguraTravessiaM', politica.larguraTravessiaM);
  naoNegativo('limiarExposicaoM', politica.limiarExposicaoM);
  naoNegativo('diferencaMostrarMaisCurtaM', politica.diferencaMostrarMaisCurtaM);
  naoNegativo('pesoExposicaoNoRanking', politica.pesoExposicaoNoRanking);
  for (const [nome, regra] of [
    ['critico', politica.critico],
    ['atencao', politica.atencao],
  ] as const) {
    positivo(`${nome}.faixa`, regra.faixa);
    naoNegativo(`${nome}.k`, regra.k);
  }
  return politica;
}
