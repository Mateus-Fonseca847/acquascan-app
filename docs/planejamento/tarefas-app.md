# Tarefas do app (`APP-xx`)

Dono: dev do app. Pasta: `apps/mobile`. Antes de pegar um cartão, leia o `CLAUDE.md` e
[trabalho-em-paralelo.md](trabalho-em-paralelo.md). O PDF do design está em
`docs/design/Update_App_AquaScan.pdf`; onde ele discorda de uma decisão, vale a decisão
([contexto-e-decisoes.md](contexto-e-decisoes.md), seção 5).

**Todo cartão termina com:** resumo dos arquivos alterados, roteiro de teste no celular de verdade, lista de
diferenças em relação ao Figma (com o motivo) e dúvidas. Toda tela precisa de estado de carregando, vazio,
erro (com "Tentar de novo") e sem internet.

## Ordem recomendada

`APP-00` → `APP-01` → `APP-02` → `APP-03` → `APP-04` → `APP-05` → `APP-06` → `APP-07` → `APP-08` → `APP-09`
→ `APP-10` → `APP-11`. Os cartões `APP-12` em diante esperam backend, dados ou decisões e estão no fim.
Cartões `APP-04` a `APP-11` podem trocar de ordem entre si depois do `APP-02`.

---

## Pode começar agora (a API já existe)

### APP-00 · Ambiente, diagnóstico e mapa

- **Branch:** `feat/app-00-ambiente-mapa` · **Depende de:** nada.
- **Problema 1:** a aba Rios fica em "Carregando" para sempre quando o celular não alcança a API. Suba o
  ambiente pelo README (Docker, `db:migrate`, `db:seed`, `dev:api`, `dev:mobile`), ache a causa (IP em
  `EXPO_PUBLIC_API_URL`, rede, Firewall, timeout, falta de estado de erro) e garanta que, após falha de rede ou
  timeout, a tela mostre erro em português com "Tentar de novo".
- **Problema 2:** o mapa aparece preto, só com o logotipo do Google, no Android com o Expo Go. Descubra o
  motivo (chave do Google Maps) e escreva `docs/planejamento/relatorio-mapa.md` comparando: (a) manter
  `react-native-maps` e criar chave própria do Google Maps (custo, cota gratuita, o que muda no development
  build), (b) trocar para MapLibre com tiles do OpenStreetMap (exige development build, abre caminho para mapa
  offline, esforço da migração). Dê uma recomendação, **sem trocar de biblioteca**: a decisão é do Backend.
- **Não fazer:** trocar a biblioteca de mapa; mexer em `apps/api`.
- **Pronto quando:** a aba Rios mostra dados ou erro com "Tentar de novo"; o relatório do mapa existe; o PR
  descreve a causa dos dois problemas.

### APP-01 · Tema e componentes base a partir do Figma

- **Branch:** `feat/app-01-tema-componentes` · **Depende de:** nada. **Merge rápido**: todos os outros dependem.
- Extraia do PDF e das exportações do Figma as cores, tipografia, raios e espaçamentos e leve para `src/theme`.
  Ajuste ou crie os componentes base: `Botao` (primário, secundário, perigo), `Campo` (texto, senha, com erro),
  `Mensagem` (carregando, vazio, erro com "Tentar de novo"), `BadgeEstado` (Estável, Atenção, Crítico, **Sem
  dados**), `Cartao`, `Chip`, `Modal` e folha inferior, ícones. Telas existentes continuam funcionando.
- **Regras:** nada de hexadecimal fora do tema; fonte mínima de 16 px; alvo de toque de 44 px; estado sempre
  com cor + ícone + texto. Uma fonte nova só com a licença confirmada pelo designer.
- **Pronto quando:** existe uma tela de desenvolvimento (só `__DEV__`) que mostra todos os componentes em todos
  os estados, e as telas atuais usam o tema novo sem regressão.

### APP-02 · Abas, flags de recurso e fixtures

- **Branch:** `feat/app-02-abas-flags` · **Depende de:** APP-01.
- Abas na ordem e com os nomes do design: **Mapa, Apoio, Tempo, Conta**. Mantenha o portão de navegação da sessão.
- Crie `src/config/recursos.ts` com as flags da tabela de [contratos-api.md](contratos-api.md) (todas
  `false`) e a pasta `src/fixtures/` (vazia, com um README de uma linha explicando o uso).
- Se `app/(dev)/` ou `src/roteamento/` aparecerem no diff, **não edite**: são do Backend.
- **Pronto quando:** as quatro abas funcionam, as flags existem e estão documentadas em `apps/mobile/README.md`.

### APP-03 · Boas-vindas, entrar e criar conta (visual novo)

