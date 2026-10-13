import { Stack } from 'expo-router';
import { cores } from '@/theme';

export default function LayoutAuth() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: cores.azul,
        headerTitleStyle: { color: cores.azulEscuro },
        contentStyle: { backgroundColor: cores.branco },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Entrar' }} />
      <Stack.Screen name="cadastro" options={{ title: 'Criar conta' }} />
    </Stack>
  );
}
