import { describe, expect, it } from 'vitest';
import { avaliarCaminhavel, caminhavel, sentidoUnicoAPe } from './caminhavel';

describe('caminhavel: o que entra', () => {
  it.each([
    'footway',
    'path',
    'pedestrian',
    'steps',
    'residential',
    'living_street',
    'service',
    'unclassified',
    'tertiary',
    'tertiary_link',
    'secondary',
    'secondary_link',
    'primary',
    'primary_link',
    'track',
    'cycleway',
    'corridor',
  ])('inclui highway=%s', (highway) => {
    expect(caminhavel({ highway })).toBe(true);
  });

  it('ignora oneway: pedestre anda nos dois sentidos', () => {
    expect(caminhavel({ highway: 'residential', oneway: 'yes' })).toBe(true);
  });

  it('access diferente de no/private não bloqueia (customers, delivery, permissive)', () => {
    for (const access of ['customers', 'delivery', 'permissive', 'yes', 'destination']) {
      expect(caminhavel({ highway: 'service', access })).toBe(true);
    }
  });
});

describe('caminhavel: o que sai', () => {
  it.each([
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'construction',
    'proposed',
    'raceway',
  ])('exclui highway=%s', (highway) => {
    expect(caminhavel({ highway })).toBe(false);
  });

  it('a classe excluída vale mesmo com foot=yes', () => {
    expect(caminhavel({ highway: 'trunk', foot: 'yes' })).toBe(false);
  });

  it('exclui classes que não estão na lista (bridleway, platform, bus_guideway)', () => {
    for (const highway of ['bridleway', 'platform', 'bus_guideway', 'road']) {
      expect(caminhavel({ highway })).toBe(false);
    }
  });

  it('exclui way sem highway ou sem tags', () => {
    expect(caminhavel({ waterway: 'river' })).toBe(false);
    expect(caminhavel(undefined)).toBe(false);
    expect(caminhavel({})).toBe(false);
  });

  it('exclui foot=no', () => {
    expect(caminhavel({ highway: 'footway', foot: 'no' })).toBe(false);
  });

  it('exclui access=no e access=private', () => {
    expect(caminhavel({ highway: 'residential', access: 'no' })).toBe(false);
    expect(caminhavel({ highway: 'residential', access: 'private' })).toBe(false);
  });

  it('exclui area=yes', () => {
    expect(caminhavel({ highway: 'pedestrian', area: 'yes' })).toBe(false);
  });
});

describe('caminhavel: foot sobrepõe access', () => {
  it.each(['yes', 'designated', 'permissive'])(
    'access=private com foot=%s é caminhável',
    (foot) => {
      expect(caminhavel({ highway: 'service', access: 'private', foot })).toBe(true);
      expect(caminhavel({ highway: 'service', access: 'no', foot })).toBe(true);
    },
  );

  it('foot=no vence tudo', () => {
    expect(caminhavel({ highway: 'footway', access: 'yes', foot: 'no' })).toBe(false);
  });

  it('area=yes continua excluindo mesmo com foot=yes', () => {
    expect(caminhavel({ highway: 'pedestrian', area: 'yes', foot: 'yes' })).toBe(false);
  });

  it('informa qual regra decidiu', () => {
    expect(avaliarCaminhavel({ highway: 'service', access: 'private' }).motivo).toBe(
      'access=private',
    );
    expect(avaliarCaminhavel({ highway: 'service', access: 'private', foot: 'yes' }).motivo).toBe(
      'foot=yes',
    );
  });
});

describe('sentidoUnicoAPe', () => {
  it('só há sentido único com oneway:foot', () => {
    expect(sentidoUnicoAPe({ highway: 'footway', oneway: 'yes' })).toBeNull();
    expect(sentidoUnicoAPe({ highway: 'footway', 'oneway:foot': 'yes' })).toBe('frente');
    expect(sentidoUnicoAPe({ highway: 'footway', 'oneway:foot': '-1' })).toBe('tras');
    expect(sentidoUnicoAPe({ highway: 'footway', 'oneway:foot': 'no' })).toBeNull();
    expect(sentidoUnicoAPe(undefined)).toBeNull();
  });
});
