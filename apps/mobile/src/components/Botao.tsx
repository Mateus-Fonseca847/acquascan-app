import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { ALVO_TOQUE, cores, espaco, fonte, raio } from '@/theme';

interface Props {
  rotulo: string;
  onPress: () => void;
  variante?: 'principal' | 'secundario';
  carregando?: boolean;
}

export function Botao({ rotulo, onPress, variante = 'principal', carregando }: Props) {
  const principal = variante === 'principal';
  return (
    <Pressable
      onPress={onPress}
      disabled={carregando}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        principal ? styles.principal : styles.secundario,
        pressed && { opacity: 0.8 },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={principal ? cores.branco : cores.azul} />
      ) : (
        <Text style={[styles.texto, { color: principal ? cores.branco : cores.azul }]}>
          {rotulo}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: ALVO_TOQUE + 4,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaco.md,
  },
  principal: { backgroundColor: cores.azul },
  secundario: { backgroundColor: cores.branco, borderWidth: 1.5, borderColor: cores.azul },
  texto: { fontSize: fonte.normal, fontWeight: '700' },
});
