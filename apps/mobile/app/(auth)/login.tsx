import { loginEntradaSchema } from '@aquascan/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Botao } from '@/components/Botao';
import { Campo } from '@/components/Campo';
import { useSessao } from '@/contexts/Sessao';
import { ErroApi } from '@/services/api';
import { espaco, fonte } from '@/theme';

/** Login (RF02): a sessão é criada pelo provedor (`useSessao().entrar`). */
export default function TelaLogin() {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [semConexao, setSemConexao] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (enviando) return;
    const resultado = loginEntradaSchema.safeParse({ email: email.trim(), senha });
    if (!resultado.success) {
      setSemConexao(false);
      setErro('Confira o e-mail e a senha.');
      return;
    }
    setErro(undefined);
    setSemConexao(false);
    setEnviando(true);
    try {
      await entrar(resultado.data.email, resultado.data.senha);
      router.replace('/mapa');
    } catch (e) {
      const erroApi = e instanceof ErroApi ? e : null;
      setSemConexao(erroApi?.status === 0);
      setErro(
        erroApi?.status === 401
          ? 'E-mail ou senha incorretos'
          : (erroApi?.mensagem ?? 'Não foi possível entrar. Tente de novo.'),
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Campo
        rotulo="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Campo
        rotulo="Senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoComplete="password"
      />
      {erro && (
        <Text style={styles.erro} accessibilityLiveRegion="polite">
          ⚠ {erro}
        </Text>
      )}
      <Botao
        rotulo={semConexao ? 'Tentar de novo' : 'Entrar'}
        onPress={enviar}
        carregando={enviando}
      />
      <Botao
        rotulo="Criar conta"
        variante="secundario"
        onPress={() => router.replace('/cadastro')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: espaco.lg, gap: espaco.md },
  erro: { fontSize: fonte.normal, color: '#B3261E' },
});
