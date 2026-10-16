import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { Mensagem } from '@/components/Mensagem';
import { useSessao } from '@/contexts/Sessao';
import { cores, espaco, fonte } from '@/theme';

/**
 * Perfil: dados de quem está logado e botão de sair; para o visitante, convite para entrar.
 * TODO: preferências de alerta e "Excluir minha conta" (LGPD).
 */
export default function TelaPerfil() {
  const { estado, usuario, sair, recarregarPerfil } = useSessao();
  const [saindo, setSaindo] = useState(false);

  function confirmarSaida() {
    Alert.alert('Sair da conta', 'Você vai precisar entrar de novo para ver seus dados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setSaindo(true);
          await sair();
          setSaindo(false);
        },
      },
    ]);
  }

  if (estado === 'logado') {
    if (!usuario) {
      return (
        <Mensagem
          titulo="Não foi possível carregar seus dados"
          texto="Verifique sua internet e tente de novo."
          acao={{ rotulo: 'Tentar de novo', onPress: () => void recarregarPerfil() }}
        />
      );
    }
    return (
      <View style={styles.container}>
        <Text style={styles.titulo}>{usuario.nome}</Text>
        <Text style={styles.texto}>E-mail: {usuario.email}</Text>
        <Text style={styles.texto}>
          Cidade: {usuario.cidade.nome} - {usuario.cidade.uf}
        </Text>
        <Botao
          rotulo="Sair da conta"
          variante="secundario"
          carregando={saindo}
          onPress={confirmarSaida}
        />
      </View>
    );
  }

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
