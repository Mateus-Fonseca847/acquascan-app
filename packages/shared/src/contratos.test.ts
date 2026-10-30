import { describe, expect, it } from 'vitest';
import {
  CONDICOES_TEMPO,
  CONFIANCAS_APOIO,
  NIVEIS_ALERTA,
  TIPOS_ALERTA,
  type AlertaComTipo,
  type DadosExportados,
  type EstacaoResumoComStatus,
  type PerfilCompleto,
  type PontoApoioReal,
  type PrevisaoResposta,
  type ResultadoRua,
} from './index';

/**
 * Estes testes garantem duas coisas: (1) o frontend consegue importar os tipos de '@aquascan/shared'
 * (o `./index` é a porta de entrada do pacote); (2) os valores fixos dos contratos não mudam sem querer.
 * As fixtures abaixo são tipadas: se um contrato mudar, o `pnpm typecheck` acusa aqui primeiro.
 */
describe('valores fixos dos contratos', () => {
  it('nível de alerta tem duas opções, de propósito (contexto-e-decisoes, seção 5)', () => {
    expect(NIVEIS_ALERTA).toEqual(['ATENCAO_E_CRITICO', 'SO_CRITICO']);
  });

  it('tipo de alerta, condição do tempo e confiança do apoio', () => {
    expect(TIPOS_ALERTA).toEqual(['PIORA', 'ALIVIO']);
    expect(CONDICOES_TEMPO).toEqual([
      'ENSOLARADO',
      'NUBLADO',
      'CHUVOSO',
      'INSTAVEL',
      'TEMPESTUOSO',
    ]);
    expect(CONFIANCAS_APOIO).toEqual(['ALTA', 'MEDIA']);
  });
});

describe('fixtures tipadas com os contratos', () => {
  it('C1: estação sem dados nunca tem idade inventada', () => {
    const estacao: EstacaoResumoComStatus = {
      id: 4,
      nome: 'Bingen 04',
      rio: 'Rio Piabanha',
      latitude: -22.5,
      longitude: -43.2,
      ultimaLeitura: null,
      semDados: true,
      idadeLeituraMin: null,
    };
    expect(estacao.semDados).toBe(true);
    expect(estacao.idadeLeituraMin).toBeNull();
  });

  it('C2 e C3: perfil, exportação e alerta de alívio', () => {
    const perfil: PerfilCompleto = {
      id: 1,
      nome: 'Maria',
      email: 'maria@exemplo.com',
      consentimentoEm: '2026-10-20T12:00:00.000Z',
      criadoEm: '2026-10-20T12:00:00.000Z',
      cidade: { id: 1, nome: 'Petrópolis', uf: 'RJ', latitude: -22.505, longitude: -43.17861 },
      nivelAlerta: 'ATENCAO_E_CRITICO',
      estacoesSeguidas: [1],
    };
    const exportacao: DadosExportados = {
      exportadoEm: '2026-10-20T12:00:00.000Z',
      perfil: {
        nome: perfil.nome,
        email: perfil.email,
        consentimentoEm: perfil.consentimentoEm,
        criadoEm: perfil.criadoEm,
        cidade: { nome: 'Petrópolis', uf: 'RJ' },
        nivelAlerta: perfil.nivelAlerta,
      },
      estacoesSeguidas: [{ id: 1, nome: 'Piabanha 01 · Centro' }],
      dispositivosPush: 1,
    };
    const alivio: AlertaComTipo = {
      id: 9,
      estacaoId: 1,
      estacao: 'Piabanha 01 · Centro',
      estadoAnterior: 'CRITICO',
      estadoNovo: 'ATENCAO',
      criadoEm: '2026-10-20T12:00:00.000Z',
      tipo: 'ALIVIO',
      rio: 'Rio Piabanha',
    };
    // A exportação nunca carrega segredo de sessão, de senha ou de push.
    expect(JSON.stringify(exportacao)).not.toMatch(/senha|hash|token/i);
    expect(alivio.tipo).toBe('ALIVIO');
    expect(alivio.rio).toBe('Rio Piabanha');
  });

  it('C4: a previsão passa a ser um objeto com `atual` e `dias` (no lugar do array)', () => {
    const previsao: PrevisaoResposta = {
      atual: { temperaturaC: 22, sensacaoC: 23, condicao: 'CHUVOSO' },
      dias: [
        {
          data: '2026-10-30',
          chuvaMm: 12.5,
          probabilidadeChuvaPct: 80,
          temperaturaMinC: 17,
          temperaturaMaxC: 25,
          risco: 'MODERADO',
          condicao: 'CHUVOSO',
        },
      ],
    };
    expect(Array.isArray(previsao)).toBe(false);
    expect(previsao.dias).toHaveLength(1);
  });

  it('C5: capacidade e contato desconhecidos ficam null, não são chutados', () => {
    const apoio: PontoApoioReal = {
      id: 1,
      nome: 'Ginásio de exemplo',
      endereco: 'Rua de exemplo, 1',
      bairro: null,
      capacidade: null,
      contato: null,
      confianca: 'MEDIA',
      latitude: -22.5,
      longitude: -43.17,
    };
    expect(apoio.capacidade).toBeNull();
    expect(apoio.contato).toBeNull();
  });

  it('C6: rua sem estação ao alcance', () => {
    const rua: ResultadoRua = {
      id: 1,
      nome: 'Rua do Imperador',
      bairro: null,
      latitude: -22.5,
      longitude: -43.17,
      estacao: null,
      distanciaEstacaoM: null,
    };
    expect(rua.estacao).toBeNull();
  });
});
