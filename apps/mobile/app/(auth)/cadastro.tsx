import { cadastroEntradaSchema } from '@acquascan/shared';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { Campo } from '@/components/Campo';
import { api } from '@/services/api';
import { cores, espaco, fonte } from '@/theme';

type Erros = Partial<
  Record<'nome' | 'email' | 'telefone' | 'cep' | 'senha' | 'consentimento', string>
>;

/**
 * Cadastro (RF01). A validação usa o mesmo esquema da API (@acquascan/shared).
 * Enquanto a API não implementa o cadastro, ela responde 501 e a mensagem aparece aqui.
 */
export default function TelaCadastro() {
  const [dados, setDados] = useState({ nome: '', email: '', telefone: '', cep: '', senha: '' });
  const [consentimento, setConsentimento] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);

  const alterar = (campo: keyof typeof dados) => (valor: string) =>
    setDados((atual) => ({ ...atual, [campo]: valor }));

  async function criarConta() {
    const resultado = cadastroEntradaSchema.safeParse({
      ...dados,
      telefone: dados.telefone.replace(/\D/g, ''),
      cep: dados.cep.replace(/\D/g, ''),
      consentimento,
    });

    if (!resultado.success) {
      const novos: Erros = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as keyof Erros;
        novos[campo] ??= issue.message;
      }
      setErros(novos);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await api.cadastrar(resultado.data);
    } catch (erro) {
      Alert.alert('Cadastro', (erro as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Campo
        rotulo="Nome"
        value={dados.nome}
        onChangeText={alterar('nome')}
        autoComplete="name"
        erro={erros.nome}
      />
      <Campo
        rotulo="E-mail"
        value={dados.email}
        onChangeText={alterar('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        erro={erros.email}
      />
      <Campo
        rotulo="Celular com DDD"
        value={dados.telefone}
        onChangeText={alterar('telefone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        erro={erros.telefone}
      />
      <Campo
        rotulo="CEP"
        value={dados.cep}
        onChangeText={alterar('cep')}
        keyboardType="number-pad"
        autoComplete="postal-code"
        erro={erros.cep}
      />
      <Campo
        rotulo="Senha"
        value={dados.senha}
        onChangeText={alterar('senha')}
        secureTextEntry
        autoComplete="new-password"
        erro={erros.senha}
      />

      <View style={styles.consentimento}>
        <Switch
          value={consentimento}
          onValueChange={setConsentimento}
          trackColor={{ true: cores.azul }}
          accessibilityLabel="Aceito o uso dos meus dados"
        />
        <Text style={styles.consentimentoTexto}>
          Aceito que o AcquaScan use meu CEP para enviar alertas da minha região e meus dados de
          contato apenas para avisos de segurança. Posso excluir minha conta a qualquer momento.
        </Text>
      </View>
      {erros.consentimento && <Text style={styles.erro}>{erros.consentimento}</Text>}

      <Botao rotulo="Criar conta" onPress={criarConta} carregando={enviando} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: espaco.lg, gap: espaco.md },
  consentimento: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start' },
  consentimentoTexto: { flex: 1, fontSize: fonte.pequena, color: cores.textoSecundario },
  erro: { fontSize: fonte.pequena, color: '#B3261E' },
});
