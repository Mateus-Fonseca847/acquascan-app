import type { PrevisaoDia } from '@aquascan/shared';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Mensagem } from '@/components/Mensagem';
import { usePrevisao } from '@/hooks/consultas';
import { aparenciaChuva, cores, espaco, fonte, raio } from '@/theme';
import { formatarDia } from '@/utils/formatar';

function DiaPrevisao({ dia }: { dia: PrevisaoDia }) {
  const aparencia = aparenciaChuva[dia.risco];
  return (
    <View style={styles.dia}>
      <View style={[styles.faixa, { backgroundColor: aparencia.cor }]} />
      <View style={styles.diaInfo}>
        <Text style={styles.diaNome}>{formatarDia(dia.data)}</Text>
        <Text style={[styles.risco, { color: aparencia.cor }]}>
          {aparencia.icone} {aparencia.rotulo}
        </Text>
      </View>
      <View style={styles.numeros}>
        <Text style={styles.chuva}>{dia.chuvaMm.toFixed(0)} mm</Text>
        <Text style={styles.temp}>
          {Math.round(dia.temperaturaMinC)}° / {Math.round(dia.temperaturaMaxC)}°
        </Text>
      </View>
    </View>
  );
}

export default function TelaPrevisao() {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePrevisao();

  if (isLoading) return <Mensagem carregando titulo="Carregando a previsão" />;
  if (isError) {
    return (
      <Mensagem
        titulo="Não foi possível carregar a previsão"
        texto={error.message}
        acao={{ rotulo: 'Tentar de novo', onPress: () => refetch() }}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.lista}
      data={data?.dias}
      keyExtractor={(d) => d.data}
      renderItem={({ item }) => <DiaPrevisao dia={item} />}
      refreshing={isRefetching}
      onRefresh={refetch}
      ListHeaderComponent={<Text style={styles.titulo}>Chuva prevista para Petrópolis</Text>}
      ListFooterComponent={<Text style={styles.fonte}>Dados: Open-Meteo</Text>}
    />
  );
}

const styles = StyleSheet.create({
  lista: { padding: espaco.md, gap: espaco.sm },
  titulo: {
    fontSize: fonte.media,
    fontWeight: '700',
    color: cores.azulEscuro,
    marginBottom: espaco.sm,
  },
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    overflow: 'hidden',
    backgroundColor: cores.branco,
  },
  faixa: { width: 6, alignSelf: 'stretch' },
  diaInfo: { flex: 1, padding: espaco.md, gap: 2 },
  diaNome: { fontSize: fonte.normal, fontWeight: '600', color: cores.azulEscuro },
  risco: { fontSize: fonte.pequena, fontWeight: '700' },
  numeros: { padding: espaco.md, alignItems: 'flex-end' },
  chuva: { fontSize: fonte.media, fontWeight: '700', color: cores.azulEscuro },
  temp: { fontSize: fonte.pequena, color: cores.textoSecundario },
  fonte: {
    fontSize: fonte.pequena,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espaco.md,
  },
});
