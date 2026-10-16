import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { ProvedorSessao, useSessao } from '@/contexts/Sessao';
import { cores } from '@/theme';

export default function LayoutRaiz() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 2 } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorSessao>
        <StatusBar style="dark" />
        <Navegacao />
      </ProvedorSessao>
    </QueryClientProvider>
  );
}

/**
 * Portão de navegação (Stack.Protected): cada estado da sessão só enxerga as telas que lhe cabem.
 * - carregando: só o index, que mostra a tela de carregamento;
 * - novo: boas-vindas, login e cadastro;
 * - visitante: abas, estação, login e cadastro (o mapa, a previsão e o apoio são abertos);
 * - logado: abas e estação.
 */
function Navegacao() {
  const { estado, aviso, limparAviso } = useSessao();

  useEffect(() => {
    if (aviso) Alert.alert('Aviso', aviso, [{ text: 'OK' }], { onDismiss: limparAviso });
  }, [aviso, limparAviso]);

  const pronto = estado !== 'carregando';
  const entrou = estado === 'logado' || estado === 'visitante';

  return (
    <Stack
      screenOptions={{
        headerTintColor: cores.azul,
        headerTitleStyle: { color: cores.azulEscuro },
        contentStyle: { backgroundColor: cores.branco },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={entrou}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="estacao/[id]" options={{ title: 'Estação' }} />
      </Stack.Protected>
      <Stack.Protected guard={pronto && estado !== 'logado'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
