# Créditos e licenças dos dados

Este documento lista de onde vêm os dados de terceiros usados pelo AquaScan e o que cada licença exige. **Não é aconselhamento jurídico**: a equipe deve confirmar as obrigações abaixo (de preferência com quem entende de licenças) antes de distribuir qualquer coisa.

## OpenStreetMap

O grafo de ruas a pé ([`tools/grafo`](../tools/grafo/README.md)) é construído com dados do OpenStreetMap, obtidos pela Overpass API.

**Atribuição obrigatória:**

> © colaboradores do OpenStreetMap

Com o link para <https://www.openstreetmap.org/copyright>. A atribuição deve aparecer onde os dados (ou mapas e rotas feitos com eles) são mostrados: na tela do mapa e de rotas do app, e na documentação.

### Licença: ODbL

Os dados do OpenStreetMap são licenciados sob a [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Em resumo (resumo, não o texto da licença):

- **Atribuição:** é preciso creditar o OpenStreetMap e seus colaboradores, como acima.
- **Compartilhamento pela mesma licença (_share-alike_):** se a equipe criar e **distribuir** uma _base de dados derivada_ do OSM, essa base derivada precisa continuar aberta, sob a ODbL.
- **Manter aberto:** a licença também pede que a base derivada seja oferecida ou mantida aberta, e não apenas protegida por restrições técnicas ou contratuais que impeçam seu uso.

### Hidrografia (rios)

Os rios também vêm do OpenStreetMap (`waterway` e relações de rio, pela Overpass API), extraídos por `pnpm grafo:rios`. Valem as mesmas regras: **atribuição "© colaboradores do OpenStreetMap"** e **ODbL**. O GeoJSON dos rios (`rios-petropolis.geojson`) também é uma base derivada (extraída, filtrada pelos rios alvo e com a geometria simplificada), e o mesmo vale para o arquivo de **exposição** (`exposicao-petropolis.json`), que cruza rios e ruas, os dois do OSM: a equipe deve tratá-lo como derivado do OSM até confirmar o contrário, e manter a atribuição.

### O que isso significa para o grafo

O arquivo `grafo-petropolis.json` é uma **base derivada** do OSM: ele é extraído, filtrado (só o que é caminhável), reorganizado (nós, arestas, geometria simplificada) e acrescido de comprimentos calculados. Isso não é só "mostrar um mapa". Portanto:

1. **Atribuição:** o grafo (e o GeoJSON dos rios), e o app que os usa, devem creditar "© colaboradores do OpenStreetMap".
2. **Se o grafo for distribuído** (por exemplo, embutido no app ou baixado por ele), a equipe deve esperar que **a base derivada distribuída precise continuar aberta sob a ODbL**, com a indicação de que vem do OSM. Convém publicar o arquivo (ou a ferramenta e as instruções para reproduzi-lo) e deixar a licença explícita junto dele.
3. **As rotas mostradas ao usuário** (o caminho desenhado no mapa) tendem a ser um _trabalho produzido_ (_produced work_) a partir da base: costumam exigir só a atribuição, não a abertura. A fronteira entre os dois casos é justamente o ponto a confirmar.
4. **Dados próprios misturados à base** (por exemplo, o estado dos rios ou os pontos de apoio) podem ou não ser tratados como parte da base derivada, dependendo de como forem combinados. Convém **manter os dados do AquaScan em camadas separadas** do grafo do OSM até esse ponto ser confirmado.

**A equipe deve confirmar** estas leituras antes de publicar o app ou o grafo. Se houver dúvida, o [guia da comunidade OSM sobre a licença](https://wiki.osmfoundation.org/wiki/Licence/Community_Guidelines) e o texto da própria ODbL são as fontes.

### Uso responsável da Overpass API

O grafo é baixado de uma Overpass API pública, um serviço comunitário. A ferramenta faz **uma consulta por execução, com cache em disco**, identifica-se com o `User-Agent` `acquascan-grafo/1.0 (projeto acadêmico)` e limita as novas tentativas. Não use a API pública para consultas repetidas, em laço ou a pedido do usuário final; para isso, use uma extração local (por exemplo, do Geofabrik) ou o próprio arquivo já gerado.

## Outras fontes

| Dado              | Fonte      | Observação                                                                                       |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Previsão de chuva | Open-Meteo | A API usa a Open-Meteo. Confira os termos e a atribuição em <https://open-meteo.com/en/license>. |

Se uma fonte nova entrar no projeto (mapa de fundo, elevação, dados oficiais da Defesa Civil), registre-a aqui com a licença e a atribuição exigida.
