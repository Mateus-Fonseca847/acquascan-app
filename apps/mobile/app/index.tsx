import { Redirect } from 'expo-router';
import { Mensagem } from '@/components/Mensagem';
import { useSessao } from '@/contexts/Sessao';

/** Porta de entrada do app: decide o destino pelo estado da sessão. */
export default function Inicio() {
  const { estado } = useSessao();

  if (estado === 'carregando') return <Mensagem carregando titulo="Carregando…" />;
  if (estado === 'novo') return <Redirect href="/boas-vindas" />;
  return <Redirect href="/mapa" />;
}
