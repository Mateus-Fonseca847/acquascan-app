import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { ALVO_TOQUE, cores, espaco, fonte, raio } from '@/theme';

interface Props extends TextInputProps {
  rotulo: string;
  erro?: string;
}

export function Campo({ rotulo, erro, ...props }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        style={[styles.input, erro && styles.inputErro]}
        placeholderTextColor={cores.textoSecundario}
        accessibilityLabel={rotulo}
        {...props}
      />
      {erro && <Text style={styles.erro}>{erro}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: espaco.xs },
  rotulo: { fontSize: fonte.normal, fontWeight: '600', color: cores.azulEscuro },
  input: {
    minHeight: ALVO_TOQUE + 4,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingHorizontal: espaco.md,
    fontSize: fonte.normal,
    color: cores.azulEscuro,
    backgroundColor: cores.branco,
  },
  inputErro: { borderColor: '#B3261E', borderWidth: 1.5 },
  erro: { fontSize: fonte.pequena, color: '#B3261E' },
});
