# @aquascan/roteamento

Roteamento **a pé, offline**: recebe o grafo de ruas gerado por [`tools/grafo`](../../tools/grafo/README.md) e calcula o caminho entre dois pontos com **A\***. Foi escrito para rodar no celular (motor Hermes do app) e também no Node (testes e ferramentas). É a segunda etapa do roteamento offline; a quinta acrescentou as instruções de curva e o acompanhamento da rota (veja abaixo). A leitura dos rios fica em [`packages/desvio`](../desvio/README.md).

```ts
import { criarRoteador } from '@aquascan/roteamento';

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

## Instruções de curva e acompanhamento

Quinta etapa do roteamento: lógica pura sobre o resultado `ok` de `rotear`, sem tela e sem leitura de rios. O texto é em português do Brasil.

### `gerarPassos(rota, atributos, { nomeDestino? }) → Passo[]`

`atributos` é o próprio `Roteador` ou uma função `(arestaId) => AtributosAresta`.

```ts
const passos = gerarPassos(rota, roteador, { nomeDestino: 'Ponto de apoio A' });
// [{ tipo: 'partida', texto: 'Siga para o norte pela Rua do Imperador', distanciaM: 250, ... },
//  { tipo: 'curva', manobra: 'direita', texto: 'Vire à direita na Avenida Koeler', ... },
//  { tipo: 'chegada', texto: 'Você chegou: Ponto de apoio A', ... }]
```

Cada `Passo` tem `tipo` (`partida`, `siga`, `curva`, `travessia`, `chegada`), `manobra` (ou `null`), `texto`, `rua` (nome da via depois do passo, `null` se não tem), `distanciaM` (do ponto da manobra até o próximo passo), `acumuladaM` (desde o início da rede), `indiceNaLinha` (índice em `rota.pontos`), `ponto` e `avisos` (`ESCADA`, `TRILHA`, `PONTE`, `TUNEL`).

**Regras**

1. Trechos consecutivos com o mesmo nome (comparação sem acento, maiúsculas e espaços repetidos) e as mesmas marcas de ponte, escada e túnel viram uma unidade. Way sem nome só agrupa com outro sem nome **da mesma classe**.
2. O ângulo de cada junção é o rumo médio dos primeiros 15 m de quem sai menos o dos últimos 15 m de quem chega (se há menos de 15 m, usa o que existir). Positivo = direita, em (-180, 180].
3. Há um passo quando: há manobra (|Δ| >= 25), o nome muda mesmo em frente ("Continue pela Rua Y") ou começa/termina ponte, escada ou túnel (`travessia`). Nunca há "em frente" sem mudança de nome.
4. Manobras separadas por menos de 15 m viram uma só (os ângulos somam e a manobra é reclassificada). Dois "continue" a menos de 15 m um do outro também: fica o segundo.
5. Encaixe da origem maior que 30 m: primeiro passo "Vá até a Rua X (50 m)". Encaixe do destino maior que 30 m: "O destino fica a 50 m da Rua X" antes da chegada. Esses dois passos levam o próprio encaixe em `distanciaM`; a soma das `distanciaM` dos demais passos é `distanciaRedeM` (tolerância de 1 m).

| \|Δ\| (graus) | Manobra   | Texto                                                                               |
| ------------- | --------- | ----------------------------------------------------------------------------------- |
| menos de 25   | em frente | só se o nome muda: "Continue pela Rua Y"                                            |
| 25 a 60       | leve      | "Vire levemente à direita/esquerda na Rua X" (sem nome: "Siga levemente à direita") |
| 60 a 120      | normal    | "Vire à direita/esquerda na Rua X"                                                  |
| 120 a 160     | fechada   | "Faça a curva fechada à direita/esquerda na Rua X"                                  |
| mais de 160   | retorno   | "Retorne e siga pela Rua X"                                                         |

Os limites são fechados no menor valor (25 já é leve; 60 já é normal) e o retorno começa acima de 160.

**Textos.** Partida: "Siga para o norte pela Rua do Imperador" (oito pontos cardeais pelo rumo inicial). Ponte: "Atravesse a ponte"; escada: "Pegue a escadaria"; túnel: "Siga pelo túnel"; no fim deles, "Continue pela Rua Y". Sem nome, descreve pela classe: `footway` "passagem de pedestres", `steps` "escadaria", `path` e `track` "caminho", `service` "via de serviço", o resto "via".

**Curva em via sem nome** não diz "na via": curva leve vira "Siga levemente à esquerda", normal vira "Vire à direita" e fechada, "Faça a curva fechada à direita". Os textos de "siga" e "continue" continuam com a descrição pela classe ("Continue pela passagem de pedestres"), e o retorno também ("Retorne e siga pela passagem de pedestres").

**Preposições.** Vêm da primeira palavra do nome, sem acento e sem diferença de maiúsculas ("PRAÇA", "Praça" e "praca" são iguais), numa **tabela única**, `TIPOS_DE_VIA` em `src/textos.ts` (será revisada com a equipe; incluir um tipo é uma linha):

| Gênero         | Forma                   | Primeira palavra                                                                                                                                                             |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feminino       | na, pela, à ("da", "a") | Rua, Avenida, Travessa, Alameda, Estrada, Praça, Ladeira, Servidão, Rodovia, Via, Passarela, Ponte, Vila, Viela, Vereda, Trilha, Passagem, Escadaria, Rampa, Marginal, Linha |
| Masculino      | no, pelo ("do", "o")    | Beco, Caminho, Largo, Viaduto, Túnel, Parque, Jardim, Acesso, Corredor, Pátio, Morro, Campo                                                                                  |
| Qualquer outro | em, por                 | "em Condomínio Chácara Flora", "por Bosque dos Namorados"                                                                                                                    |

Só a primeira palavra conta: "Bosque da Rua Alta" e "Ruas Unidas" não casam com "Rua".

**Travessia curta.** Um passo de `travessia` com menos de 15 m até o passo seguinte (por exemplo "Atravesse a ponte" logo seguido de "Continue pela Praça...") é **fundido no seguinte**: o texto do seguinte permanece, os avisos se somam e a distância dele passa para o passo anterior, então a soma das `distanciaM` continua igual a `distanciaRedeM`. Exceção: o último passo antes da chegada fica. A regra de manobras a menos de 15 m continua valendo.

Utilitários exportados: `formatarDistancia` (menos de 100 m arredonda a 5 m; até 1000 m, a 10 m; acima, "1,2 km"), `formatarDuracao` ("menos de 1 min", "12 min a pé", "1 h 05 min") e `rumoCardeal(graus)`.

### `acompanhar(rota, passos, posicao, estado?, opcoes?)`

Função **pura**: recebe a posição do GPS e o estado devolvido na chamada anterior, e devolve `{ estado, passoAtualIndice, distanciaAtePassoM, distanciaRestanteM, distanciaDaRotaM, foraDaRota, chegou }`.

- A posição é projetada na polilinha **só numa janela à frente do progresso** (250 m), para não saltar para um trecho paralelo ou um laço da rota; em empate prático vale o ponto que vem primeiro. O progresso guardado nunca diminui, e a busca começa até 20 m antes dele (ruído de GPS).
- `foraDaRota`: `distanciaDaRotaM` acima de 30 m em 3 amostras **seguidas** (o estado guarda o contador); volta ao normal com menos de 20 m. `chegou`: a menos de 25 m do destino.
- `passoAtualIndice` é o último passo já iniciado; `distanciaAtePassoM` é a distância até o início do passo seguinte (a próxima manobra, é o que a tela anuncia).
- O primeiro `estado` é `ESTADO_INICIAL` (ou omitido). Se a tela reposicionar a pessoa longe do progresso guardado, passe um estado novo.
- Não recalcula a rota: quando `foraDaRota`, a tela chama `rotear` de novo.

### Limitações

- **Rotatórias não são reconhecidas**: viram curvas comuns ("Vire à direita na Rua X" seguido de outras curvas).
- **O texto das preposições é heurístico**: depende da primeira palavra do nome. Nomes fora das listas usam "em" e "por", e podem soar estranhos.
- Os nomes vêm do OSM como estão (ruas sem nome viram "via", "caminho" etc.), e trechos muito curtos de ponte ou escada geram passos curtos.
- Dois "continue" seguidos continuam possíveis quando as ruas são diferentes e distantes (é intencional: a rua mudou).
- Não há voz, recálculo nem leitura de rios ou estações aqui.

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
pnpm --filter @aquascan/roteamento test
```

