# Grafo de ruas a pé

Constrói, a partir do OpenStreetMap, o **grafo de ruas a pé de Petrópolis**: a base do roteamento offline do app. A ideia é o app calcular rotas no próprio celular e desviar de rios em estado crítico. Esta etapa é **só dados**: a ferramenta não mexe na API, no app nem no banco.

```bash
pnpm grafo:construir                 # na raiz; usa o cache se já houver download
pnpm grafo:construir -- --atualizar  # baixa de novo da Overpass
```

Saída (ignorada pelo git por enquanto: o formato final e onde distribuir ainda serão decididos):

| Arquivo                                   | O que é                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `tools/grafo/saida/grafo-petropolis.json` | O grafo                                        |
| `tools/grafo/saida/relatorio.md`          | Tamanhos, contagens e o que foi descartado     |
| `tools/grafo/cache/overpass-<hash>.json`  | Resposta bruta da Overpass (cache do download) |

Os dados são do OpenStreetMap, **© colaboradores do OpenStreetMap**, sob a licença ODbL. Leia [docs/creditos-dados.md](../../docs/creditos-dados.md) antes de distribuir o grafo.

## Como funciona

```
Overpass API ──(1 consulta, com cache)──▶ JSON bruto ──▶ caminhavel ──▶ construir ──▶ grafo-petropolis.json
```

| Arquivo             | Papel                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| `src/config.ts`     | Caixa geográfica (bbox), endereço da Overpass, User-Agent e tolerância da simplificação |
| `src/baixar.ts`     | A consulta à Overpass, as tentativas e o cache em disco                                 |
| `src/caminhavel.ts` | **A tabela de decisões** do que é caminhável a pé (abaixo)                              |
| `src/construir.ts`  | Monta o grafo: nós, arestas, geometria, flags e maior componente conexo (lógica pura)   |
| `src/geo.ts`        | Haversine e Douglas-Peucker, escritos aqui (sem dependências)                           |
| `src/relatorio.ts`  | Métricas e o texto do relatório                                                         |
| `src/main.ts`       | Orquestra tudo e grava os arquivos                                                      |

Só `baixar.ts` usa rede e só `main.ts` grava a saída; o resto é lógica pura, testada em memória (`pnpm --filter @acquascan/grafo test`, sem rede).

## O download e o cache

