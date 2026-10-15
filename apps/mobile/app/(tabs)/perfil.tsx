import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { cores, espaco, fonte } from '@/theme';

/**
 * TODO(v0.2.0): mostrar os dados do usuário logado, preferências de alerta,
 * botão "Sair" e "Excluir minha conta" (LGPD).
 */
export default function TelaPerfil() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Receba alertas do rio perto de você</Text>
      <Text style={styles.texto}>
        Crie uma conta com a sua cidade para ser avisado quando o rio da sua região subir.
      </Text>
      <Botao rotulo="Entrar" onPress={() => router.push('/login')} />
      <Botao rotulo="Criar conta" variante="secundario" onPress={() => router.push('/cadastro')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: espaco.lg, gap: espaco.md, justifyContent: 'center' },
  titulo: { fontSize: fonte.titulo, fontWeight: '800', color: cores.azulEscuro },
  texto: { fontSize: fonte.normal, color: cores.textoSecundario, marginBottom: espaco.sm },
});
