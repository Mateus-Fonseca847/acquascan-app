import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { useSessao } from '@/contexts/Sessao';
import { cores, espaco, fonte } from '@/theme';

/** Primeira abertura do app. Só estrutura e texto: o visual final vem no redesenho. */
export default function TelaBoasVindas() {
  const { continuarSemConta } = useSessao();
  const [enviando, setEnviando] = useState(false);

  async function seguirSemConta() {
    if (enviando) return;
    setEnviando(true);
    await continuarSemConta();
    router.replace('/mapa');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mais informação. Mais tranquilidade.</Text>
      <Botao rotulo="Entrar na minha conta" onPress={() => router.push('/login')} />
      <Botao rotulo="Criar conta" variante="secundario" onPress={() => router.push('/cadastro')} />
      <Botao
        rotulo="Continuar sem conta"
        variante="secundario"
        carregando={enviando}
        onPress={seguirSemConta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: espaco.lg, gap: espaco.md, justifyContent: 'center' },
  titulo: {
    fontSize: fonte.titulo,
    fontWeight: '800',
    color: cores.azulEscuro,
    marginBottom: espaco.md,
  },
});
