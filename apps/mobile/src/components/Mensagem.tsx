import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ALVO_TOQUE, cores, espaco, fonte, raio } from '@/theme';

interface Props {
  titulo: string;
  texto?: string;
  carregando?: boolean;
  acao?: { rotulo: string; onPress: () => void };
}

/** Estados de carregamento, erro e lista vazia: sempre dizem o que fazer a seguir. */
export function Mensagem({ titulo, texto, carregando, acao }: Props) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {carregando && <ActivityIndicator size="large" color={cores.azul} />}
      <Text style={styles.titulo}>{titulo}</Text>
      {texto && <Text style={styles.texto}>{texto}</Text>}
      {acao && (
        <Pressable style={styles.botao} onPress={acao.onPress} accessibilityRole="button">
          <Text style={styles.botaoTexto}>{acao.rotulo}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.lg,
    gap: espaco.sm,
  },
  titulo: {
    fontSize: fonte.media,
    fontWeight: '700',
    color: cores.azulEscuro,
    textAlign: 'center',
  },
  texto: { fontSize: fonte.normal, color: cores.textoSecundario, textAlign: 'center' },
  botao: {
    marginTop: espaco.sm,
    minHeight: ALVO_TOQUE,
    paddingHorizontal: espaco.lg,
    justifyContent: 'center',
    backgroundColor: cores.azul,
    borderRadius: raio.sm,
  },
  botaoTexto: { color: cores.branco, fontSize: fonte.normal, fontWeight: '700' },
});
