# Changelog

Todas as mudanças relevantes do aplicativo AcquaScan (API, app mobile, pacote compartilhado e simulador).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/). Mudanças ainda não lançadas ficam em **Não lançado**. Uma versão só recebe tag depois de validada em [docs/validacao.md](docs/validacao.md).

## [Não lançado]

### Alterado

- `tools/grafo`: `pnpm grafo:exposicao` passou a gravar `rios: { sha256 }` (hash do `rios-petropolis.geojson`) em `exposicao-petropolis.json`, para detectar rios e exposição de gerações diferentes. `tools/grafo` agora depende de `@acquascan/shared` (workspace)
- A normalização de nome de rio (`normalizarNome`) saiu de `tools/grafo/src/nomes.ts` para `@acquascan/shared` (`src/rios.ts`, com testes); `nomes.ts` reexporta a função e os comandos e testes do grafo seguem iguais

- Cadastro (RF01): o usuário escolhe a **cidade** (`cidadeId`, lista de `GET /cidades`) no lugar do CEP, no esquema de `@acquascan/shared`, na API e na tela do app. A tela agora envia o cadastro à API
- `usuarios.cidade_id` passou a ser obrigatório (migração `cadastro_por_cidade`)
- O log de cada requisição passa a trazer só método e caminho, sem host, IP nem query string (`lib/log.ts`). Antes o Fastify registrava `remoteAddress`, `remotePort` e a URL completa
- Erros de requisição causados pelo cliente que o próprio Fastify detecta (como JSON malformado) passam a responder 400 `Requisição inválida`, em vez de 500 com registro no log

### Corrigido

- Desvio de rios, cobertura: a unidade de monitoramento era o way inteiro do OSM, o que inflava os km "monitorados" (13,2 km para 3 estações a 1000 m; o real, com trechos, é 8,0 km). `pnpm grafo:rios` agora fatia os segmentos em **trechos de até 250 m** (`TRECHO_MAX_M`, `src/trechos.ts`), com `id` novo sequencial, `indice` e `comprimentoM`, e o relatório traz o número de trechos por rio (Piabanha 82, Quitandinha 45). `grafo:exposicao` registra `parametros.trechoMaxM` (1.346 entradas, 43,7 KB; 11,4 KB com gzip). É preciso regerar rios e exposição juntos
- Desvio de rios, exposição: o multiplicador e a exposição de uma rua usavam o **maior** valor entre as entradas, mas as frações de trechos diferentes são partes separadas da mesma rua (cada amostra pertence a um só trecho) e devem ser **somadas**. Agora `FC = min(1, Σ críticos)`, `FA = min(1, Σ atenção)` (com `FA ≤ 1 − FC`) e multiplicador `1 + 49 FC + 3 FA`; `exposicaoCriticaM` e `exposicaoAtencaoM` usam as mesmas frações. A especificação anterior é que estava errada. Aproximação documentada: a amostra vale para o trecho mais próximo
- Envio de push: quando um lote falhava de vez, cada rodada (a cada 30 s) reenviava todos os lotes do alerta por até 1 hora, duplicando notificações. Agora a API lembra, em memória, quais tokens o Expo já aceitou e reenvia só os que faltam, com no máximo 3 rodadas por alerta (depois para de tentar e avisa uma vez no log). Limitação: essa memória some quando a API reinicia, e então um alerta pendente é reenviado por inteiro

### Removido

- CEP, latitude e longitude do usuário: campos do cadastro, colunas `usuarios.cep`, `latitude` e `longitude` (apagadas na migração `cadastro_por_cidade`) e a consulta de CEP na BrasilAPI (`lib/cep.ts`), por minimização de dados (LGPD) e para o cadastro não depender de serviço externo
- Telefone do cadastro de usuário (campo no app, validação em `@acquascan/shared` e coluna `usuarios.telefone` via migração `remove_telefone_usuario`), por não ter finalidade e em respeito ao princípio da minimização da LGPD

### Adicionado

**Instruções de curva e acompanhamento** (`packages/roteamento`, quinta etapa do roteamento; só lógica pura, sem mudar API, app, banco, `packages/desvio` nem `tools/`)

