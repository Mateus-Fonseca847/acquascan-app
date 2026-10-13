import type { PontoApoio } from '@acquascan/shared';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { Mensagem } from '@/components/Mensagem';
import { usePontosApoio } from '@/hooks/consultas';
import { cores, espaco, fonte, raio } from '@/theme';
import { formatarDistancia } from '@/utils/formatar';

/** Abre o app de mapas do celular com a rota até o ponto. */
function abrirRota(ponto: PontoApoio) {
  const destino = `${ponto.latitude},${ponto.longitude}`;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}`);
}

function CartaoPonto({ ponto }: { ponto: PontoApoio }) {
  return (
    <View style={styles.cartao}>
      <Text style={styles.nome}>{ponto.nome}</Text>
      <Text style={styles.detalhe}>{ponto.endereco}</Text>
      <Text style={styles.detalhe}>
        Capacidade: {ponto.capacidade} pessoas
        {ponto.distanciaM !== undefined ? `  |  ${formatarDistancia(ponto.distanciaM)}` : ''}
      </Text>
      <View style={styles.acoes}>
        <View style={styles.acao}>
          <Botao rotulo="Como chegar" onPress={() => abrirRota(ponto)} />
        </View>
        {ponto.contato && (
          <View style={styles.acao}>
            <Botao
              rotulo={`Ligar ${ponto.contato}`}
              variante="secundario"
              onPress={() => Linking.openURL(`tel:${ponto.contato}`)}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * TODO(v0.3.0): ordenar pelos mais próximos usando a localização do usuário
 * (expo-location ou coordenadas do CEP) e mostrar distância a pé e de carro (RF11).
 */
export default function TelaApoio() {
  const { data, isLoading, isError, error, refetch, isRefetching } = usePontosApoio();

  if (isLoading) return <Mensagem carregando titulo="Carregando os pontos de apoio" />;
  if (isError) {
    return (
      <Mensagem
        titulo="Não foi possível carregar os pontos de apoio"
        texto={error.message}
        acao={{ rotulo: 'Tentar de novo', onPress: () => refetch() }}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.lista}
      data={data}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <CartaoPonto ponto={item} />}
      refreshing={isRefetching}
      onRefresh={refetch}
      ListHeaderComponent={
        <Text style={styles.aviso}>
          Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).
        </Text>
      }
      ListEmptyComponent={<Mensagem titulo="Nenhum ponto de apoio cadastrado" />}
    />
  );
}

const styles = StyleSheet.create({
  lista: { padding: espaco.md, gap: espaco.sm },
  aviso: {
    fontSize: fonte.normal,
    fontWeight: '600',
    color: cores.azulEscuro,
    backgroundColor: cores.azulClaro,
    padding: espaco.md,
    borderRadius: raio.md,
    marginBottom: espaco.sm,
  },
  cartao: {
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.md,
    gap: espaco.xs,
    backgroundColor: cores.branco,
  },
  nome: { fontSize: fonte.media, fontWeight: '700', color: cores.azulEscuro },
  detalhe: { fontSize: fonte.pequena, color: cores.textoSecundario },
  acoes: { flexDirection: 'row', gap: espaco.sm, marginTop: espaco.sm },
  acao: { flex: 1 },
});
