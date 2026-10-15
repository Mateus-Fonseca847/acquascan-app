import { cadastroEntradaSchema } from '@acquascan/shared';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { Campo } from '@/components/Campo';
import { SeletorCidade } from '@/components/SeletorCidade';
import { cores, espaco, fonte } from '@/theme';

type Erros = Partial<Record<'nome' | 'email' | 'cidadeId' | 'senha' | 'consentimento', string>>;

/**
 * Cadastro (RF01): nome, e-mail, senha e cidade (lista de GET /cidades).
 * A validação usa o mesmo esquema da API (@acquascan/shared).
 * Por enquanto a tela só valida: ela ainda não chama POST /auth/cadastro (a integração vem depois).
 */
export default function TelaCadastro() {
  const [dados, setDados] = useState({ nome: '', email: '', senha: '' });
  const [cidadeId, setCidadeId] = useState<number | null>(null);
  const [consentimento, setConsentimento] = useState(false);
  const [erros, setErros] = useState<Erros>({});

  const alterar = (campo: keyof typeof dados) => (valor: string) =>
    setDados((atual) => ({ ...atual, [campo]: valor }));

  function criarConta() {
    const resultado = cadastroEntradaSchema.safeParse({
      ...dados,
      cidadeId,
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
    // TODO: enviar com api.cadastrar(resultado.data) quando a integração for ligada.
    Alert.alert('Cadastro', 'Os dados estão corretos. O envio do cadastro será ligado em breve.');
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
      <SeletorCidade valor={cidadeId} onChange={setCidadeId} erro={erros.cidadeId} />
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
          Aceito que o AcquaScan use a minha cidade para enviar alertas da minha região e meus dados
          de contato apenas para avisos de segurança. Posso excluir minha conta a qualquer momento.
        </Text>
      </View>
      {erros.consentimento && <Text style={styles.erro}>{erros.consentimento}</Text>}

      <Botao rotulo="Criar conta" onPress={criarConta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: espaco.lg, gap: espaco.md },
  consentimento: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start' },
  consentimentoTexto: { flex: 1, fontSize: fonte.normal, color: cores.textoSecundario },
  erro: { fontSize: fonte.normal, color: '#B3261E' },
});