- `gerarPassos(rota, atributos, { nomeDestino? })`: instruções em português ("Siga para o norte pela Rua X", "Vire à direita na Avenida Y", "Atravesse a ponte", "Você chegou: ..."), com ângulo pelo rumo médio de 15 m, agrupamento por nome, suavização de manobras a menos de 15 m, avisos `ESCADA`, `TRILHA`, `PONTE` e `TUNEL`, passos de encaixe maior que 30 m e preposição pelo tipo do nome
- `acompanhar(rota, passos, posicao, estado?, opcoes?)`: função pura que projeta o GPS numa janela de 250 m à frente do progresso, sem regredir, e informa passo atual, distâncias, `foraDaRota` (30 m em 3 amostras seguidas) e `chegou` (25 m)
- Utilitários `formatarDistancia`, `formatarDuracao` e `rumoCardeal`
- Testes sem rede com geometrias sintéticas e, se `tools/grafo/saida` existir, 300 pares no grafo real. Limitações: rotatórias viram curvas comuns e as preposições são heurísticas
  **Desvio de rios** (`packages/desvio`, quarta etapa do roteamento; só lógica pura, sem mudar API, app, banco nem `packages/roteamento`)

- Pacote `@acquascan/desvio`: `criarDesvio({ roteador, exposicao, rios }, estacoes, politica?)` valida os dados (erros em português) e oferece `estadosEfetivos`, `estadoDosSegmentos` (fonte única do mapa e do desvio), `rotear` (modos `sem_risco`, `segura` e `menos_exposta`, duas passadas, avisos), `escolherApoio` e `resumoCobertura`
- Política `POLITICA_PADRAO` com todas as constantes comentadas e marcadas como **PROVISÓRIAS** (validar com a Defesa Civil); **falha segura**: CRITICO e ATENCAO antigos valem por até 6 h
- Testes sem rede com mundos sintéticos, teste de propriedade (tudo ESTAVEL = rota normal), guarda de plataforma (sem Node em `src/`) e, se `tools/grafo/saida` existir, dados reais de Petrópolis
- Documentação: `packages/desvio/README.md`, decisão em `docs/decisoes.md` e fluxo em `docs/arquitetura.md`

**App: sessão**

- Login e cadastro de verdade no app (RF01 e RF02): `entrar`, `cadastrar`, `perfil` e `excluirConta` em `services/api.ts`, com tempo limite de 10 s, `ErroApi` com `status` e mensagem em português e o gancho `aoSessaoExpirar` (só em 401 de chamada autenticada)
- Sessão persistida no `expo-secure-store` (token, perfil em cache e "boas-vindas vistas"), provedor `useSessao()` com os estados `carregando`, `novo`, `visitante` e `logado`, e portão de navegação com `Stack.Protected`
- Tela de boas-vindas com "Entrar na minha conta", "Criar conta" e "Continuar sem conta"; o visitante usa mapa, previsão e apoio sem restrição
- Perfil mostra nome, e-mail e cidade e tem "Sair da conta" com confirmação
- Tipos `UsuarioResumo`, `LoginResposta` e `CadastroResposta` em `@acquascan/shared`
- O app continua logado, com o perfil em cache, quando abre sem internet; só um 401 encerra a sessão

**Estrutura**

- Monorepo com pnpm workspaces: `apps/api`, `apps/mobile`, `packages/shared` e `tools/simulador`
- Banco PostgreSQL + PostGIS via Docker Compose
- CI no GitHub Actions: formatação, verificação de tipos e testes
- Documentação: requisitos, arquitetura, banco de dados, API, decisões, privacidade, validação e solução de problemas

**Shared**

- Cálculo do nível (cm e %), classificação do estado e estimativa até o transbordamento
- Classificação provisória do risco de chuva
- Validações da leitura do ESP32, do cadastro e do login
- Limite de 128 caracteres para a senha no cadastro e no login
- 31 testes unitários

**API**

