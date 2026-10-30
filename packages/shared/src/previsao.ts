/**
 * Leitura da resposta de GET /previsao, que existe em DUAS formas durante a transição do contrato C4:
 *
 * - forma de hoje: um array de dias (`PrevisaoDia[]`);
 * - forma nova (C4): um pacote `{ atual, dias }` (`PrevisaoResposta`).
 *
 * `lerPrevisao` aceita as duas e devolve sempre o mesmo formato, para a tela não precisar saber qual
 * chegou. Assim o app não quebra no dia em que o BE-04 trocar o formato do servidor. Depois que a forma de
 * hoje deixar de existir, o ramo do array pode ser removido.
 *
 * Regras de honestidade: nunca inventa dado. Sem temperatura atual (ou com ela malformada), `atual` é
 * `null`; condição do tempo desconhecida é `null`. Já um DIA malformado derruba a leitura inteira com
 * erro, em vez de mostrar uma previsão incompleta sem avisar.
 */
import { z } from 'zod';
import { RISCOS_CHUVA } from './chuva';
import { CONDICOES_TEMPO, type CondicaoTempo, type PrevisaoAtual } from './contratos';
import type { PrevisaoDia } from './tipos';

/** Dia da previsão como o app o usa: `condicao` é `null` na forma de hoje, que não a traz. */
export interface PrevisaoDiaLido extends PrevisaoDia {
  condicao: CondicaoTempo | null;
}

/** Previsão no formato único entregue à tela. `atual` é `null` quando o servidor não a envia. */
export interface PrevisaoLida {
  atual: PrevisaoAtual | null;
  dias: PrevisaoDiaLido[];
}

/** A resposta não é nem a lista de hoje nem o pacote `{ atual, dias }`, ou algum dia está malformado. */
export class ErroFormatoPrevisao extends Error {
  constructor() {
    super(
      'A previsão chegou num formato que o app não entende. Atualize o aplicativo e tente de novo.',
    );
    this.name = 'ErroFormatoPrevisao';
  }
}

const diaSchema = z.object({
  data: z.string().min(1),
  chuvaMm: z.number(),
  probabilidadeChuvaPct: z
    .number()
    .nullish()
    .transform((valor) => valor ?? null),
  temperaturaMinC: z.number(),
  temperaturaMaxC: z.number(),
  risco: z.enum(RISCOS_CHUVA),
  /** Ausente na forma de hoje; valor desconhecido também vira null (não derruba o dia). */
  condicao: z.enum(CONDICOES_TEMPO).nullable().catch(null),
});

const atualSchema = z.object({
  temperaturaC: z.number(),
  sensacaoC: z.number(),
  condicao: z.enum(CONDICOES_TEMPO),
});

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Lê a resposta de GET /previsao, em qualquer uma das duas formas.
 * @throws {ErroFormatoPrevisao} se a resposta não tiver um formato reconhecido ou um dia for inválido.
 */
export function lerPrevisao(resposta: unknown): PrevisaoLida {
  let bruto: { atual: unknown; dias: unknown };
  if (Array.isArray(resposta)) {
    bruto = { atual: null, dias: resposta };
  } else if (ehObjeto(resposta) && 'dias' in resposta) {
    bruto = { atual: resposta.atual ?? null, dias: resposta.dias };
  } else {
    throw new ErroFormatoPrevisao();
  }

  const dias = z.array(diaSchema).safeParse(bruto.dias);
  if (!dias.success) throw new ErroFormatoPrevisao();

  const atual = atualSchema.safeParse(bruto.atual);
  return { atual: atual.success ? atual.data : null, dias: dias.data };
}
