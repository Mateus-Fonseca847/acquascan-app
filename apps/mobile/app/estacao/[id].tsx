import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { BadgeEstado } from '@/components/BadgeEstado';
import { Mensagem } from '@/components/Mensagem';
import { useEstacao, useLeituras } from '@/hooks/consultas';
import { aparenciaEstado, cores, espaco, fonte, raio } from '@/theme';
import { formatarHora, formatarPct } from '@/utils/formatar';

function textoEstimativa(minutos: number | null): string {
  if (minutos === null) return 'O rio não está subindo agora.';
  if (minutos === 0) return 'O rio atingiu o nível de transbordamento.';
  return `Se continuar subindo neste ritmo, pode transbordar em cerca de ${minutos} min. É uma estimativa: muda se a chuva mudar.`;
}

/**
 * Detalhe da estação: nível, estado, estimativa e histórico (RF05 a RF07).
 * TODO: trocar a lista do histórico por um gráfico de linha.
 */
export default function TelaEstacao() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idNumero = Number(id);
  const estacao = useEstacao(idNumero);
  const leituras = useLeituras(idNumero);

  if (estacao.isLoading) return <Mensagem carregando titulo="Carregando a estação" />;
  if (estacao.isError || !estacao.data) {
    return (
      <Mensagem
        titulo="Não foi possível carregar a estação"
        texto={estacao.error?.message}
        acao={{ rotulo: 'Tentar de novo', onPress: () => estacao.refetch() }}
      />
    );
  }

  const e = estacao.data;
  const ultima = e.ultimaLeitura;
  const historico = [...(leituras.data ?? [])].reverse();

  return (
    <>
      <Stack.Screen options={{ title: e.rio }} />
      <FlatList
        contentContainerStyle={styles.conteudo}
        data={historico}
        keyExtractor={(l) => l.medidoEm}
        ListHeaderComponent={
          <View style={styles.cabecalho}>
            <Text style={styles.nome}>{e.nome}</Text>
            <Text style={styles.pct}>{ultima ? formatarPct(ultima.nivelPct) : '–'}</Text>
            <Text style={styles.legenda}>do nível de transbordamento</Text>
            <BadgeEstado estado={ultima?.estado ?? null} />
            <Text style={styles.estimativa}>
              {textoEstimativa(e.estimativaMinutosAteTransbordar)}
            </Text>
            <Text style={styles.limites}>
              Atenção a partir de {e.limiteAtencaoPct}% | Crítico a partir de {e.limiteCriticoPct}%
            </Text>
            <Text style={styles.secao}>Últimas 24 horas</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.linha}>
            <Text style={styles.hora}>{formatarHora(item.medidoEm)}</Text>
            <Text style={[styles.valor, { color: aparenciaEstado[item.estado].cor }]}>
              {aparenciaEstado[item.estado].icone} {formatarPct(item.nivelPct)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          leituras.isLoading ? null : (
            <Text style={styles.legenda}>Nenhuma leitura nas últimas 24 horas.</Text>
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: espaco.md },
  cabecalho: { gap: espaco.sm, marginBottom: espaco.md },
  nome: { fontSize: fonte.normal, color: cores.textoSecundario },
  pct: { fontSize: 64, fontWeight: '800', color: cores.azulEscuro, lineHeight: 70 },
  legenda: { fontSize: fonte.pequena, color: cores.textoSecundario },
  estimativa: {
    fontSize: fonte.normal,
    color: cores.azulEscuro,
    backgroundColor: cores.azulClaro,
    padding: espaco.md,
    borderRadius: raio.md,
  },
  limites: { fontSize: fonte.pequena, color: cores.textoSecundario },
  secao: {
    fontSize: fonte.media,
    fontWeight: '700',
    color: cores.azulEscuro,
    marginTop: espaco.md,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  hora: { fontSize: fonte.normal, color: cores.azulEscuro },
  valor: { fontSize: fonte.normal, fontWeight: '700' },
});
