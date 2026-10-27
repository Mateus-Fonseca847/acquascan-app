/**
 * Guarda da sessão no armazenamento seguro do aparelho (Keychain no iOS, Keystore no Android).
 * Nenhum erro do SecureStore derruba o app: leitura que falha vale como "sem sessão".
 * Nada aqui escreve token, e-mail ou senha em log.
 */
import type { Perfil } from '@aquascan/shared';
import * as SecureStore from 'expo-secure-store';
import { ehPerfil } from './regras';

const CHAVE_TOKEN = 'aquascan.token';
const CHAVE_BOAS_VINDAS = 'aquascan.boas-vindas-vistas';
const CHAVE_PERFIL = 'aquascan.perfil';

async function ler(chave: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(chave);
  } catch {
    return null;
  }
}

async function gravar(chave: string, valor: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(chave, valor);
    return true;
  } catch {
    return false;
  }
}

async function apagar(chave: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(chave);
  } catch {
    // Sem armazenamento seguro, não há o que apagar.
  }
}

export const sessao = {
  lerToken: () => ler(CHAVE_TOKEN),
  /** Devolve false quando não foi possível guardar (a sessão vale só até fechar o app). */
  gravarToken: (token: string) => gravar(CHAVE_TOKEN, token),

  async lerPerfil(): Promise<Perfil | null> {
    const texto = await ler(CHAVE_PERFIL);
    if (!texto) return null;
    try {
      const valor: unknown = JSON.parse(texto);
      return ehPerfil(valor) ? valor : null;
    } catch {
      return null;
    }
  },
  gravarPerfil: (perfil: Perfil) => gravar(CHAVE_PERFIL, JSON.stringify(perfil)),

  async boasVindasVistas(): Promise<boolean> {
    return (await ler(CHAVE_BOAS_VINDAS)) === '1';
  },
  marcarBoasVindasVistas: () => gravar(CHAVE_BOAS_VINDAS, '1'),

  /** Sai da conta: apaga token e perfil em cache. */
  async apagarSessao(): Promise<void> {
    await Promise.all([apagar(CHAVE_TOKEN), apagar(CHAVE_PERFIL)]);
  },
  /** Depois de excluir a conta o app volta ao começo, então a flag também sai. */
  async apagarTudo(): Promise<void> {
    await Promise.all([apagar(CHAVE_TOKEN), apagar(CHAVE_PERFIL), apagar(CHAVE_BOAS_VINDAS)]);
  },
};
