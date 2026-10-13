import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { CartaoEstacao } from '@/components/CartaoEstacao';
import { Mensagem } from '@/components/Mensagem';
import { useEstacoes } from '@/hooks/consultas';
import { aparenciaEstado, aparenciaSemDados, espaco } from '@/theme';

/** Região inicial: centro de Petrópolis. */
const PETROPOLIS = {
  latitude: -22.512,
  longitude: -43.185,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

/**
 * Tela inicial: mapa com as estações e lista com o estado de cada rio.
 * TODO(v0.3.0): campo "Pesquise sua rua" acima do mapa (RF04).
 * TODO: estilo de mapa personalizado em azul e branco (customMapStyle).
 */
export default function TelaMapa() {
  const { data: estacoes, isLoading, isError, error, refetch, isRefetching } = useEstacoes();

  if (isLoading) return <Mensagem carregando titulo="Carregando os rios" />;

  if (isError) {
    return (
      <Mensagem
        titulo="Não foi possível carregar os rios"
        texto={error.message}
        acao={{ rotulo: 'Tentar de novo', onPress: () => refetch() }}
      />
    );
  }

  const abrir = (id: number) => router.push(`/estacao/${id}`);

  return (
    <View style={styles.container}>
      <MapView style={styles.mapa} initialRegion={PETROPOLIS}>
        {estacoes?.map((estacao) => {
          const estado = estacao.ultimaLeitura?.estado;
          const aparencia = estado ? aparenciaEstado[estado] : aparenciaSemDados;
          return (
            <Marker
              key={estacao.id}
              coordinate={{ latitude: estacao.latitude, longitude: estacao.longitude }}
              pinColor={aparencia.cor}
              title={estacao.rio}
              description={`${aparencia.rotulo}. Toque para ver detalhes.`}
              onCalloutPress={() => abrir(estacao.id)}
            />
          );
        })}
      </MapView>

      <FlatList
        style={styles.lista}
        contentContainerStyle={styles.listaConteudo}
        data={estacoes}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item }) => <CartaoEstacao estacao={item} onPress={() => abrir(item.id)} />}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <Mensagem
            titulo="Nenhuma estação cadastrada"
            texto="Rode o seed da API para criar estações de teste (pnpm db:seed)."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapa: { height: '45%' },
  lista: { flex: 1 },
  listaConteudo: { padding: espaco.md, gap: espaco.sm },
});