- `POST /leituras` com autenticação da estação por token (só o hash fica no banco)
- `GET /estacoes`, `GET /estacoes/:id` (com estimativa) e `GET /estacoes/:id/leituras`
- `GET /rios`, `GET /alertas` e registro automático de alerta quando o estado piora
- `GET /pontos-apoio`, com ordenação por distância via PostGIS quando recebe `lat` e `lng`
- `GET /previsao` com os próximos 7 dias via Open-Meteo e cache de 30 minutos
- `GET /saude` e `GET /saude/banco`
- Esqueleto que responde 501 para a pesquisa por rua
- Seed com dados fictícios de desenvolvimento
- `lib/senha.ts`: hash de senha com scrypt assíncrono (`node:crypto`), com os parâmetros gravados no próprio hash
- `POST /auth/cadastro`: valida, normaliza o e-mail, recusa e-mail repetido (409) e cidade inexistente (400), grava só o hash da senha e responde 201 com `id`, `nome` e `email`
- `POST /auth/login`: confere e-mail e senha (com hash fictício quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails têm conta) e responde 200 com um JWT e `{ id, nome, email }`; e-mail inexistente e senha errada dão o mesmo 401
- JWT com `@fastify/jwt` (HS256, `sub` com o id do usuário e validade em `JWT_EXPIRA_EM`, padrão 7 dias), com as variáveis `JWT_SECRET` e `JWT_EXPIRA_EM`
- Plugin `autenticar-usuario`: valida o token, busca o usuário no banco e o disponibiliza em `request.usuario`
- Limite de tentativas (`@fastify/rate-limit`, contadores em memória): login 10 por 15 min por IP + e-mail e 40 por 15 min por IP, cadastro 20 por hora por IP e exclusão de conta 5 por 15 min por IP; ao passar, 429 com `Retry-After` e cabeçalhos `x-ratelimit-*`. Números em `config/limites.ts`. Nova variável `TRUST_PROXY` (padrão `false`), necessária atrás de um proxy
- Cooldown de push por estação (antiflapping, RF08): depois de um push, outro alerta da mesma estação dentro de `PUSH_COOLDOWN_MIN` minutos (padrão 30, estimativa a ajustar com dados reais do sensor; 0 desliga) só notifica se for mais grave (por exemplo, atenção para crítico). O alerta suprimido continua registrado e em `GET /alertas`, com a marca `alertas.push_suprimido_em` (migração `alerta_push_suprimido_em`); só a notificação não sai. Envio que falhou não inicia cooldown, e alerta sem tokens na cidade conta como enviado. `estadoMaisGrave` em `@acquascan/shared`
- Conferência dos recibos (receipts) do Expo Push, segunda etapa do RF08: o envio guarda o ticket de cada mensagem aceita (tabela `push_tickets`, migração `adiciona_push_tickets`, com `ON DELETE CASCADE` para o token e o alerta) e, a cada 5 minutos, a API consulta os recibos dos tickets com 15 minutos ou mais, em lotes de até 1000 ids. Recibo `ok` apaga o ticket; `DeviceNotRegistered` apaga o push token; `InvalidCredentials` gera um único aviso por execução do processo; outros erros são contados por código, sem reenviar; recibo ausente mantém o ticket; tickets com mais de 24 horas são descartados como "sem recibo". Nova variável `EXPO_RECIBOS_URL` e constantes em `config/push.ts`. O log traz só contagens
- Envio de notificações push quando o estado de um rio piora (RF08), pelo Expo Push Service, para os usuários da cidade da estação. Alertas são uma caixa de saída (`enviadoEm`): enviados em lotes de 100, com até 3 tentativas em 429/5xx, só os das últimas 1 hora, apagando tokens com `DeviceNotRegistered`; `enviadoEm` só é preenchido quando todos os lotes foram aceitos (pode duplicar, não perde). Roda logo após o alerta, sem atrasar o `POST /leituras`, e a cada 30 s. Variáveis `PUSH_ENVIO_ATIVO` (padrão `false`), `EXPO_PUSH_URL` e `EXPO_ACCESS_TOKEN`; `ROTULO_ESTADO` em `@acquascan/shared`. Os recibos de entrega são conferidos (veja a entrada acima)
- Registro de tokens de push (RF08, primeira etapa; nenhuma notificação é enviada ainda): `POST` e `DELETE /usuarios/me/push-token`. O token do Expo é único e passa a ser do usuário da sessão se já existia (reatribuição), cada usuário guarda no máximo 10 (os mais antigos saem) e o `DELETE` só apaga tokens do próprio usuário, sempre com 204. Coluna `push_tokens.atualizado_em` (migração `push_token_atualizado_em`) e `pushTokenEntradaSchema` em `@acquascan/shared`. O token nunca vai para log. O app só gera o token em aparelho físico com development build, não no Expo Go
- `GET /usuarios/me`: perfil de quem está logado (`id`, `nome`, `email`, `consentimentoEm`, `criadoEm` e `cidade`), sem a senha; tipo `Perfil` em `@acquascan/shared`
- `DELETE /auth/conta` (LGPD): exclui a conta de quem está logado, confirmada pela senha (403 se estiver errada), e apaga também os tokens de push; responde 204, inclusive se a conta já tiver sido apagada. Esquema `excluirContaEntradaSchema` em `@acquascan/shared`
- Cidades: tabela `cidades` (nome, UF, centro), `cidadeId` obrigatório nas estações e nos usuários (migrações `adiciona_cidades` e `cadastro_por_cidade`, que criam Petrópolis/RJ e ligam a ela as estações e os usuários existentes), tipo `Cidade` em `@acquascan/shared` e `GET /cidades`, público e em ordem alfabética

