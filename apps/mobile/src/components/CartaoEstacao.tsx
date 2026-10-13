import type { EstacaoResumo } from '@acquascan/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgeEstado } from '@/components/BadgeEstado';
import { cores, espaco, fonte, raio } from '@/theme';
import { formatarHora, formatarPct } from '@/utils/formatar';

interface Props {
  estacao: EstacaoResumo;
  onPress: () => void;
}

export function CartaoEstacao({ estacao, onPress }: Props) {
  const leitura = estacao.ultimaLeitura;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cartao, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityHint="Abre o histórico desta estação"
    >
      <View style={styles.info}>
        <Text style={styles.rio}>{estacao.rio}</Text>
        <Text style={styles.nome}>{estacao.nome}</Text>
        <BadgeEstado estado={leitura?.estado ?? null} />
      </View>
      <View style={styles.nivel}>
        <Text style={styles.pct}>{leitura ? formatarPct(leitura.nivelPct) : '–'}</Text>
        <Text style={styles.hora}>
          {leitura ? `às ${formatarHora(leitura.medidoEm)}` : 'sem leitura'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    backgroundColor: cores.branco,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.md,
    gap: espaco.md,
  },
  pressionado: { backgroundColor: cores.azulClaro },
  info: { flex: 1, gap: espaco.xs },
  rio: { fontSize: fonte.media, fontWeight: '700', color: cores.azulEscuro },
  nome: { fontSize: fonte.pequena, color: cores.textoSecundario, marginBottom: espaco.xs },
  nivel: { alignItems: 'flex-end', justifyContent: 'center' },
  pct: { fontSize: fonte.destaque, fontWeight: '800', color: cores.azulEscuro },
  hora: { fontSize: fonte.pequena, color: cores.textoSecundario },
});
