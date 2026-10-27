import Ionicons from '@expo/vector-icons/Ionicons';
import { gerarPassos } from '@aquascan/roteamento';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Botao } from '@/components/Botao';
import { carregarRoteamento, type Roteamento, type TemposDeCarga } from '@/roteamento/dados';
import {
  escolherEstacoesHipoteticas,
  escolherPares,
  estatisticas,
  formatarMs,
  leiturasComEstado,
  media,
  type Estatistica,
} from '@/roteamento/puro';
import { cores, espaco, fonte, raio } from '@/theme';

/** Tela de PROVA de roteamento (R7a), só em desenvolvimento: mede o roteador e o desvio no Hermes. */
const SEMENTE = 20261016;
const ROTAS = 100;

interface ResultadoModo {
  nome: string;
  rotear: Estatistica;
  passos: Estatistica;
  mudaram: number;
  semRota: number;
  exposicaoCriticaM: number;
}

interface Prova {
  tempos: TemposDeCarga;
  nos: number;
  arestas: number;
  estacoes: number;
  modos: ResultadoModo[];
  polilinhaMs: number;
  pontosDaRota: number;
  coordenadas: { latitude: number; longitude: number }[];
  textos: string[];
}

type Fase = 'ocioso' | 'rodando' | 'pronto' | 'erro';

const proximoFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 50));
const agora = (): number => performance.now();

function medirModos(r: Roteamento): {
  modos: ResultadoModo[];
  coordenadas: Prova['coordenadas'];
  polilinhaMs: number;
  textos: string[];
  pontosDaRota: number;
} {
  const pares = escolherPares(r.grafo.nos, ROTAS, SEMENTE);
  const hoje = new Date();
  const configuracoes: { nome: string; estado: 'ESTAVEL' | 'CRITICO' }[] = [
    { nome: 'Sem risco (tudo estável)', estado: 'ESTAVEL' },
    { nome: 'Rios em CRÍTICO', estado: 'CRITICO' },
  ];
  const modos: ResultadoModo[] = [];
  let coordenadas: Prova['coordenadas'] = [];
  let textos: string[] = [];
  let polilinhaMs = 0;
  let pontosDaRota = 0;

  for (const c of configuracoes) {
    const leituras = leiturasComEstado(r.estacoes, c.estado, hoje);
    const temposRotear: number[] = [];
    const temposPassos: number[] = [];
    const exposicoes: number[] = [];
    let mudaram = 0;
    let semRota = 0;
    for (const par of pares) {
      const t0 = agora();
      const resultado = r.desvio.rotear(par.origem, par.destino, leituras, hoje);
      const t1 = agora();
      if (resultado.status !== 'ok') {
        semRota++;
        continue;
      }
      temposRotear.push(t1 - t0);
      const t2 = agora();
      const passos = gerarPassos(resultado.recomendada.rota, r.roteador);
      temposPassos.push(agora() - t2);
      exposicoes.push(resultado.recomendada.exposicaoCriticaM);

      // "mudou" = a rota recomendada difere da mais curta (fora da medição de tempo)
      const curta = r.roteador.rotear(par.origem, par.destino);
      if (
        curta.status === 'ok' &&
        curta.trechos.map((t) => t.arestaId).join(',') !==
          resultado.recomendada.rota.trechos.map((t) => t.arestaId).join(',')
      ) {
        mudaram++;
      }

      // a rota desenhada: a primeira do modo crítico
      if (c.estado === 'CRITICO' && coordenadas.length === 0) {
        const tp = agora();
        coordenadas = resultado.recomendada.rota.pontos.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
        }));
        polilinhaMs = agora() - tp;
        pontosDaRota = coordenadas.length;
        textos = passos.slice(0, 10).map((p, i) => `${i + 1}. ${p.texto}`);
      }
    }
    modos.push({
      nome: c.nome,
      rotear: estatisticas(temposRotear),
      passos: estatisticas(temposPassos),
      mudaram,
      semRota,
      exposicaoCriticaM: media(exposicoes),
    });
  }
  return { modos, coordenadas, polilinhaMs, textos, pontosDaRota };
}

function linhaDeConsole(p: Prova): string {
  const ms = (e: Estatistica) => `${e.mediana.toFixed(2)}/${e.p95.toFixed(2)}/${e.max.toFixed(2)}`;
  const modos = p.modos
    .map(
      (m) =>
        `[${m.nome}] rotear(med/p95/max ms)=${ms(m.rotear)} passos=${ms(m.passos)} mudaram=${m.mudaram}/${ROTAS} semRota=${m.semRota} expCritMedia=${m.exposicaoCriticaM.toFixed(1)}m`,
    )
    .join(' | ');
  return `[R7a] seed=${SEMENTE} carga: leituraParse=${p.tempos.leituraParseMs.toFixed(1)}ms criarRoteador=${p.tempos.criarRoteadorMs.toFixed(1)}ms criarDesvio=${p.tempos.criarDesvioMs.toFixed(1)}ms total=${p.tempos.totalMs.toFixed(1)}ms | ${modos} | polilinha=${p.polilinhaMs.toFixed(2)}ms (${p.pontosDaRota} pontos)`;
}

