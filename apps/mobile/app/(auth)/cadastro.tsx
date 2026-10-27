import { cadastroEntradaSchema } from '@acquascan/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { Campo } from '@/components/Campo';
import { SeletorCidade } from '@/components/SeletorCidade';
import { useSessao } from '@/contexts/Sessao';
import { ErroApi } from '@/services/api';
import { cores, espaco, fonte } from '@/theme';

type Erros = Partial<Record<'nome' | 'email' | 'cidadeId' | 'senha' | 'consentimento', string>>;

/**
 * Cadastro (RF01): nome, e-mail, senha e cidade (lista de GET /cidades).
 * A validação usa o mesmo esquema da API (@acquascan/shared).
 * Depois de validar, `criarContaEEntrar` cadastra (POST /auth/cadastro) e já entra na conta.
 */
export default function TelaCadastro() {
  const { criarContaEEntrar } = useSessao();
  const [dados, setDados] = useState({ nome: '', email: '', senha: '' });
  const [cidadeId, setCidadeId] = useState<number | null>(null);
  const [consentimento, setConsentimento] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [erroEnvio, setErroEnvio] = useState<string>();
  const [semConexao, setSemConexao] = useState(false);
  const [emailDuplicado, setEmailDuplicado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const alterar = (campo: keyof typeof dados) => (valor: string) =>
    setDados((atual) => ({ ...atual, [campo]: valor }));

  async function criarConta() {
    if (enviando) return;
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
    setErroEnvio(undefined);
    setSemConexao(false);
    setEmailDuplicado(false);
    setEnviando(true);
    try {
      const entrou = await criarContaEEntrar(resultado.data);
      // Conta criada, mas o login seguinte falhou: o provedor avisa e levamos ao login.
      router.replace(entrou ? '/mapa' : '/login');
    } catch (e) {
      const erroApi = e instanceof ErroApi ? e : null;
      setSemConexao(erroApi?.status === 0);
      setEmailDuplicado(erroApi?.status === 409);
      if (erroApi?.status === 409) {
        setErroEnvio('Este e-mail já tem cadastro. Tente entrar.');
      } else if (erroApi?.status === 400 && erroApi.mensagem === 'Cidade inválida') {
        setErroEnvio('Escolha uma cidade da lista.');
      } else {
        setErroEnvio(erroApi?.mensagem ?? 'Não foi possível criar a conta. Tente de novo.');
      }
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
          Aceito que o AquaScan use a minha cidade para enviar alertas da minha região e meus dados
          de contato apenas para avisos de segurança. Posso excluir minha conta a qualquer momento.
        </Text>
      </View>
      {erros.consentimento && <Text style={styles.erro}>{erros.consentimento}</Text>}

      {erroEnvio && (
        <Text style={styles.erro} accessibilityLiveRegion="polite">
          ⚠ {erroEnvio}
        </Text>
      )}
      <Botao
        rotulo={semConexao ? 'Tentar de novo' : 'Criar conta'}
        onPress={criarConta}
        carregando={enviando}
      />
      {emailDuplicado && (
        <Botao rotulo="Entrar" variante="secundario" onPress={() => router.replace('/login')} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: espaco.lg, gap: espaco.md },
  consentimento: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start' },
  consentimentoTexto: { flex: 1, fontSize: fonte.normal, color: cores.textoSecundario },
  erro: { fontSize: fonte.normal, color: '#B3261E' },
});
