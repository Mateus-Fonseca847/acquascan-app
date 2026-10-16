# Decisões de projeto

Registro das decisões que mudam o rumo do projeto, com o porquê e o que foi descartado. Quem entrar depois deve conseguir entender "por que é assim" sem perguntar.

> Nota: este arquivo é novo. Outras decisões já tomadas (por exemplo, guardar as coordenadas em colunas comuns e montar o ponto do PostGIS na hora, citada em `apps/api/prisma/schema.prisma`) ainda não foram registradas aqui.

## Rotear a pé no celular, com A\* próprio e multiplicadores

**Data:** 16/10/2026. **Status:** adotada. **Onde:** [`packages/roteamento`](../packages/roteamento/README.md), que usa o grafo de [`tools/grafo`](../tools/grafo/README.md).

### Contexto

O app precisa mostrar o caminho a pé até um ponto de apoio e, no futuro, **desviar de rios em estado crítico**. A rota será usada justamente em situações de chuva forte, quando a internet móvel pode falhar, e o desvio depende do estado dos rios, que muda a cada minuto.

### Decisão

Calcular a rota **no próprio celular**, com um **A\* escrito no projeto** (`@acquascan/roteamento`) sobre um grafo de ruas gerado a partir do OpenStreetMap. O estado dos rios entra como **multiplicadores de custo por aresta** (`>= 1`, `Infinity` bloqueia): o roteador soma `comprimento × multiplicador`, devolve o multiplicador usado em cada trecho e **não decide política de segurança**; quem chama calcula a exposição.

### Alternativas consideradas

| Alternativa                                                           | Por que não                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serviço externo de rotas (OSRM, OpenRouteService, Google e similares) | Exige internet no pior momento; manda a localização da pessoa a terceiros; costuma ter limites de uso e custo; e raramente aceita custos por aresta nossos      |
| Calcular a rota na API do AcquaScan                                   | Também exige internet, e a API passaria a ser um ponto único de falha justo no desastre                                                                         |
| Biblioteca de grafos/rotas de terceiros                               | Dependência pesada para uma tarefa pequena; mais difícil de garantir que roda no Hermes e de controlar o custo por aresta                                       |
| Dijkstra em vez de A\*                                                | Funciona, mas expande ~3 vezes mais nós no grafo real; ele fica no pacote só como referência de teste                                                           |
| Bloquear de vez (`Infinity`) as ruas de risco                         | Deixa a pessoa **sem rota** se já estiver dentro da zona de risco. Por isso o contrato prevê valores enormes (ex.: 1000), que quase bloqueiam mas mantêm a rota |

### Consequências

- **Offline e privado:** nada sai do aparelho. O custo é distribuir o grafo com o app (hoje um JSON de 1,9 MB, 344 KB com gzip) e mantê-lo atualizado.
- **Dados do OSM:** o grafo é uma base derivada, com obrigações da licença ODbL. Veja [creditos-dados.md](creditos-dados.md); a equipe deve confirmá-las antes de publicar.
- **Código a manter:** o A\* é nosso. Em troca, é pequeno, sem dependências, roda no Node e no Hermes (há um teste que impede o uso de APIs do Node) e é conferido contra um Dijkstra de referência, inclusive no grafo real.
- **Cuidados com os multiplicadores:** penalizar demais pode forçar desvios enormes. Na medição com 1000 em todas as ruas `primary`, a metade dos pares mudou de caminho e o acréscimo médio foi de ~4 km, porque essas vias costumam ser as pontes e ligações entre bairros. Os multiplicadores devem valer só para as arestas realmente expostas ao rio.
- **Ainda não decidido:** formato final do grafo (binário ou JSON), onde distribuí-lo e como atualizá-lo; as instruções de curva; e a regra que transforma o estado dos rios em multiplicadores.

## Política de desvio de rios

**Data:** 16/10/2026. **Status:** adotada como **provisória**. **Onde:** [`packages/desvio`](../packages/desvio/README.md).

> **Os números abaixo são PROVISÓRIOS e precisam ser validados com a Defesa Civil** antes de qualquer uso real. Foram escolhidos olhando medições com os dados de Petrópolis, não critérios técnicos de risco.

### Contexto

O roteador não decide segurança: só soma `comprimento × multiplicador`. Faltava a regra que junta o estado das estações, a exposição das ruas aos rios e o roteador para recomendar a rota mais segura, e que fosse consistente com o que o mapa mostra.

### Decisão

Um pacote de lógica pura, `@acquascan/desvio`. **Princípio: o que o mapa mostra em vermelho é exatamente o que a rota evita**, então há uma única função, `estadoDosSegmentos`, para colorir o mapa e montar os multiplicadores. Cada trecho de rio é governado pela estação mais próxima do mesmo rio dentro de `distanciaTrechoM`; sem estação por perto, o trecho é "sem monitoramento" e não recebe desvio. Estado ruim antigo é mantido por **falha segura**. O desvio usa duas passadas: a estrita bloqueia as travessias de rio crítico; se não houver rota, a de reserva as permite com penalidade (`menos_exposta`).

| Constante                    | Valor                                  |
| ---------------------------- | -------------------------------------- |
| `distanciaTrechoM`           | 1000 m                                 |
| `critico`                    | faixa 50 m, `k` 49, bloqueia travessia |
| `atencao`                    | faixa 15 m, `k` 3, não bloqueia        |
| `frescoMin`                  | 20 min                                 |
| `retencaoH`                  | 6 h                                    |
| `larguraTravessiaM`          | 60 m                                   |
| `limiarExposicaoM`           | 50 m                                   |
| `diferencaMostrarMaisCurtaM` | 100 m                                  |
| `pesoExposicaoNoRanking`     | 10                                     |

### Alternativas consideradas

| Alternativa                                           | Por que não                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bloquear sempre as ruas junto ao rio                  | Deixa a pessoa sem rota quando já está na zona de risco ou quando só há uma ponte. Por isso existe a passada de reserva              |
| Somar as penalidades de rios diferentes na mesma rua  | Uma rua junto de dois rios não é duas vezes mais perigosa; vale o máximo                                                             |
| Tratar "sem leitura" como estável                     | Esconderia o perigo justo quando a estação parou. Estado ruim antigo é mantido por 6 h; o que não se sabe é sinalizado, não ignorado |
| Calcular o estado do mapa e o do desvio separadamente | Poderia mostrar um rio verde e a rota desviar dele (ou o contrário). Daí a fonte única                                               |

### Consequências

- **Só os rios monitorados são evitados.** Com estações hipotéticas, 3 estações a 1000 m cobrem ~13 de 24 km de rio. A cobertura depende de onde as estações forem de fato instaladas.
- **Desvios podem ser longos** quando a única alternativa é uma ponte distante (no experimento, o pior caso passou de 20 km). O app deve mostrar a rota mais curta quando ela for bem mais exposta e deixar a pessoa decidir.
- Os valores acima precisam ser validados com a Defesa Civil; mudar um valor é trocar uma constante em `politica.ts` (ou passar a política parcial a `criarDesvio`).
- Ficam fora: terreno e relevo, deslizamentos, vias interditadas e rios sem estação.