export default function TelaRotaTeste() {
  const [fase, setFase] = useState<Fase>('ocioso');
  const [prova, setProva] = useState<Prova | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const mapa = useRef<MapView>(null);

  async function rodar() {
    setFase('rodando');
    setErro(null);
    await proximoFrame(); // deixa a tela mostrar "Rodando" antes de travar a thread
    try {
      const r = carregarRoteamento(escolherEstacoesHipoteticas);
      await proximoFrame();
      const medido = medirModos(r);
      const resultado: Prova = {
        tempos: r.tempos,
        nos: r.grafo.nos.length,
        arestas: r.grafo.arestas.length,
        estacoes: r.estacoes.length,
        ...medido,
      };
      console.log(linhaDeConsole(resultado));
      setProva(resultado);
      setFase('pronto');
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      console.log(`[R7a] ERRO: ${mensagem}`);
      setErro(mensagem);
      setFase('erro');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Prova de roteamento (só desenvolvimento)</Text>
      <Text style={styles.texto}>
        Carrega o grafo, os rios e a exposição, cria 3 estações hipotéticas sobre os rios e roda{' '}
        {ROTAS} rotas entre vértices aleatórios (semente {SEMENTE}) em dois modos.
      </Text>
      <Botao
        rotulo={fase === 'pronto' ? 'Rodar de novo' : 'Rodar a prova'}
        onPress={() => void rodar()}
        carregando={fase === 'rodando'}
      />

      {fase === 'rodando' && (
        <View style={styles.aviso}>
          <Ionicons name="hourglass-outline" size={24} color={cores.azul} />
          <Text style={styles.textoAviso}>Rodando... a tela pode travar por alguns segundos.</Text>
        </View>
      )}

      {fase === 'erro' && erro && (
        <View style={[styles.aviso, styles.avisoErro]}>
          <Ionicons name="alert-circle-outline" size={24} color={cores.azulEscuro} />
          <Text style={styles.textoAviso}>{erro}</Text>
        </View>
      )}

      {fase === 'pronto' && prova && (
        <>
          <View style={styles.cartao}>
            <Text style={styles.subtitulo}>Carga dos dados</Text>
            <Text style={styles.texto}>
              Grafo: {prova.nos} nós e {prova.arestas} arestas. Estações hipotéticas:{' '}
              {prova.estacoes}.
            </Text>
            <Text style={styles.texto}>
              Ler e interpretar os arquivos: {formatarMs(prova.tempos.leituraParseMs)}
            </Text>
            <Text style={styles.texto}>
              criarRoteador: {formatarMs(prova.tempos.criarRoteadorMs)}
            </Text>
            <Text style={styles.texto}>criarDesvio: {formatarMs(prova.tempos.criarDesvioMs)}</Text>
            <Text style={styles.destaque}>Total: {formatarMs(prova.tempos.totalMs)}</Text>
          </View>

          {prova.modos.map((m) => (
            <View key={m.nome} style={styles.cartao}>
              <Text style={styles.subtitulo}>{m.nome}</Text>
              <Text style={styles.texto}>
                rotear (mediana / p95 / máx): {formatarMs(m.rotear.mediana)} /{' '}
                {formatarMs(m.rotear.p95)} / {formatarMs(m.rotear.max)}
              </Text>
              <Text style={styles.texto}>
                gerarPassos (mediana / p95 / máx): {formatarMs(m.passos.mediana)} /{' '}
                {formatarMs(m.passos.p95)} / {formatarMs(m.passos.max)}
              </Text>
              <Text style={styles.texto}>
                Rotas que mudaram (≠ mais curta): {m.mudaram} de {ROTAS}
                {m.semRota > 0 ? ` (${m.semRota} sem rota)` : ''}
              </Text>
              <Text style={styles.texto}>
                Exposição crítica média: {m.exposicaoCriticaM.toFixed(1).replace('.', ',')} m
              </Text>
            </View>
          ))}

          <View style={styles.cartao}>
            <Text style={styles.subtitulo}>Uma rota no mapa (modo crítico)</Text>
            <Text style={styles.texto}>
              Montar a polilinha: {formatarMs(prova.polilinhaMs)} ({prova.pontosDaRota} pontos)
            </Text>
            {prova.coordenadas.length > 1 && (
              <MapView
                ref={mapa}
                style={styles.mapa}
                initialRegion={{
                  latitude: prova.coordenadas[0]!.latitude,
                  longitude: prova.coordenadas[0]!.longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
                onMapReady={() =>
                  mapa.current?.fitToCoordinates(prova.coordenadas, {
                    edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
                    animated: false,
                  })
                }
              >
                <Polyline
                  coordinates={prova.coordenadas}
                  strokeColor={cores.azul}
                  strokeWidth={5}
                />
                <Marker coordinate={prova.coordenadas[0]!} title="Origem" />
                <Marker
                  coordinate={prova.coordenadas[prova.coordenadas.length - 1]!}
                  title="Destino"
                />
              </MapView>
            )}
          </View>

          <View style={styles.cartao}>
            <Text style={styles.subtitulo}>Primeiros passos dessa rota</Text>
            {prova.textos.map((t) => (
              <Text key={t} style={styles.texto}>
                {t}
              </Text>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: espaco.md, gap: espaco.md },
  titulo: { fontSize: fonte.titulo, fontWeight: '800', color: cores.azulEscuro },
  subtitulo: { fontSize: fonte.media, fontWeight: '700', color: cores.azulEscuro },
  texto: { fontSize: fonte.normal, color: cores.textoSecundario },
  destaque: { fontSize: fonte.media, fontWeight: '700', color: cores.azul },
  cartao: {
    backgroundColor: cores.azulClaro,
    borderRadius: raio.md,
    padding: espaco.md,
    gap: espaco.sm,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    backgroundColor: cores.azulClaro,
    borderRadius: raio.md,
    padding: espaco.md,
  },
  avisoErro: { borderWidth: 1.5, borderColor: cores.azul },
  textoAviso: { flex: 1, fontSize: fonte.normal, color: cores.azulEscuro },
  mapa: { height: 280, borderRadius: raio.sm },
});
