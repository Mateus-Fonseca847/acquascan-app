# @acquascan/roteamento

Roteamento **a pé, offline**: recebe o grafo de ruas gerado por [`tools/grafo`](../../tools/grafo/README.md) e calcula o caminho entre dois pontos com **A\***. Foi escrito para rodar no celular (motor Hermes do app) e também no Node (testes e ferramentas). É a segunda etapa do roteamento offline; as instruções de curva e a leitura dos rios virão depois.

```ts
import { criarRoteador } from '@acquascan/roteamento';

const roteador = criarRoteador(grafoJson); // o conteúdo de grafo-petropolis.json

const rota = roteador.rotear(
  { latitude: -22.5079, longitude: -43.1838 }, // origem
  { latitude: -22.4993, longitude: -43.1672 }, // destino
);

if (rota.status === 'ok') {
  rota.distanciaRedeM; // metros percorridos na rede de ruas
  rota.tempoS; // a 4,5 km/h
  rota.pontos; // a linha completa, para desenhar no mapa
  rota.trechos; // uma entrada por rua, com nome, classe e multiplicador
}
```

## API

| Função / campo                                  | O que faz                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `criarRoteador(grafo: GrafoBruto): Roteador`    | Valida o formato (erro claro em português se estiver inválido) e monta as estruturas indexadas            |
| `roteador.encaixar(ponto, maxDistanciaM = 250)` | O ponto da rede mais próximo, sobre **qualquer aresta** (não só nos nós), ou `null` se estiver mais longe |
| `roteador.rotear(origem, destino, opcoes?)`     | A rota entre dois pontos (veja abaixo)                                                                    |
| `roteador.atributos(arestaId)`                  | `{ nome, classe, comprimentoM, escada, ponte, tunel }`, somente leitura                                   |
| `roteador.totalArestas` / `totalNos`            | Tamanhos do grafo                                                                                         |

### `encaixar`

Devolve `{ arestaId, posicaoM, ponto, distanciaM }`:

- `posicaoM` é a distância, ao longo da aresta, a partir do nó `de`. É a **fração da geometria simplificada vezes `comprimentoM`**, então no fim da aresta vale exatamente `comprimentoM` e as partes somam o total.
- `ponto` é o ponto sobre a aresta; `distanciaM`, a distância em linha reta do ponto consultado até ele.
- A busca usa um **índice em grade** (células de ~100 m) sobre os segmentos das geometrias: não varre as arestas a cada consulta.
- Em empate de distância (um nó compartilhado), vence a aresta de menor id, então o resultado é determinístico.

### `rotear`

`opcoes`:

| Opção                    | Padrão | Significado                                                                                         |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `multiplicadorPorAresta` | tudo 1 | `Float32Array` com **um valor por aresta**, indexado pelo id. Veja "O contrato dos multiplicadores" |
| `velocidadeKmH`          | `4.5`  | Só para o `tempoS`                                                                                  |
| `maxEncaixeM`            | `250`  | Distância máxima da origem e do destino até a rede                                                  |

Resultado (`status`):

- `'ok'`: `distanciaRedeM` (soma dos comprimentos na rede), `encaixeOrigemM` e `encaixeDestinoM` (as distâncias em linha reta até a rede, **fora** da distância da rede), `tempoS` (só da parte na rede), `custo` (soma de comprimento × multiplicador), `trechos`, `pontos` e `nosExpandidos` (diagnóstico).
- `'sem_caminho'`, `'origem_longe'`, `'destino_longe'`.

Cada **trecho**, na ordem do percurso: `{ arestaId, nome, classe, sentido: 'direto' | 'inverso', comprimentoM, multiplicador, pontos }`. O `comprimentoM` é o da **parte percorrida** (parcial na primeira e na última aresta) e os `pontos` já vêm orientados no sentido do percurso e cortados no ponto de encaixe nas pontas. `pontos` da rota é a linha completa, sem repetir o vértice nas junções. Origem igual ao destino (no mesmo ponto da rede) é `ok` com distância 0 e `trechos` vazio.

## O contrato dos multiplicadores

Os multiplicadores são o **ponto de extensão do futuro desvio de rios**. O custo de percorrer uma aresta é `comprimento × multiplicador`.

| Valor                        | Efeito                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `1`                          | Normal                                                                                                            |
| `> 1` (ex.: `3`)             | Penaliza: o roteador só passa ali se o desvio custar mais que isso                                                |
| muito alto (ex.: `1000`)     | Quase bloqueia, mas **a rota continua existindo**. Importante quando a pessoa já está dentro de uma zona de risco |
| `Infinity`                   | Bloqueia de vez. Sem alternativa, o resultado é `sem_caminho`                                                     |
| `< 1`, `NaN`, tamanho errado | **Erro de programação**: o `rotear` lança `Error` com mensagem clara                                              |

Por que `>= 1`: a heurística do A\* usa a distância em linha reta, que só é um limite inferior do custo se nenhum multiplicador reduzir o custo abaixo do comprimento.

**O roteador NÃO decide política de segurança.** Ele só devolve, em cada trecho, o multiplicador que usou. Quem chama calcula a exposição (por exemplo, os metros percorridos onde `multiplicador > 1`), decide o que mostrar e quando avisar.

## Como funciona

