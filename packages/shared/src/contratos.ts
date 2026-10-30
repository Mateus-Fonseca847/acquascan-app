/**
 * Contratos PLANEJADOS da API (C1 a C7): tipos publicados antes da implementação.
 *
 * Descrição e status de cada contrato: docs/planejamento/contratos-api.md.
 *
 * Por que está separado de `tipos.ts`: os endpoints daqui ainda não existem. Os tipos novos ESTENDEM os
 * de `tipos.ts` em vez de alterá-los, para a API e o app atuais continuarem compilando. O frontend
 * monta as telas com estes tipos (atrás de uma flag, com fixtures). Quando o endpoint de um contrato for
 * implementado, o cartão do backend move o tipo para `tipos.ts` e remove o duplicado daqui.
 */
import type { Estado } from './estado';
import type {
  Alerta,
  Cidade,
  EstacaoDetalhe,
  EstacaoResumo,
  Perfil,
  PontoApoio,
  PrevisaoDia,
} from './tipos';

// C1 · Estação "sem dados" (BE-01) -------------------------------------------------------------------

/** Campos novos de cada estação em GET /estacoes e GET /estacoes/:id. */
export interface EstacaoStatusLeitura {
  /** true se não há leitura há mais de ESTACAO_SEM_DADOS_MIN (padrão 20) ou se nunca houve. */
  semDados: boolean;
  /** Minutos desde a última leitura, pelo relógio do SERVIDOR. null se nunca houve leitura. */
  idadeLeituraMin: number | null;
}

export interface EstacaoResumoComStatus extends EstacaoResumo, EstacaoStatusLeitura {}

export interface EstacaoDetalheComStatus extends EstacaoDetalhe, EstacaoStatusLeitura {}

// C3 · Seguir estações, nível de alerta e alívio (BE-03) ---------------------------------------------

/** ATENCAO_E_CRITICO avisa Atenção e Crítico; SO_CRITICO avisa só o Crítico. */
export const NIVEIS_ALERTA = ['ATENCAO_E_CRITICO', 'SO_CRITICO'] as const;
export type NivelAlerta = (typeof NIVEIS_ALERTA)[number];

/** PIORA: o estado piorou. ALIVIO: saiu do crítico (para Atenção ou Estável). */
export const TIPOS_ALERTA = ['PIORA', 'ALIVIO'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

/**
 * Item de GET /alertas com os campos novos `tipo` e `rio`. Os demais campos são os de `Alerta`.
 * O `rio` é o nome do rio da estação (o mesmo de `EstacaoResumo.rio`); o FE-07 mostra estação e rio.
 */
export interface AlertaComTipo extends Alerta {
  tipo: TipoAlerta;
  rio: string;
}

/** Conteúdo `data` da notificação push. O app usa isso para abrir o detalhe da estação. */
export interface PushDadosAlerta {
  alertaId: number;
  estacaoId: number;
  estado: Estado;
}

// C2 · Perfil editável, trocar senha, exportar dados (BE-02) -----------------------------------------

/** GET /usuarios/me e resposta de PATCH /usuarios/me: o `Perfil` de hoje mais os campos do C3. */
export interface PerfilCompleto extends Perfil {
  nivelAlerta: NivelAlerta;
  /** Ids das estações seguidas. */
  estacoesSeguidas: number[];
}

/** Resposta de PATCH /usuarios/me/senha. O token novo substitui o atual; os outros deixam de valer. */
export interface TrocaSenhaResposta {
  token: string;
}

/** Resposta de GET /usuarios/me/dados (portabilidade, LGPD). Nunca traz senha, hash nem tokens. */
export interface DadosExportados {
  /** ISO 8601. */
  exportadoEm: string;
  perfil: {
    nome: string;
    email: string;
    consentimentoEm: string;
    criadoEm: string;
    cidade: Pick<Cidade, 'nome' | 'uf'>;
    nivelAlerta: NivelAlerta;
  };
  estacoesSeguidas: Array<{ id: number; nome: string }>;
  /** Quantidade de aparelhos com push registrado (o token em si nunca é exportado). */
  dispositivosPush: number;
}

// C4 · Previsão com temperatura atual e condição (BE-04) ---------------------------------------------

/** Fixo: são as cinco ilustrações do design. */
export const CONDICOES_TEMPO = [
  'ENSOLARADO',
  'NUBLADO',
  'CHUVOSO',
  'INSTAVEL',
  'TEMPESTUOSO',
] as const;
export type CondicaoTempo = (typeof CONDICOES_TEMPO)[number];

export interface PrevisaoAtual {
  temperaturaC: number;
  sensacaoC: number;
  condicao: CondicaoTempo;
}

/** Dia da previsão com o campo novo `condicao`. */
export interface PrevisaoDiaComCondicao extends PrevisaoDia {
  condicao: CondicaoTempo;
}

/**
 * Resposta de GET /previsao depois do C4: um objeto, no lugar do array de dias de hoje.
 * ATENÇÃO, MUDANÇA QUE QUEBRA: a resposta atual é `PrevisaoDia[]`. API e app precisam migrar juntos
 * (ver contratos-api.md, seção C4).
 */
export interface PrevisaoResposta {
  atual: PrevisaoAtual;
  dias: PrevisaoDiaComCondicao[];
}

// C5 · Pontos de apoio reais (BE-05) -----------------------------------------------------------------

/** MEDIA: o app avisa "confirme com a Defesa Civil". Confiança Baixa não é importada. */
export const CONFIANCAS_APOIO = ['ALTA', 'MEDIA'] as const;
export type ConfiancaApoio = (typeof CONFIANCAS_APOIO)[number];

/**
 * Ponto de apoio com os campos novos. Difere de `PontoApoio` em `capacidade` (agora pode ser null),
 * por isso não estende o tipo atual.
 */
export interface PontoApoioReal extends Omit<PontoApoio, 'capacidade'> {
  bairro: string | null;
  /** null = desconhecida: o app esconde a linha. Nunca mostrar "capacidade: null". */
  capacidade: number | null;
  /** null: o app mostra "199 Defesa Civil" (contato padrão). */
  contato: string | null;
  confianca: ConfiancaApoio;
}

// C6 · Pesquisa por rua (BE-06) ----------------------------------------------------------------------

export interface EstacaoDaRua {
  id: number;
  nome: string;
  rio: string;
  estado: Estado;
  semDados: boolean;
}

/** Item de GET /ruas/busca. Lista vazia = nenhum resultado. */
export interface ResultadoRua {
  id: number;
  nome: string;
  bairro: string | null;
  /** Ponto da rua mais próximo da estação. */
  latitude: number;
  longitude: number;
  /** null: sem estação ao alcance ("Sem estação nesta rua"). */
  estacao: EstacaoDaRua | null;
  distanciaEstacaoM: number | null;
}

// C7 · Recuperar senha (BE-08) -----------------------------------------------------------------------

/** Resposta (202) de POST /auth/esqueci-senha. É sempre a mesma, exista ou não o e-mail. */
export interface EsqueciSenhaResposta {
  mensagem: string;
}
