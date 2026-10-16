# @acquascan/desvio

Política de **desvio de rios**: junta o roteador ([`@acquascan/roteamento`](../roteamento/README.md)), a **exposição** das ruas aos rios ([`tools/grafo`](../../tools/grafo/README.md), `exposicao-petropolis.json`) e o **estado das estações** para recomendar a rota a pé mais segura.

É **lógica pura**: sem tela, sem API, sem relógio próprio (a hora vem de quem chama), sem rede. Roda no Node e no Hermes (o motor do app); `src/` não usa nada do Node, e um teste garante isso.

> **ATENÇÃO: todos os números da política são PROVISÓRIOS** e precisam ser validados com a Defesa Civil antes de qualquer uso real. Foram escolhidos olhando medições nos dados de Petrópolis, não critérios técnicos de risco.

## Princípio

**O que o mapa mostra em vermelho é exatamente o que a rota evita.** Por isso existe uma única fonte do estado de cada trecho de rio, `estadoDosSegmentos`, usada tanto para colorir o mapa quanto para montar os multiplicadores do desvio.

## Uso

```ts
import { criarRoteador } from '@acquascan/roteamento';
import { criarDesvio } from '@acquascan/desvio';

const desvio = criarDesvio(
  { roteador: criarRoteador(grafo), exposicao, rios },
  estacoes, // [{ id, rio: 'Rio Piabanha', latitude, longitude }]
  // política opcional, parcial: { critico: { k: 99 } }
);

const r = desvio.rotear(origem, destino, leituras, new Date());
if (r.status === 'ok') {
  r.modo; // 'sem_risco' | 'segura' | 'menos_exposta'
  r.recomendada; // { rota, distanciaTotalM, tempoS, exposicaoCriticaM, ... }
  r.maisCurta; // só quando vale mostrar (veja abaixo)
  r.avisos; // códigos; os textos em português ficam para o app
}
```

`leituras` é a última leitura de cada estação, como a API devolve: `{ estacaoId, estado: Estado | null, medidoEm: string | null }`.

| Método                                                       | O que faz                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `criarDesvio(dados, estacoes, pol?)`                         | Valida os dados (erros em português) e pré-calcula a estação que governa cada segmento e o índice das entradas por aresta                      |
| `estadosEfetivos(leituras, agora)`                           | Por estação: `{ estado, origem: 'medido' \| 'falha_segura' \| 'desatualizado' \| 'sem_leitura', idadeMin }`                                    |
| `estadoDosSegmentos(leituras, agora)`                        | Por segmento de rio: `{ estado: Estado \| 'DESCONHECIDO' \| 'SEM_MONITORAMENTO', estacaoId }`. **A fonte única** do mapa e do desvio           |
| `rotear(origem, destino, leituras, agora, opcoes?)`          | A rota recomendada (algoritmo abaixo)                                                                                                          |
| `escolherApoio(origem, apoios, leituras, agora, limite = 5)` | Ordena pontos de apoio por segurança e distância                                                                                               |
| `resumoCobertura()`                                          | Quantos km de rio têm estação por perto, por rio, e as estações sem nenhum segmento ao alcance (provável erro de coordenada ou de nome do rio) |
| `avaliarRota(rota, leituras, agora)`                         | Extra: mede a exposição de qualquer rota do roteador (útil para comparar com a mais curta)                                                     |

## Estado efetivo e falha segura

O estado de uma estação que a política usa **não é sempre o último recebido**:

- leitura com até `frescoMin` (20 min): vale como está (`medido`);
- **CRITICO ou ATENCAO mais antigo, até `retencaoH` (6 h): continua valendo** (`falha_segura`). Se a estação parou de enviar durante uma cheia, o pior caso é o último estado ruim, não "tudo bem". O resultado traz o aviso `ESTADO_ANTIGO_EM_USO`;
- ESTAVEL antigo, qualquer leitura além de `retencaoH` e estação sem leitura viram `DESCONHECIDO`: **sem penalidade**, mas com o aviso `ESTACAO_SEM_LEITURA_ATUAL`;
- data inválida ou do futuro (relógio do celular errado) nunca é leitura fresca: um estado ruim é mantido por falha segura (sem prazo, porque não dá para medir a idade) e um ESTAVEL vira `DESCONHECIDO`. Nunca se descarta um aviso de perigo por causa de um relógio errado.

## Que estação governa cada trecho de rio

Cada segmento de rio (uma feature de `rios-petropolis.geojson`) é governado pela **estação mais próxima do MESMO rio**, medindo a distância plana até a polilinha do segmento, desde que esteja a até `distanciaTrechoM`. Os nomes são comparados normalizados (`"Rio Piabanha"` = `"Piabanha"`). Fora desse alcance o segmento é `SEM_MONITORAMENTO` (cinza no mapa) e **não recebe desvio**. Duas estações no mesmo rio governam trechos diferentes.

## O algoritmo de `rotear`

