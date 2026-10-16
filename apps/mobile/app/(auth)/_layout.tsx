import { Stack } from 'expo-router';
import { useSessao } from '@/contexts/Sessao';
import { cores } from '@/theme';

export default function LayoutAuth() {
  const { estado } = useSessao();

  return (
    <Stack
      screenOptions={{
        headerTintColor: cores.azul,
        headerTitleStyle: { color: cores.azulEscuro },
        contentStyle: { backgroundColor: cores.branco },
      }}
    >
      <Stack.Protected guard={estado === 'novo'}>
        <Stack.Screen name="boas-vindas" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="login" options={{ title: 'Entrar' }} />
      <Stack.Screen name="cadastro" options={{ title: 'Criar conta' }} />
    </Stack>
  );
}
