import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCidades } from '@/hooks/consultas';
import { ALVO_TOQUE, cores, espaco, fonte, raio } from '@/theme';

interface Props {
  valor: number | null;
  onChange: (cidadeId: number) => void;
  erro?: string;
}

/**
 * Escolha da cidade, com a lista de GET /cidades.
 * Acessibilidade: cada opção tem 44 px de altura, leitor de tela anuncia "selecionada"
 * e a escolha aparece por marca (✓) e texto em negrito, não só pela cor.
 */
export function SeletorCidade({ valor, onChange, erro }: Props) {
  const { data, isLoading, isError, refetch, isRefetching } = useCidades();

  return (
    <View style={styles.container}>
      <Text style={styles.rotulo}>Cidade</Text>

      {isLoading && (
        <View style={styles.estado} accessibilityLiveRegion="polite">
          <ActivityIndicator color={cores.azul} />
          <Text style={styles.texto}>Carregando as cidades…</Text>
        </View>
      )}

      {isError && (
        <View style={styles.estado} accessibilityLiveRegion="polite">
          <Text style={styles.erro}>Não foi possível carregar as cidades</Text>
          <Pressable
            style={styles.tentar}
            onPress={() => refetch()}
            disabled={isRefetching}
            accessibilityRole="button"
          >
            <Text style={styles.tentarTexto}>{isRefetching ? 'Tentando…' : 'Tentar de novo'}</Text>
          </Pressable>
        </View>
      )}

      {data?.length === 0 && (
        <Text style={styles.texto}>Nenhuma cidade disponível no momento.</Text>
      )}

      {data?.map((cidade) => {
        const selecionada = cidade.id === valor;
        return (
          <Pressable
            key={cidade.id}
            onPress={() => onChange(cidade.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selecionada }}
            accessibilityLabel={`${cidade.nome}, ${cidade.uf}`}
            style={[styles.opcao, selecionada && styles.opcaoSelecionada]}
          >
            <Text style={styles.marca}>{selecionada ? '✓' : ''}</Text>
            <Text style={[styles.opcaoTexto, selecionada && styles.opcaoTextoSelecionada]}>
              {cidade.nome} - {cidade.uf}
            </Text>
          </Pressable>
        );
      })}

      {erro && <Text style={styles.erro}>{erro}</Text>}
    </View>
  );
}

const ERRO = '#B3261E';

const styles = StyleSheet.create({
  container: { gap: espaco.xs },
  rotulo: { fontSize: fonte.normal, fontWeight: '600', color: cores.azulEscuro },
  estado: { gap: espaco.sm, alignItems: 'flex-start' },
  texto: { fontSize: fonte.normal, color: cores.textoSecundario },
  erro: { fontSize: fonte.normal, color: ERRO },
  tentar: {
    minHeight: ALVO_TOQUE,
    paddingHorizontal: espaco.lg,
    justifyContent: 'center',
    borderRadius: raio.sm,
    borderWidth: 1.5,
    borderColor: cores.azul,
    backgroundColor: cores.branco,
  },
  tentarTexto: { fontSize: fonte.normal, fontWeight: '700', color: cores.azul },
  opcao: {
    minHeight: ALVO_TOQUE + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingHorizontal: espaco.md,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    backgroundColor: cores.branco,
  },
  opcaoSelecionada: { borderColor: cores.azul, borderWidth: 2, backgroundColor: cores.azulClaro },
  marca: { width: 20, fontSize: fonte.media, fontWeight: '700', color: cores.azul },
  opcaoTexto: { fontSize: fonte.normal, color: cores.azulEscuro },
  opcaoTextoSelecionada: { fontWeight: '700' },
});