- **Branch:** `feat/app-03-auth-visual` · **Depende de:** APP-01, APP-02.
- **Telas do PDF:** Boas-vindas, Entrar (e os estados de erro), Criar conta (e os estados de erro), "Boas-vindas ao
  AquaScan!" após criar a conta.
- A lógica de sessão **já existe** (`useSessao()`, `criarContaEEntrar`, `entrar`): só refaça o visual e mantenha
  os comportamentos. Cadastro: nome, e-mail, senha (mínimo 8), cidade (lista de `GET /cidades`) e o aceite da
  Política de Privacidade e dos Termos de Uso. **Sem telefone, sem CEP.**
- **Link "Esqueci minha senha":** oculte (flag `RECUPERAR_SENHA` desligada).
- Depois de criar a conta, vá direto ao mapa. A tela "Sua região" do PDF repete a cidade do cadastro e fica
  para o APP-12.
- **Não fazer:** pedir permissão de notificação (push não existe no Expo Go) nem de localização aqui.
- **Pronto quando:** o roteiro de 11 passos da sessão (em `apps/mobile/README.md`) passa no celular real, com os
  textos de erro do PDF.

### APP-04 · Aba Mapa: estações, resumo e atualização

- **Branch:** `feat/app-04-mapa-estacoes` · **Depende de:** APP-00 (decisão do mapa), APP-02.
- Mapa com um marcador por estação (cor + ícone + texto), lista abaixo, resumo ("1 crítica · 1 atenção · 1
  estável"), "Atualizado há X min", puxar para atualizar e atualização automática a cada 30 s. Estado de
  carregando ("Carregando os rios…"), vazio e erro.
- **"Sem dados":** use `semDados` e `idadeLeituraMin` do contrato C1 (`SEM_DADOS_SERVIDOR`). Enquanto a flag
  estiver desligada, mostre "Atualizado há X min" com os campos atuais e **não** decida "sem dados" pelo relógio
  do aparelho.
- A busca "Buscar rio ou rua" aparece **desabilitada** (flag `BUSCA_RUA`). Rios coloridos e a legenda "Sem
  medição" são do APP-17.
- **Pronto quando:** funciona no celular com a API local, inclusive com a API desligada (erro, sem travar).

### APP-05 · Detalhe do rio

- **Branch:** `feat/app-05-detalhe-rio` · **Depende de:** APP-04.
- Nível atual, altura, vazão, estado, estimativa até transbordar ("Pode atingir o estado crítico em 45 min"),
  gráfico do nível com abas de 6 h, 24 h e 7 dias (`GET /estacoes/:id/leituras?horas=`), texto de tendência.
  O botão "Seguir estação" fica oculto (flag `SEGUIR_ESTACOES`).
- Gráfico: use o que já está instalado; se for imprescindível uma biblioteca (por exemplo `react-native-svg`
  via `expo install`), avise antes. As cores do gráfico seguem os estados.
- **Pronto quando:** as três janelas funcionam, com poucas leituras e sem nenhuma leitura.

### APP-06 · Histórico de medições e todas as leituras

- **Branch:** `feat/app-06-historico` · **Depende de:** APP-05.
- Telas "Histórico de medições" e "Todas as leituras" (lista com estado, nível e hora). Reaproveite o hook das leituras.
- **Pronto quando:** a lista rola bem com centenas de itens e mostra vazio e erro.

### APP-07 · Alertas

- **Branch:** `feat/app-07-alertas` · **Depende de:** APP-02.
- Tela de Alertas aberta por um sino no cabeçalho do Mapa. Lista de `GET /alertas` agrupada em Hoje, Ontem e
  Anteriores; cada item mostra estação, rio, `BadgeEstado` do antes e do depois e "há X min". Rodapé fixo:
  "Estes alertas não substituem a Defesa Civil." Vazio: "Nenhum alerta nas últimas 24 h".
- O tipo `ALIVIO` do contrato C3 ("saiu do estado crítico") entra quando `SEGUIR_ESTACOES` ligar; deixe o
  componente preparado.
- **Pronto quando:** com o simulador em cheia, os alertas aparecem na tela ao atualizar.

### APP-08 · Aba Tempo (previsão)

- **Branch:** `feat/app-08-tempo` · **Depende de:** APP-02.
- Previsão de 7 dias com os campos atuais (chuva, probabilidade, mínima e máxima, risco) no layout do PDF;
  tela de "Chuva forte prevista" com os botões "Acompanhar os rios" e "Encontrar apoio próximo". Mantenha o
  texto "Estimativa demonstrativa. Consulte os comunicados oficiais da Defesa Civil."
- Temperatura atual, sensação térmica, condição e as ilustrações do hipopótamo dependem do contrato C4
  (`PREVISAO_ATUAL`); deixe o layout preparado e peça as ilustrações ao designer.
- **Pronto quando:** funciona com a API e com a API fora do ar (mostra o último dado ou o erro).

### APP-09 · Aba Apoio

- **Branch:** `feat/app-09-apoio` · **Depende de:** APP-02.
- Lista e mapa dos pontos de apoio, ordenados por distância, com o botão **"Como chegar"** que abre o app de
  mapas do celular em modo a pé (`Linking`). Sem permissão de localização, ordene pelo centro da cidade e diga
  isso na tela. Permissão de localização **só em primeiro plano**, com o estado "Localização desativada" e o
  botão "Abrir Ajustes". Esconda a capacidade quando for `null`; mostre o bairro quando existir; contato
  `null` vira "199 Defesa Civil" (contrato C5).
- **Não fazer:** desenhar rota dentro do app (é do `APP-18`).
- **Pronto quando:** funciona com e sem permissão de localização, e nunca mostra "capacidade: null".

### APP-10 · Conta

- **Branch:** `feat/app-10-conta` · **Depende de:** APP-02.
- Tela de Conta (nome, e-mail, cidade), "Sair da conta" e "Excluir minha conta" com modal que pede a senha
  (`useSessao().excluirConta`): 403 mostra "Senha incorreta" sem deslogar; 204 volta às boas-vindas. Texto:
  "Apagamos seu cadastro e suas preferências. Essa ação não pode ser desfeita." Tela "Privacidade e termos"
  com o crédito "© colaboradores do OpenStreetMap" e as permissões (leitura do estado do sistema). Os textos
  legais são do Backend (Mateus): mostre um link ou aviso de "em revisão", não escreva texto jurídico.
- **Não fazer:** "Dados pessoais" com edição, "Alterar senha" e "Baixar meus dados" (APP-13). **Não** implemente
  o "Sair" definitivo do push; quando o push existir (APP-16), o "Sair" precisa apagar o token no servidor antes
  de limpar a sessão.
- **Pronto quando:** exclusão testada com senha certa, errada e API desligada.

### APP-11 · Estados globais e acessibilidade

- **Branch:** `feat/app-11-estados-a11y` · **Depende de:** APP-03 a APP-10.
- Faixa "Sem internet · dados de HH:MM" usando o último dado disponível (cache em memória; persistência em
  disco é o APP-19). Auditoria de acessibilidade com TalkBack (Android) ou VoiceOver (iPhone): rótulos, ordem
  de foco, contraste, alvos de 44 px, fonte ampliada do sistema.
- **Pronto quando:** o relatório da auditoria está no PR, com o que foi corrigido e o que ficou.

---

## Esperam backend, dados ou decisão (não pegar ainda)

| Cartão                                                      | Branch                        | Depende de                                                                                                      | Telas do PDF                                                                |
| ----------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **APP-12** Seguir estações, nível de alerta, "Sua região"   | `feat/app-12-seguir-estacoes` | contrato C3 implementado (BE-03), APP-04                                                                        | Seguir estação, Estações que sigo, Nível de alerta (2 opções), Minha região |
| **APP-13** Dados pessoais, alterar senha, baixar meus dados | `feat/app-13-perfil-edicao`   | C2 implementado (BE-02), APP-10                                                                                 | Dados pessoais (sem telefone), Alterar senha, Baixar meus dados             |
| **APP-14** Recuperar senha                                  | `feat/app-14-recuperar-senha` | C7 implementado (BE-08); falta desenhar a tela do código                                                        | Recuperar acesso, Confira seu e-mail                                        |
| **APP-15** Pesquisa por rua                                 | `feat/app-15-busca-rua`       | C6 implementado (BE-06)                                                                                         | Buscar rio ou rua, resultados, nenhuma rua                                  |
| **APP-16** Permissões e push no app                         | `feat/app-16-push`            | development build, contas Apple e Firebase, BE-03; "Sair" apaga o token                                         | Notificações desativadas, Sua região monitorada                             |
| **APP-17** Rios coloridos no mapa e legenda "Sem medição"   | `feat/app-17-rios-coloridos`  | decisão da biblioteca de mapa, estações reais, `pnpm dados:app`; usa `@acquascan/desvio` (`estadoDosSegmentos`) | Mapa com rios                                                               |
| **APP-18** Tela de rota com desvio                          | `feat/app-18-rota`            | RT-02 (Backend entrega a base)                                                                                  | Rota até o apoio, offline, recalculando, sem GPS, chegou                    |
| **APP-19** Cache offline em disco                           | `feat/app-19-cache-offline`   | decisão sobre dependência de armazenamento                                                                      | Faixa "Sem internet", dados salvos                                          |
