/**
 * Sessão do usuário: quem está logado, visitante ou nunca escolheu.
 * O token fica no armazenamento seguro (services/sessao.ts) e em memória (services/api.ts).
 * As regras de decisão são funções puras em services/regras.ts.
 */
import type { CadastroEntrada, Perfil } from '@aquascan/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, definirAoSessaoExpirar, definirToken } from '@/services/api';
import {
  AVISO_CONTA_CRIADA,
  AVISO_SESSAO_EXPIROU,
  ErroApi,
  decidirEstadoInicial,
  type EstadoSessao,
  type ResultadoPerfil,
} from '@/services/regras';
import { sessao } from '@/services/sessao';

interface ContextoSessao {
  estado: EstadoSessao;
  usuario: Perfil | null;
  /** Mensagem para mostrar uma vez (ex.: sessão expirada). */
  aviso: string | null;
  limparAviso: () => void;
  entrar: (email: string, senha: string) => Promise<void>;
  /** Devolve false quando a conta foi criada mas o login seguinte falhou. */
  criarContaEEntrar: (dados: CadastroEntrada) => Promise<boolean>;
  sair: () => Promise<void>;
  excluirConta: (senha: string) => Promise<void>;
  continuarSemConta: () => Promise<void>;
  /** Tenta de novo carregar o perfil (quando a abertura foi sem internet). */
  recarregarPerfil: () => Promise<void>;
}

const Contexto = createContext<ContextoSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [estado, setEstadoReact] = useState<EstadoSessao>('carregando');
  const [usuario, setUsuario] = useState<Perfil | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // O gancho de expiração é chamado fora do ciclo do React e precisa ver o estado atual.
  const estadoRef = useRef<EstadoSessao>('carregando');

  const mudarEstado = useCallback((novo: EstadoSessao) => {
    estadoRef.current = novo;
    setEstadoReact(novo);
  }, []);

  const expirar = useCallback(() => {
    // Só uma sessão ativa pode expirar (não a tentativa de login nem a abertura do app).
    if (estadoRef.current !== 'logado') return;
    definirToken(null);
    void sessao.apagarSessao();
    queryClient.clear();
    setUsuario(null);
    setAviso(AVISO_SESSAO_EXPIROU);
    mudarEstado('visitante');
  }, [mudarEstado, queryClient]);

  useEffect(() => {
    definirAoSessaoExpirar(expirar);
    return () => definirAoSessaoExpirar(null);
  }, [expirar]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [token, boasVindasVistas, usuarioEmCache] = await Promise.all([
        sessao.lerToken(),
        sessao.boasVindasVistas(),
        sessao.lerPerfil(),
      ]);

      let perfil: ResultadoPerfil | null = null;
      if (token) {
        definirToken(token);
        try {
          perfil = { ok: true, usuario: await api.perfil() };
        } catch (e) {
          perfil = { ok: false, status: e instanceof ErroApi ? e.status : 0 };
        }
      }
      if (!ativo) return;

      const decisao = decidirEstadoInicial({ token, boasVindasVistas, perfil, usuarioEmCache });
      if (decisao.apagarSessao) {
        definirToken(null);
        await sessao.apagarSessao();
      } else if (perfil?.ok) {
        void sessao.gravarPerfil(perfil.usuario);
      }
      if (!ativo) return;
      setUsuario(decisao.usuario);
      setAviso(decisao.aviso);
      mudarEstado(decisao.estado);
    })();
    return () => {
      ativo = false;
    };
  }, [mudarEstado]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const { token } = await api.entrar({ email, senha });
      definirToken(token);
      let perfil: Perfil;
      try {
        perfil = await api.perfil();
      } catch (e) {
        definirToken(null);
        throw e;
      }
      await sessao.gravarToken(token);
      await sessao.gravarPerfil(perfil);
      await sessao.marcarBoasVindasVistas();
      queryClient.clear();
      setUsuario(perfil);
      setAviso(null);
      mudarEstado('logado');
    },
    [mudarEstado, queryClient],
  );

  const criarContaEEntrar = useCallback(
    async (dados: CadastroEntrada) => {
      await api.cadastrar(dados);
      try {
        await entrar(dados.email, dados.senha);
        return true;
      } catch {
        setAviso(AVISO_CONTA_CRIADA);
        return false;
      }
    },
    [entrar],
  );

  const sair = useCallback(async () => {
    definirToken(null);
    await sessao.apagarSessao();
    queryClient.clear();
    setUsuario(null);
    mudarEstado('visitante');
  }, [mudarEstado, queryClient]);

  const excluirConta = useCallback(
    async (senha: string) => {
      await api.excluirConta(senha);
      definirToken(null);
      await sessao.apagarTudo();
      queryClient.clear();
      setUsuario(null);
      setAviso(null);
      mudarEstado('novo');
    },
    [mudarEstado, queryClient],
  );

  const continuarSemConta = useCallback(async () => {
    await sessao.marcarBoasVindasVistas();
    mudarEstado('visitante');
  }, [mudarEstado]);

  const recarregarPerfil = useCallback(async () => {
    try {
      const perfil = await api.perfil();
      void sessao.gravarPerfil(perfil);
      setUsuario(perfil);
    } catch {
      // Continua com o que já tem; 401 é tratado pelo gancho de expiração.
    }
  }, []);

  const limparAviso = useCallback(() => setAviso(null), []);

  const valor = useMemo(
    () => ({
      estado,
      usuario,
      aviso,
      limparAviso,
      entrar,
      criarContaEEntrar,
      sair,
      excluirConta,
      continuarSemConta,
      recarregarPerfil,
    }),
    [
      estado,
      usuario,
      aviso,
      limparAviso,
      entrar,
      criarContaEEntrar,
      sair,
      excluirConta,
      continuarSemConta,
      recarregarPerfil,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de ProvedorSessao');
  return contexto;
}