- **Grafo em CSR:** a adjacência fica em `Int32Array` (índices) e os comprimentos em `Float64Array`. Um "arco" é cada sentido de uma aresta (`2 × aresta` e `2 × aresta + 1`); arestas de `sentidoUnico` só têm o arco de ida.
- **A\* com heap binário próprio** (typed arrays), com **inserção preguiçosa**: em vez de diminuir a chave de um nó na fila, insere-se outra entrada, e as velhas são descartadas ao sair. Cada entrada guarda o `g` com que entrou, e um nó pode ser reaberto se achar um caminho melhor. O laço principal **não aloca objetos**.
- **Origem e destino no meio de arestas:** em vez de "grudar" no nó mais próximo, a origem vira uma **fonte virtual**: o custo inicial até cada ponta da aresta encaixada (ponderado pelo multiplicador daquela aresta). O destino é equivalente: ao chegar a uma das pontas da aresta dele, soma-se o custo até o ponto.
- **Mesma aresta:** o trajeto direto concorre com o que sai pelas pontas e volta. Fica o de menor custo (isso importa quando a aresta tem multiplicador alto e existe um desvio).
- **Sentido único (`oneway:foot`):** respeitado na rede, na saída da origem, na entrada do destino e no trajeto direto.
- **Heurística:** distância em linha reta até o destino, calculada num **plano local** (bem mais barato que o haversine), vezes **0,99** e menos **3 m** de folga. O fator cobre a diferença entre o plano e o haversine (abaixo de 0,1% na área de Petrópolis, medida nos testes) e a folga cobre o arredondamento dos comprimentos e coordenadas do grafo (~0,1 m por aresta). Assim ela **nunca passa do custo real mínimo**, e o A\* devolve sempre a rota ótima, igual à de um Dijkstra.
- **Precondição do grafo:** `comprimentoM` de cada aresta não deve ser menor que a reta entre suas pontas (a menos de arredondamento). O grafo de `tools/grafo` garante isso.

## Restrições de plataforma

O código de `src/` (tudo menos `*.test.ts`) roda no **Hermes**, o motor JavaScript do app, que não tem as APIs do Node. Por isso ele **não pode** importar `node:*` nem usar `Buffer`, `fs`, `path`, `process` ou `require`: só TypeScript puro e typed arrays. Três proteções:

1. `tsconfig.json` compila `src/` **sem os tipos do Node** (`"types": []`): usar `Buffer` ou `process` vira erro de compilação.
2. O teste `src/plataforma.test.ts` lê os arquivos de `src/` e falha se achar essas dependências (e prova que o detector funciona).
3. Os testes, que precisam do Node (ler arquivos), ficam em `tsconfig.teste.json`, e os auxiliares deles em `test/`, fora de `src/`.

`pnpm typecheck` roda os dois `tsc`.

## Por que um A\* próprio

- **Offline:** a rota é calculada no celular, sem internet. Em uma enchente, a rede móvel é justamente o que pode cair.
- **Controle do custo:** o desvio de rios exige mudar o custo de **arestas específicas** conforme o estado dos rios, a cada rota. Serviços de roteamento prontos raramente aceitam custos por aresta vindos de dados nossos.
- **Privacidade:** a localização do usuário não sai do aparelho.
- **Pequeno e testável:** são algumas centenas de linhas, sem dependências, comparadas nos testes com um Dijkstra de referência.

A decisão está registrada em [docs/decisoes.md](../../docs/decisoes.md).

## Desempenho (medido no Node, não no celular)

Grafo real de Petrópolis (6.329 nós, 7.219 arestas, JSON de 1,9 MB), em 16/10/2026:

| Medida                              | Valor                                  |
| ----------------------------------- | -------------------------------------- |
| `criarRoteador`                     | ~7 ms                                  |
| Estruturas indexadas (typed arrays) | ~1,4 MB                                |
| `rotear` (500 pares aleatórios)     | mediana 0,21 ms, p95 0,55 ms           |
| Nós expandidos (média)              | A\* 978 contra 3.124 do Dijkstra (31%) |

O celular será mais lento que o computador; vale medir lá antes de tirar conclusões. O JSON é lido e interpretado a cada abertura do app, e esse custo ainda não foi medido.

## Testes

```bash
pnpm --filter @acquascan/roteamento test
```

Sem rede. Cobrem: encaixe (sobre a aresta, ao lado, perto de um nó, além do limite, e contra uma busca por força bruta); rotas em grafos feitos à mão (caminho único, dois caminhos, multiplicadores 3 e 1000, `Infinity` com e sem alternativa, mesma aresta nos dois sentidos, origem igual ao destino, ilhas, junções sem vértices repetidos, sentido inverso, sentido único); validação das entradas; a guarda de plataforma; e a comparação com um **Dijkstra ingênuo** (dentro do teste) em grades aleatórias de 30×30, com 300 pares e multiplicadores aleatórios (inclusive `Infinity`), exigindo custo **igual**. Se `tools/grafo/saida/grafo-petropolis.json` existir, o grafo real também é conferido (200 pares sem `sem_caminho`, e 100 com multiplicadores); sem o arquivo (como no CI), essa parte é pulada.

## O que este pacote ainda não faz

Instruções de curva (próxima etapa), leitura do estado dos rios (quem calcula os multiplicadores é o chamador) e formato binário do grafo (o JSON basta por enquanto).
