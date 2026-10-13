import { loginEntradaSchema } from '@acquascan/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Botao } from '@/components/Botao';
import { Campo } from '@/components/Campo';
import { espaco } from '@/theme';

/** TODO(v0.2.0): chamar POST /auth/login e guardar o token com expo-secure-store. */
export default function TelaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();

  function entrar() {
    const resultado = loginEntradaSchema.safeParse({ email, senha });
    if (!resultado.success) {
      setErro('Confira o e-mail e a senha.');
      return;
    }
    setErro(undefined);
    Alert.alert('Em construção', 'O login chega na versão 0.2.0 do app.');
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
        erro={erro}
      />
      <Campo
        rotulo="Senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoComplete="password"
      />
      <Botao rotulo="Entrar" onPress={entrar} />
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
});
