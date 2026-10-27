import type { Estado } from '@aquascan/shared';
import { StyleSheet, Text, View } from 'react-native';
import { aparenciaEstado, aparenciaSemDados, cores, espaco, fonte, raio } from '@/theme';

interface Props {
  estado: Estado | null;
}

/** Cor + ícone + texto: legível também para pessoas com daltonismo. */
export function BadgeEstado({ estado }: Props) {
  const aparencia = estado ? aparenciaEstado[estado] : aparenciaSemDados;
  return (
    <View
      style={[styles.badge, { backgroundColor: aparencia.cor }]}
      accessibilityLabel={`Estado: ${aparencia.rotulo}`}
    >
      <Text style={styles.texto}>
        {aparencia.icone} {aparencia.rotulo}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: espaco.sm + 2,
    paddingVertical: espaco.xs,
    borderRadius: raio.sm,
  },
  texto: { color: cores.branco, fontSize: fonte.pequena, fontWeight: '700' },
});
