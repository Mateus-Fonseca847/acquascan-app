import { Redirect } from 'expo-router';

/**
 * Porta de entrada do app.
 * TODO(v0.2.0): se o usuário não estiver logado, redirecionar para /login.
 */
export default function Inicio() {
  return <Redirect href="/mapa" />;
}