Sem rede. Cobrem: encaixe (sobre a aresta, ao lado, perto de um nó, além do limite, e contra uma busca por força bruta); rotas em grafos feitos à mão (caminho único, dois caminhos, multiplicadores 3 e 1000, `Infinity` com e sem alternativa, mesma aresta nos dois sentidos, origem igual ao destino, ilhas, junções sem vértices repetidos, sentido inverso, sentido único); validação das entradas; a guarda de plataforma; e a comparação com um **Dijkstra ingênuo** (dentro do teste) em grades aleatórias de 30×30, com 300 pares e multiplicadores aleatórios (inclusive `Infinity`), exigindo custo **igual**. Para as instruções: curvas de 90 graus (direita e esquerda), T e X, curva leve, fechada e retorno, nomes iguais e diferentes em frente, trechos unificados, manobras a menos de 15 m, ponte, escada, túnel e trilha, cada classe sem nome, encaixes grandes e pequenos, os oito pontos cardeais e suas fronteiras, formatação de distância e duração, preposições por tipo de nome e as invariantes (soma das distâncias e índices crescentes). Para o acompanhamento: caminhada com ruído de 8 m (PRNG semeado) que termina em `chegou` sem nunca marcar `foraDaRota`, desvio de 100 m (só na terceira amostra), rota que passa duas vezes perto do mesmo ponto e GPS que recua 15 m. Se `tools/grafo/saida/grafo-petropolis.json` existir, o grafo real também é conferido (e 300 pares aleatórios têm as invariantes das instruções verificadas) (200 pares sem `sem_caminho`, e 100 com multiplicadores); sem o arquivo (como no CI), essa parte é pulada.

## O que este pacote ainda não faz

Voz, recálculo automático da rota, rotatórias, leitura do estado dos rios (quem calcula os multiplicadores é o chamador) e formato binário do grafo (o JSON basta por enquanto).