**Mobile**

- Abas: rios (mapa e lista), previsão, pontos de apoio e perfil
- Detalhe da estação com nível, estado, estimativa e histórico de 24 h
- Telas de login e cadastro com validação local e termo de consentimento
- Tema com a paleta azul e branca e estados acessíveis (cor, ícone e texto)

**Simulador**

- Cenários `estavel`, `cheia` e `vazante` enviando leituras para a API

**Rios** (`tools/grafo`, segunda etapa de dados do desvio de rios em estado crítico; só dados, sem mudar API, app, banco, `packages/roteamento` nem o comando de ruas)

- Comando `pnpm grafo:rios` (`--atualizar` baixa de novo): uma única consulta à Overpass, com o mesmo cliente e cache das ruas (o `baixar.ts` ganhou só a consulta e o prefixo do cache como opções), com os ways `waterway` river, stream, canal e drain e as relações de rio com nome. Resposta parcial é falha e nunca entra no cache
- Rios alvo configuráveis (`RIOS_ALVO`, padrão Piabanha e Quitandinha), comparados por **igualdade** do nome normalizado (minúsculas, sem acento, sem o prefixo "rio "). O nome vem do way ou, na falta, da relação. Os demais rios aparecem só no relatório
- Saída `rios-petropolis.geojson` (um `LineString` por segmento, com `osmWayId`, `rio`, `waterway`, `coberto` e o `tunnel` bruto, `canal`, `comprimentoM`; geometria simplificada em 3 m preservando o sentido do fluxo, a jusante) e `relatorio-rios.md` (todos os waterways nomeados, o resumo de cada rio alvo com componentes, lacunas de pontas a menos de 30 m e ways sem nome ligados, e os tamanhos). Nada é unido automaticamente. Saída e cache ficam fora do git
- Primeira execução: Piabanha com 16,89 km em 7 componentes e 5 lacunas; Quitandinha com 7,31 km em 3 componentes e 2 lacunas; GeoJSON de 18 KB. Hidrografia também do OpenStreetMap (ODbL), registrada em `docs/creditos-dados.md`

**Exposição das ruas aos rios** (`tools/grafo`, terceira etapa de dados do desvio de rios; só dados e lógica pura, sem mudar API, app, banco nem `packages/roteamento`)

