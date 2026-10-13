import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { cores, fonte } from '@/theme';

type NomeIcone = ComponentProps<typeof Ionicons>['name'];

const icone =
  (nome: NomeIcone) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={nome} color={color} size={size} />
  );

export default function LayoutAbas() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.azul,
        tabBarInactiveTintColor: cores.textoSecundario,
        tabBarLabelStyle: { fontSize: fonte.pequena - 2, fontWeight: '600' },
        headerTitleStyle: { color: cores.azulEscuro },
      }}
    >
      <Tabs.Screen name="mapa" options={{ title: 'Rios', tabBarIcon: icone('water') }} />
      <Tabs.Screen name="previsao" options={{ title: 'Previsão', tabBarIcon: icone('rainy') }} />
      <Tabs.Screen name="apoio" options={{ title: 'Pontos de apoio', tabBarIcon: icone('home') }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: icone('person') }} />
    </Tabs>
  );
}