- É **uma única consulta** à [Overpass API](https://overpass-api.de/) pública (`https://overpass-api.de/api/interpreter`), que pede todos os ways `highway` dentro da bbox e, pela recursão `>`, os nós de cada um (`out body`, formato JSON).
- A API pública é um recurso comunitário: a ferramenta **nunca consulta em laço nem sem cache**. A primeira execução baixa (cerca de 6 MB para Petrópolis, em menos de um minuto); as seguintes só leem `tools/grafo/cache/`.
- Identifica-se com o `User-Agent` `acquascan-grafo/1.0 (projeto acadêmico)`, tem tempo limite e, se falhar por rede, 429 ou 5xx, faz **no máximo 2 novas tentativas** (esperas de 5 s e 10 s). Outro 4xx (consulta recusada) não é repetido.
- A Overpass às vezes responde 200 com um aviso de erro e dados **parciais** (por exemplo, consulta que estourou o tempo). Isso é tratado como falha e **nunca vai para o cache**.
- O nome do arquivo de cache vem de um hash da consulta: mudar a bbox usa outro arquivo e baixa de novo sozinho. Para forçar um novo download com a mesma bbox, use `--atualizar`. Para limpar tudo, apague a pasta `cache/`.

## Como ajustar a bbox

A caixa fica em `src/config.ts` (`BBOX_PETROPOLIS`), na ordem **sul, oeste, norte, leste**, em graus decimais. O padrão (`-22.56, -43.26, -22.45, -43.12`) é **aproximado** e deve ser ajustado ao mapa:

1. Abra [openstreetmap.org](https://www.openstreetmap.org), centralize na área que o app deve cobrir e use "Exportar" para ver as coordenadas dos quatro cantos (ou clique com o botão direito e "Mostrar endereço" em cada canto).
2. Confira se os bairros e as estações de rio que o app atende ficam dentro da caixa.
3. Altere os quatro números, rode `pnpm grafo:construir` e leia o relatório.

Quanto maior a caixa, maior o download e maior o arquivo que irá para o celular. Duas coisas para saber:

- A Overpass devolve os ways **inteiros** que tocam a caixa, então alguns nós (e trilhas longas) ficam um pouco **fora** dela. O grafo não é cortado na borda.
- Caixas muito grandes (a região serrana toda, por exemplo) podem estourar o tempo ou o limite da Overpass pública. Se acontecer, divida a área ou use uma extração do Geofabrik.

## O que é caminhável (tabela de decisões)

Esta tabela está no topo de `src/caminhavel.ts` e **será revisada com a equipe**: cada linha é uma decisão de projeto. As regras valem na ordem; a primeira que bate decide.

| #   | Regra                                                                                                 | Resultado                              |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Way sem tag `highway`                                                                                 | Não                                    |
| 2   | `highway` = `motorway`, `motorway_link`, `trunk`, `trunk_link`, `construction`, `proposed`, `raceway` | Não (sempre; nem `foot=yes` muda)      |
| 3   | `highway` fora da lista de incluídas (ex.: `bridleway`, `platform`, `bus_guideway`, `road`)           | Não                                    |
| 4   | `area=yes`                                                                                            | Não (é polígono, não um caminho)       |
| 5   | `foot=no`                                                                                             | Não                                    |
| 6   | `foot=yes`, `designated` ou `permissive`                                                              | **Sim**, mesmo com `access=no/private` |
| 7   | `access=no` ou `access=private`                                                                       | Não                                    |
| 8   | Qualquer outro caso                                                                                   | Sim                                    |

**Classes incluídas:** `footway`, `path`, `pedestrian`, `steps`, `residential`, `living_street`, `service`, `unclassified`, `tertiary`, `secondary`, `primary`, `track`, `cycleway`, `corridor` e os `*_link` de `tertiary`, `secondary` e `primary`.

**`oneway` é ignorado**: o pedestre anda nos dois sentidos. A única exceção é `oneway:foot=yes` (aresta só de `de` para `para`) ou `oneway:foot=-1` (só no sentido contrário ao desenho do way), marcada como `sentidoUnico` na aresta. Na área de Petrópolis, nenhuma aresta tem isso hoje.

Pontos que merecem a atenção da equipe na revisão:

- `service` entra inteira, incluindo acessos de garagem e vias de estacionamento. Pode criar atalhos por dentro de lotes.
- `primary` e `secondary` entram porque muitas vezes são a única ligação entre bairros, mas nem sempre têm calçada.
- `foot=permissive` não estava na especificação (`yes` e `designated`); foi tratado como `yes`.
- `trunk` e `motorway` são sempre excluídas, mesmo que um trecho permita pedestres (`foot=yes`).
- Trilhas (`path`, `track`) entram, e algumas são muito longas e íngremes. O grafo ainda **não tem elevação nem declividade**.

## O que o grafo contém

- **Nós:** interseções (nó que aparece em 2 ou mais ways caminháveis) e pontas de way. Os nós do meio de uma rua viram a **geometria** da aresta, não nós.
- **Arestas:** ligam dois nós. Cada uma tem o comprimento real em metros (haversine somado sobre a polilinha **original**), a geometria simplificada com Douglas-Peucker (tolerância de 3 m), o nome da rua (se houver), a classe (`highway`) e as marcas `escada`, `ponte` e `tunel`.
- **Escadas e pontes não são descartadas**, só marcadas, para o roteamento decidir. `ponte` vale para qualquer `bridge` diferente de `no` (`yes`, `viaduct`...), e `tunel` para qualquer `tunnel` diferente de `no`.
- **Só o maior componente conexo** é mantido. Trechos soltos (ilhas) são descartados, e o relatório diz quantos nós e arestas ficaram de fora.

### Formato do JSON

```jsonc
{
  "versao": 1,
  "nos": [{ "id": 123456, "lat": -22.505123, "lon": -43.178611 }], // id = id do nó no OSM
  "arestas": [
    {
      "de": 0, // índice em "nos"
      "para": 1, // índice em "nos"
      "comprimentoM": 154.5,
      "geometria": [
        [-22.505123, -43.178611],
        [-22.5062, -43.1789],
      ], // [lat, lon], com as duas pontas
      "nome": "Avenida Ipiranga", // só se houver
      "classe": "secondary",
      "escada": false,
      "ponte": false,
      "tunel": false,
      "sentidoUnico": true, // só quando oneway:foot; senão a aresta vale nos dois sentidos
    },
  ],
}
```

Coordenadas com 6 casas decimais (cerca de 0,1 m). O formato é **provisório**: ainda vamos decidir o formato final e onde distribuir o arquivo.

## Primeira execução (Petrópolis, 16/10/2026)

| Medida                           | Valor                                     |
| -------------------------------- | ----------------------------------------- |
| Download bruto                   | 6,09 MB                                   |
| Nós / arestas (maior componente) | 6.329 / 7.219 (descartados 5,35% / 4,16%) |
| Malha                            | 782,7 km                                  |
| Escadas / pontes / túneis        | 157 / 246 / 6                             |
| JSON de saída                    | 1,90 MB (343,6 KB com gzip)               |

O relatório completo de cada execução fica em `tools/grafo/saida/relatorio.md`. Para a revisão dos dados, os números a olhar são a porcentagem descartada, a contagem de arestas por classe e as arestas muito longas (trilhas sem interseção).

## Rios (hidrografia)

Segunda etapa de dados do **desvio de rios em estado crítico**: extrai do OpenStreetMap os rios que interessam, para depois cruzá-los com o grafo de ruas. Esta etapa é só dados; não há estado de rio nem roteamento aqui.

```bash
pnpm grafo:rios                  # na raiz; usa o cache se já houver download
pnpm grafo:rios -- --atualizar   # baixa de novo da Overpass
```

| Arquivo                                     | O que é                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `tools/grafo/saida/rios-petropolis.geojson` | Um `Feature` `LineString` por segmento dos **rios alvo**           |
| `tools/grafo/saida/relatorio-rios.md`       | Todos os waterways nomeados, o resumo de cada rio alvo e o GeoJSON |
| `tools/grafo/cache/rios-<hash>.json`        | Resposta bruta da Overpass (cache; separado do das ruas)           |

Saída e cache ficam fora do git, como o grafo de ruas. O comando de ruas (`pnpm grafo:construir`) **não muda**.

### Rios alvo

A lista fica em `RIOS_ALVO` (`src/config.ts`) e hoje é `['Piabanha', 'Quitandinha']`. Só esses rios vão para o GeoJSON; os demais aparecem **apenas no relatório** (seção 1, com a coluna "Alvo"), para a equipe escolher quais entram. Para incluir um rio, acrescente o nome na lista e rode de novo (o cache é reaproveitado, não baixa nada).

A comparação é por **igualdade do nome normalizado** (minúsculas, sem acento e sem o prefixo `rio `), nunca por "contém": `Rio Piabanha`, `Piabanha` e `RIO PIABANHÁ` são o mesmo rio, e `Rio Quitandinha do Sul` não é o Quitandinha. A consequência é que **grafias diferentes no OSM ficam de fora**, a menos que estejam em `ALIASES_RIOS` (`src/config.ts`): `pirabanha` vale como Piabanha e `quintandinha` como Quitandinha, erros de digitação que apareceram na primeira execução. Esses segmentos entram com `alias: true`, e o relatório lista cada um (way e nome original) para a equipe **corrigir o `name` no OpenStreetMap**.

**Ways sem nome que se ligam ao rio** também entram: um way de rio sem nome que compartilha um nó com um segmento do rio alvo é absorvido (e, em cadeia, o que se liga a ele), com `inferido: true`. Só se encadeia por ways **sem nome**: um way com outro nome nunca é absorvido, nem serve de ponte para chegar a outro. O relatório lista cada um para conferência no mapa. Se um way sem nome toca dois rios alvo, vale o que vem primeiro em `RIOS_ALVO`.

**Ids dos segmentos:** cada segmento tem um `id` numérico sequencial, ordenado por rio (ordem alfabética) e depois por `osmWayId`. É estável para os mesmos dados do OSM, e é o id que a exposição usa. Se o OSM mudar (um rio novo, um way a mais), os ids podem mudar: regere a exposição junto.

### O que a consulta pede e como o nome é decidido

Uma única consulta à Overpass (com cache e as mesmas regras do download das ruas): (a) os ways com `waterway` = `river`, `stream`, `canal` ou `drain` na bbox e (b) as relações `type=waterway` com `name`, com seus ways membros e os nós de todos. Resposta parcial (200 com aviso de erro) é falha e nunca entra no cache.

Nome do way: a tag `name` do próprio way; se faltar, o `name` da relação a que ele pertence; senão, "sem nome". Ways inteiramente fora da bbox (membros distantes de uma relação) são ignorados.

### O que cada segmento tem

Cada way vira um segmento com: `osmWayId`, `rio` (o nome canônico da lista), `nomeOsm`, `waterway`, `coberto` (`tunnel=culvert` ou `yes`) com o valor bruto em `tunnel`, `canal` (`waterway=canal` ou `drain`), `comprimentoM` (calculado na geometria **original**) e a geometria simplificada (Douglas-Peucker, tolerância de 3 m). Propriedades de identificação: `id` (estável, veja abaixo), `alias` e `inferido`. Propriedades extras: `covered` (valor bruto da tag `covered`, só para conferência: **não** conta como coberto).

**Sentido do fluxo:** a geometria preserva a ordem do OSM, que é o sentido do fluxo, **a jusante** (da nascente para a foz). Nada inverte nem reordena os pontos, nem a simplificação. As coordenadas do GeoJSON seguem o padrão `[longitude, latitude]`.

### Conectividade e lacunas

Para cada rio alvo, os segmentos são agrupados em **componentes**: dois segmentos estão no mesmo componente se compartilham um nó que é ponta de pelo menos um deles (isso cobre a emenda ponta a ponta e a foz de um afluente no meio de outro trecho).

Uma **lacuna** é um par de pontas livres (nó que é ponta de um segmento e que nenhum outro segmento do rio usa) de componentes **diferentes** a menos de 30 m uma da outra (`DISTANCIA_LACUNA_M`): provável rio quebrado no OSM. **Nada é unido automaticamente**: o relatório só lista a distância, as coordenadas aproximadas e os dois ways, para alguém corrigir no OSM ou decidir o que fazer.

O relatório também lista os **ways sem nome** cuja ponta toca o rio alvo e que **não** foram absorvidos (com a absorção ligada, em geral nenhum).

### O que NÃO está coberto

- **Margens largas mapeadas como área** (`waterway=riverbank`, `natural=water`): só entram linhas; um rio largo mapeado como polígono não aparece, e o eixo dele pode estar fora da área real da água.
- **Rios não nomeados:** só entram os que têm nome (no way ou na relação). Os sem nome aparecem no relatório como contagem, não como geometria.
- **Outras grafias do mesmo nome** (veja acima) e rios cujo nome no OSM não bate com a lista.
- **Tipos fora de `river`, `stream`, `canal` e `drain`** (por exemplo, `ditch`).
- **`covered=yes`:** é registrado, mas só `tunnel` conta como coberto.
- **O OSM pode estar incompleto ou impreciso.** A hidrografia de Petrópolis tem trechos quebrados, e este extrato não tem nenhuma relação de rio com nome, então o nome depende de cada way. Não há larguras, cotas, nem o estado dos rios: esta etapa só entrega as linhas.

### Primeira execução (Petrópolis, 16/10/2026)

| Medida         | Valor                                           |
| -------------- | ----------------------------------------------- |
| Download bruto | 202 KB (136 ways waterway, 0 relações com nome) |
| Piabanha       | 17,01 km, 18 segmentos, 3 componentes, 1 lacuna |
| Quitandinha    | 7,35 km, 23 segmentos, 1 componente, 0 lacunas  |
| GeoJSON        | 22 KB (3,9 KB com gzip)                         |

Antes dos aliases e da absorção, o Piabanha tinha 7 componentes e 5 lacunas, e o Quitandinha, 3 componentes e 2 lacunas. Entraram por alias 4 ways do Piabanha (`Rio Pirabanha`) e 2 do Quitandinha (`Rio Quintandinha`), e por inferência 3 do Piabanha e 1 do Quitandinha. Resta uma lacuna de 22 m no Piabanha (ways 308553220 e 308553222). O relatório completo está em `tools/grafo/saida/relatorio-rios.md`.

## Exposição das ruas aos rios

Terceira etapa de dados do desvio de rios: para **cada rua do grafo** (aresta) e **cada segmento de rio alvo**, mede o quanto a rua cruza o rio ou corre junto dele. É estático (calculado uma vez); o **estado dos rios** (dinâmico) entra depois, na política de desvio. Sem rede.

```bash
pnpm grafo:exposicao             # na raiz; precisa dos dois comandos anteriores
```

Entrada: `saida/grafo-petropolis.json` (`pnpm grafo:construir`) e `saida/rios-petropolis.geojson` (`pnpm grafo:rios`). Se faltar algum, o comando para com uma mensagem dizendo qual rodar; se o GeoJSON for de uma versão antiga (sem `id` nos segmentos), manda rodar `pnpm grafo:rios` de novo. A análise de cobertura usa também o cache bruto da Overpass dos rios (`cache/rios-<hash>.json`); sem ele, só essa seção do relatório é pulada.

Saída (fora do git): `saida/exposicao-petropolis.json` e `saida/relatorio-exposicao.md`.

### O que é calculado

Para cada par (aresta, segmento) guarda-se:

| Campo               | Significado                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cruza`             | A geometria da rua cruza a do segmento (interseção de segmentos), **ou encosta nela a até 0,5 m** (`TOLERANCIA_TOQUE_M`: toques nas pontas). A aresta já traz as marcas de ponte e túnel. |
| `distMinM`          | A menor distância entre as duas geometrias, em metros.                                                                                                                                    |
| `f15`, `f30`, `f50` | A **fração do comprimento da rua** que fica a até 15, 30 e 50 m desse segmento (as faixas incluem as anteriores).                                                                         |

Só ficam os pares com `cruza` verdadeiro ou `f50 > 0`. Uma grade espacial evita comparar tudo com tudo.

### Como as frações são medidas (amostragem)

A geometria da rua é **amostrada a cada 5 m** ao longo da polilinha, incluindo os dois extremos. Cada amostra representa o pedaço da rua em volta dela (regra do ponto médio, então uma rua toda exposta dá exatamente 1) e é **atribuída ao segmento de rio MAIS PRÓXIMO** dela, se estiver a até 50 m. Por isso as frações dos vários segmentos de uma mesma rua **nunca somam mais que 1**, e dá para somar a exposição de vários segmentos (ou rios) sem contar duas vezes. A amostragem tem um erro de alguns por cento em ruas curtas (uma amostra a mais ou a menos na borda de uma faixa). As distâncias usam uma projeção plana local (erro abaixo de 0,2% nesta escala, conferido nos testes contra o haversine).

### Formato do `exposicao-petropolis.json`

Compacto de propósito (vai para o celular):

```jsonc
{
  "versao": 1,
  "geradoEm": "2026-10-16T16:40:53.013Z",
  "grafo": { "nos": 6329, "arestas": 7219, "sha256": "bd36d6f1..." }, // do arquivo do grafo usado
  "parametros": { "passoM": 5, "faixasM": [15, 30, 50] },
  "segmentos": [{ "id": 0, "rio": "Piabanha", "osmWayId": 11981006, "coberto": false }],
  "entradas": [[arestaId, segmentoId, cruza /* 0 ou 1 */, distMinM, f15, f30, f50]]
}
```

`arestaId` é o índice da aresta em `arestas` do grafo, e `segmentoId` é o `id` do segmento em `segmentos`. As distâncias são arredondadas a 0,1 m e as frações a 0,01. O **`sha256`** é o do arquivo `grafo-petropolis.json` usado: quem carregar a exposição deve conferir que o grafo é o mesmo, porque os `arestaId` só valem para ele (se o grafo for regerado, a exposição precisa ser regerada).

### O relatório

`relatorio-exposicao.md` traz: (1) por rio alvo, as arestas que cruzam e as de cada faixa, com o comprimento exposto em km e em % da malha; (2) o histograma da fração f30; (3) as arestas que cruzam rio sem serem ponte nem túnel (com coordenadas); (4) as pontes que cruzam, as que ficam perto sem cruzar e as sem rio perto; (5) os segmentos de rio com mais ruas associadas; (6) a **cobertura do monitoramento**; e (7) o tamanho do arquivo.

A **cobertura do monitoramento** refaz o cruzamento com **todos** os waterways do cache bruto (nomeados ou não, inclusive os que não são rios alvo): das ruas que cruzam algum waterway, que parte cruza rios alvo e que parte cruza **outros**. Os cruzamentos com outros rios **não terão desvio por estado de estação**, porque não há estação neles, e o app precisa dizer isso.

### Primeira execução (Petrópolis, 16/10/2026)

| Medida                                 | Valor                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| Segmentos de rio / entradas            | 41 / 1.198                                              |
| Ruas que cruzam um rio alvo            | 160 (Piabanha 62, Quitandinha 98)                       |
| Ruas até 15 / 30 / 50 m de um rio alvo | 772 / 971 / 1.102 (3,15% / 5,3% / 6,8% da malha, em km) |
| Ruas expostas com f30 de 90% a 100%    | 683 de 971 (70%): correm junto ao rio                   |
| Pontes que cruzam um rio alvo          | 140 de 246 (57%)                                        |
| Ruas que cruzam algum waterway         | 303: 160 em rios alvo e 143 (47%) SÓ em outros rios     |
| Arquivo                                | 31,8 KB (8,7 KB com gzip)                               |

### O que NÃO está coberto

- **Rios sem estação:** só os rios alvo entram. Quase metade das ruas que cruzam algum waterway cruza **outros** rios (o Rio Palatino, 87,7% coberto, lidera), e esses não terão desvio por estado de estação.
- **A distância ao rio é uma aproximação do alagamento.** Não considera o relevo: uma rua a 20 m do rio, mas bem acima dele, pode estar segura, e uma a 80 m, numa baixada, pode alagar. Também não há largura do rio, cota, nem histórico de cheias.
- **Rios cobertos:** a geometria de um rio em galeria (`tunnel=culvert`) é a do OSM e pode estar imprecisa; a exposição trata o segmento como qualquer outro (a marca `coberto` vai no arquivo para a política decidir).
- **O OSM pode estar incompleto** (trechos de rio faltando, lacunas, pontes não mapeadas) e as ruas amostradas são as do grafo a pé, não todas as vias.
- **Rios não nomeados e grafias não previstas** ficam de fora (veja "O que NÃO está coberto" dos rios).

## Testes

```bash
pnpm --filter @acquascan/grafo test
```

Sem rede, com fixtures mínimas em memória (ruas e rios): cada regra de inclusão e exclusão de `caminhavel`, haversine contra distâncias conhecidas, Douglas-Peucker (extremos mantidos, colineares removidos), compressão de nós de grau 2, interseção virando nó, descarte de ilhas, marcação de ponte e escada, `oneway:foot`, e o cache e as tentativas do download (com um `fetch` falso). Para os rios: normalização de nomes, igualdade exata (não "contém"), nome vindo da relação, flags `coberto` e `canal`, sentido preservado após simplificar, componentes e lacunas (20 m reportada, 100 m não), resposta parcial rejeitada, rio fora da lista só no relatório, e o relatório. Para a exposição: distância e interseção de segmentos (em X, toque na ponta, paralelas), o índice em grade contra a comparação de tudo com tudo, as frações (rua paralela a 10, 20 e 40 m do rio, rua que cruza em ângulo, rua meio exposta, amostra atribuída ao segmento mais próximo com soma menor ou igual a 1), o erro da projeção plana contra o haversine, os aliases e a absorção de ways sem nome (que nunca absorve way com outro nome), a estabilidade dos ids, o formato compacto do arquivo (com o sha256 do grafo), a cobertura e o relatório.