0. Calcula a rota **mais curta**, sem nenhuma penalidade.
1. Se nenhum segmento está em CRITICO ou ATENCAO: devolve a mais curta, `modo: 'sem_risco'`, `maisCurta: null`.
2. Monta um **multiplicador por rua**: o máximo, entre as entradas de exposição da rua, de `1 + k × fração`, onde a fração é `max(fração da faixa do estado, cruza ? min(1, larguraTravessiaM / comprimento da rua) : 0)`. Vale o **máximo, nunca a soma** (uma rua que passa junto de dois rios não é duas vezes mais perigosa). CRITICO usa a faixa de 50 m e `k = 49`; ATENCAO, 15 m e `k = 3`. ESTAVEL, DESCONHECIDO e SEM_MONITORAMENTO não penalizam.
3. **Passada estrita**: as ruas que **cruzam** um rio CRITICO ficam com `Infinity` (bloqueadas). Se achar rota, `modo: 'segura'`.
4. **Passada de reserva**: sem rota na estrita (só há ponte, ou a origem/destino está sobre a travessia), repete com multiplicadores finitos: a rota usa o mínimo de travessias possível, `modo: 'menos_exposta'`, com os avisos `ATRAVESSA_RIO_CRITICO` (se cruza) e `EXPOSICAO_RIO_CRITICO` (se passa mais de `limiarExposicaoM` junto do rio). Se nem assim há rota, `sem_caminho` (ou `origem_longe`/`destino_longe`, repassados do roteador). A passada de reserva só roda se houve ruas bloqueadas.
5. A exposição da rota é o **comprimento parcial** de cada trecho × a fração efetiva, por estado; travessias contam por uso. A rota **mais curta** só é devolvida em `maisCurta` se tiver pelo menos `diferencaMostrarMaisCurtaM` a mais de exposição crítica, ou se usar travessia crítica e a recomendada não.

`distanciaTotalM` e `tempoS` incluem os trechos de encaixe (da origem até a rua e da rua até o destino).

## `escolherApoio`

Considera os `limite` apoios mais próximos em linha reta **mais os 2 mais próximos pela rota mais curta** (sem repetir), roteia cada um e ordena por: modo (`sem_risco`/`segura` antes de `menos_exposta`, antes de sem rota) e, dentro de cada grupo, `distanciaTotalM + pesoExposicaoNoRanking × exposicaoCriticaM`.

## A política (`POLITICA_PADRAO`)

| Constante                    | Padrão                                 | Por quê                                                                                                                           |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `distanciaTrechoM`           | 1000 m                                 | Alcance de uma estação ao longo do rio. Além disso o trecho fica sem monitoramento. Pouca estação = pouca cobertura               |
| `critico`                    | faixa 50 m, `k` 49, bloqueia travessia | Fração da rua a até 50 m do rio; uma rua toda junto ao rio custa 50× o comprimento. Medido: o "joelho" da curva está em k ≈ 3 a 9 |
| `atencao`                    | faixa 15 m, `k` 3, não bloqueia        | Aviso leve para quem puder escolher; não deve impedir uma travessia                                                               |
| `frescoMin`                  | 20 min                                 | As estações enviam uma leitura por minuto. Alinhar com o limite de "estação sem dados" da API                                     |
| `retencaoH`                  | 6 h                                    | Quanto tempo um estado ruim antigo continua valendo (falha segura)                                                                |
| `larguraTravessiaM`          | 60 m                                   | Uma ponte curta quase não tem metros "junto ao rio" amostrados, mas é uma travessia: fração mínima = min(1, 60 / comprimento)     |
| `limiarExposicaoM`           | 50 m                                   | Acima disso a rota recebe o aviso `EXPOSICAO_RIO_CRITICO`                                                                         |
| `diferencaMostrarMaisCurtaM` | 100 m                                  | Evita mostrar duas rotas praticamente iguais                                                                                      |
| `pesoExposicaoNoRanking`     | 10                                     | No ranking de apoios, cada metro exposto vale 10 m de caminhada a mais                                                            |

`critico.faixa` e `atencao.faixa` precisam ser uma das faixas do arquivo de exposição (15, 30 ou 50 m).

## O que este pacote NÃO cobre

- **Rios sem estação**: ficam `SEM_MONITORAMENTO` e a rota não os evita. Segundo a medição de `tools/grafo`, ~47% dos cruzamentos de ruas com cursos d'água são sobre rios sem estação. O app deve avisar que o desvio vale só para os rios monitorados (`resumoCobertura` mostra o tamanho do buraco).
- **Terreno e relevo**: nada de declividade, cota ou área de inundação; só a distância ao rio.
- **Deslizamentos** e encostas instáveis.
- **Vias interditadas**, alagamentos fora dos rios, obras: o grafo é o do OpenStreetMap, sem tempo real.
- **Números provisórios**: veja o aviso no topo.
- A API não participa; nada daqui é enviado a servidor.

## Comandos

```bash
pnpm --filter @acquascan/desvio test
pnpm --filter @acquascan/desvio typecheck
```

Os testes usam mundos sintéticos pequenos (ruas, rios e estações montados em `test/auxiliares.ts`, com PRNG determinístico) e, se `tools/grafo/saida` existir, um teste com os dados reais de Petrópolis.
