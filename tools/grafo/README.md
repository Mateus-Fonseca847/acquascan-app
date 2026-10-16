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

## Testes

```bash
pnpm --filter @acquascan/grafo test
```

Sem rede, com uma fixture mínima em memória: cada regra de inclusão e exclusão de `caminhavel`, haversine contra distâncias conhecidas, Douglas-Peucker (extremos mantidos, colineares removidos), compressão de nós de grau 2, interseção virando nó, descarte de ilhas, marcação de ponte e escada, `oneway:foot`, e o cache e as tentativas do download (com um `fetch` falso).
