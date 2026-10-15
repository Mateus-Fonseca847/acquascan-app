import { describe, expect, it } from 'vitest';
import {
  ROTULO_ESTADO,
  avaliarLeitura,
  calcularNivelCm,
  calcularNivelPct,
  classificarEstado,
  estadoPiorou,
  estimarMinutosAteTransbordar,
  lpmParaLps,
  type ConfigEstacao,
} from './estado';

const config: ConfigEstacao = {
  alturaInstalacaoCm: 400,
  nivelTransbordamentoCm: 300,
  limiteAtencaoPct: 50,
  limiteCriticoPct: 80,
};

describe('calcularNivelCm', () => {
  it('subtrai a distância medida da altura de instalação', () => {
    expect(calcularNivelCm(250, 400)).toBe(150);
  });

  it('nunca retorna nível negativo (leitura maior que a altura)', () => {
    expect(calcularNivelCm(450, 400)).toBe(0);
  });
});

describe('calcularNivelPct', () => {
  it('calcula o percentual com uma casa decimal', () => {
    expect(calcularNivelPct(100, 300)).toBe(33.3);
  });

  it('passa de 100% quando o rio transbordou', () => {
    expect(calcularNivelPct(330, 300)).toBe(110);
  });

  it('recusa nível de transbordamento zero', () => {
    expect(() => calcularNivelPct(10, 0)).toThrow();
  });
});

describe('classificarEstado', () => {
  it.each([
    [0, 'ESTAVEL'],
    [49.9, 'ESTAVEL'],
    [50, 'ATENCAO'],
    [79.9, 'ATENCAO'],
    [80, 'CRITICO'],
    [120, 'CRITICO'],
  ] as const)('%s%% → %s', (pct, esperado) => {
    expect(classificarEstado(pct, config)).toBe(esperado);
  });
});

describe('avaliarLeitura', () => {
  it('vai da distância medida até o estado', () => {
    // 400 - 130 = 270 cm → 90% de 300 cm → crítico
    expect(avaliarLeitura(130, config)).toEqual({ nivelCm: 270, nivelPct: 90, estado: 'CRITICO' });
  });
});

describe('estadoPiorou', () => {
  it('detecta piora', () => {
    expect(estadoPiorou('ESTAVEL', 'ATENCAO')).toBe(true);
    expect(estadoPiorou('ATENCAO', 'CRITICO')).toBe(true);
  });

  it('ignora melhora ou estado igual', () => {
    expect(estadoPiorou('CRITICO', 'ATENCAO')).toBe(false);
    expect(estadoPiorou('ATENCAO', 'ATENCAO')).toBe(false);
  });
});

describe('estimarMinutosAteTransbordar', () => {
  const em = (min: number) => new Date(Date.UTC(2026, 9, 7, 12, min));

  it('extrapola a velocidade de subida', () => {
    // sobe 10 cm em 10 min (1 cm/min); faltam 60 cm → 60 min
    const leituras = [
      { nivelCm: 230, medidoEm: em(0) },
      { nivelCm: 240, medidoEm: em(10) },
    ];
    expect(estimarMinutosAteTransbordar(leituras, 300)).toBe(60);
  });

  it('aceita leituras fora de ordem', () => {
    const leituras = [
      { nivelCm: 240, medidoEm: em(10) },
      { nivelCm: 230, medidoEm: em(0) },
    ];
    expect(estimarMinutosAteTransbordar(leituras, 300)).toBe(60);
  });

  it('retorna null quando o rio está estável ou descendo', () => {
    const leituras = [
      { nivelCm: 240, medidoEm: em(0) },
      { nivelCm: 235, medidoEm: em(10) },
    ];
    expect(estimarMinutosAteTransbordar(leituras, 300)).toBeNull();
  });

  it('retorna 0 quando já transbordou', () => {
    const leituras = [
      { nivelCm: 290, medidoEm: em(0) },
      { nivelCm: 305, medidoEm: em(5) },
    ];
    expect(estimarMinutosAteTransbordar(leituras, 300)).toBe(0);
  });

  it('retorna null com menos de duas leituras', () => {
    expect(estimarMinutosAteTransbordar([{ nivelCm: 100, medidoEm: em(0) }], 300)).toBeNull();
  });
});

describe('lpmParaLps', () => {
  it('converte L/min para L/s', () => {
    expect(lpmParaLps(9.73)).toBe(0.16);
  });
});

describe('ROTULO_ESTADO', () => {
  it('tem um nome em português para cada estado', () => {
    expect(ROTULO_ESTADO).toEqual({ ESTAVEL: 'Estável', ATENCAO: 'Atenção', CRITICO: 'Crítico' });
  });
});