- Comando `pnpm grafo:exposicao` (sem rede): para cada rua do grafo e cada segmento de rio alvo calcula `cruza` (interseção de segmentos, com tolerância de 0,5 m para toques nas pontas), `distMinM` e as frações do comprimento da rua a até 15, 30 e 50 m (`f15`, `f30`, `f50`). As frações vêm de amostras a cada 5 m, cada uma atribuída ao segmento de rio mais próximo, então nunca somam mais que 1 numa rua. Usa projeção plana local (erro abaixo de 0,2%, testado contra o haversine) e grade espacial. Falha com mensagem clara se faltarem o grafo ou os rios
- Saída `exposicao-petropolis.json` em formato compacto (entradas `[arestaId, segmentoId, cruza, distMinM, f15, f30, f50]`, com o sha256 do arquivo do grafo, os parâmetros e os segmentos) e `relatorio-exposicao.md`, ambos fora do git. O relatório traz a exposição por rio (arestas e km em cada faixa), o histograma da f30, as ruas que cruzam rio sem ponte nem túnel, as pontes, os segmentos mais ligados e a **cobertura do monitoramento** (das ruas que cruzam algum waterway, quantas cruzam rios sem estação)
- Rios consolidados: `ALIASES_RIOS` (`pirabanha` e `quintandinha` valem como os rios alvo, com `alias: true` e listados no relatório para corrigir no OSM), absorção de ways de rio sem nome que se ligam a um segmento do rio alvo (`inferido: true`, em cadeia, nunca um way com outro nome) e `id` numérico estável por segmento (ordenado por rio e `osmWayId`). Piabanha passou de 7 componentes e 5 lacunas para 3 e 1; Quitandinha, de 3 e 2 para 1 e 0. O GeoJSON dos rios ganhou as propriedades `id`, `alias` e `inferido`, mantendo as existentes
- Primeira execução: 160 ruas cruzam um rio alvo; 772, 971 e 1.102 ruas ficam a até 15, 30 e 50 m (3,15%, 5,3% e 6,8% da malha); 143 das 303 ruas que cruzam algum waterway (47%) cruzam só rios sem estação. Arquivo de 31,8 KB

**Roteamento** (`packages/roteamento`, segunda etapa do roteamento offline; só o pacote, sem mudar API, app, banco nem `tools/grafo`)

- Pacote `@acquascan/roteamento`: `criarRoteador(grafo)` valida o JSON de `tools/grafo` (erro claro em português) e monta as estruturas indexadas (grafo em CSR com typed arrays, geometrias achatadas e índice espacial em grade de ~100 m)
- `encaixar(ponto)`: o ponto mais próximo sobre qualquer aresta, com a posição ao longo dela (fração da geometria simplificada vezes o comprimento)
- `rotear(origem, destino)`: A\* com heap binário próprio e heurística admissível, com origem e destino no meio de arestas (fontes e destinos virtuais), trajeto direto na mesma aresta, sentido único, e `trechos` com nome, classe, sentido, comprimento da parte percorrida, multiplicador e pontos orientados
- Multiplicador de custo por aresta (`Float32Array`, `>= 1` ou `Infinity`): o ponto de extensão do futuro desvio de rios. O roteador só devolve o multiplicador usado em cada trecho; não decide política de segurança
- Roda no Hermes e no Node: `src/` não usa APIs do Node (tsconfig sem os tipos do Node e um teste que varre os arquivos)
- Testes sem rede: casos feitos à mão, comparação com um Dijkstra de referência em grades aleatórias de 30x30 (custo igual em todos os pares) e, se `tools/grafo/saida` existir, no grafo real de Petrópolis
- Medido no Node com o grafo real: `criarRoteador` ~7 ms, estruturas de ~1,4 MB, rota com mediana de 0,21 ms (p95 0,55 ms), e o A\* expande 31% dos nós do Dijkstra
- `docs/decisoes.md` (novo, com a decisão de rotear no celular com A\* próprio) e a seção "Roteamento no celular" em `docs/arquitetura.md`

**Grafo de ruas** (`tools/grafo`, primeira etapa do roteamento offline do app; só dados, sem mudar API, app nem banco)

- Ferramenta `pnpm grafo:construir` que baixa os ways `highway` de Petrópolis do OpenStreetMap (uma única consulta à Overpass API, com cache em disco e `--atualizar`) e constrói o grafo de ruas a pé: nós nas interseções e pontas, arestas com comprimento (haversine), geometria simplificada (Douglas-Peucker, 3 m), nome, classe e marcas de escada, ponte e túnel, mantendo só o maior componente conexo
- Tabela de decisões do que é caminhável a pé (`caminhavel.ts`), a ser revisada com a equipe, e relatório de cada execução (`saida/relatorio.md`)
- Primeira execução: 6.329 nós e 7.219 arestas (782,7 km), JSON de 1,90 MB (343,6 KB com gzip). A saída e o cache ficam fora do git por enquanto
- `docs/creditos-dados.md`: atribuição "© colaboradores do OpenStreetMap" e a licença ODbL (o grafo é uma base derivada; a equipe deve confirmar as obrigações)
