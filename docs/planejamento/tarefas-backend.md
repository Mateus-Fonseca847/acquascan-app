# Tarefas do backend, dados e roteamento (`BE-xx`, `RT-xx`)

Dono: Backend (Mateus). Pastas: `apps/api`, `packages/*`, `tools/*`, `docs/` (exceto `docs/design`).
O app consome o que sai daqui, então **contratos e migrações avisam o outro lado** (campo "Impacto para o
outro lado" do PR). Detalhes dos formatos: [contratos-api.md](contratos-api.md).

## Ordem recomendada

`BE-00` → `BE-07` → `BE-01` → `BE-02` → `BE-03` → `BE-04` → `BE-05` → `BE-06` → `BE-09` → `BE-08` → `BE-10` →
`BE-11`. Os cartões `RT-xx` correm numa linha própria (seção final) e podem intercalar.

Todo cartão termina com: testes, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, documentação
(`docs/api.md`, `docs/banco-de-dados.md`, README do pacote, CHANGELOG) e, quando houver migração, a
verificação manual com o banco real, apagando o que for criado para o teste.

---

## Backend

### BE-00 · Contratos publicados

- **Branch:** `feat/be-00-contratos` · **Destrava:** todas as flags do app.
- Tipos dos contratos C1 a C7 em `packages/shared` (`tipos.ts`, `esquemas.ts`) e a seção "Planejados" em
  `docs/api.md`, **sem implementar nenhum endpoint**. Atualize o status em [contratos-api.md](contratos-api.md)
  para **Publicado**.
- **Pronto quando:** `pnpm typecheck` passa nos dois lados e o dev do app consegue importar os tipos.

### BE-07 · CI com banco de verdade

- **Branch:** `feat/be-07-ci-postgis` · **Depende de:** nada.
- Serviço PostGIS no GitHub Actions; testes de integração que aplicam **todas** as migrações num banco vazio
  e verificam o que só o banco prova: cascata na exclusão de conta (usuário, tokens, tickets), unicidade do
  token de push e reatribuição, `ST_DWithin`/distância dos apoios e a caixa de saída de push.
- **Pronto quando:** o CI roda os testes de banco em um minuto ou dois a mais e falha se uma migração quebrar.

### BE-01 · Estação "sem dados" e seed realista

- **Branch:** `feat/be-01-sem-dados` · **Contrato:** C1 · **Destrava:** APP-04, APP-05.
- `semDados` e `idadeLeituraMin` em `GET /estacoes` e `/estacoes/:id`; limite `ESTACAO_SEM_DADOS_MIN` (padrão
  20). Seed com 4 estações (Piabanha 01 Centro, Piabanha 03 Trecho norte, Quitandinha 02, Bingen 04 sem
  comunicação) para o app ver os quatro estados.
- **Pronto quando:** o simulador desligado faz a estação virar `semDados` após o limite e voltar ao enviar
  leituras.

### BE-02 · Perfil editável, trocar senha, exportar dados

- **Branch:** `feat/be-02-perfil` · **Contrato:** C2 · **Destrava:** APP-13.
- `PATCH /usuarios/me`, `PATCH /usuarios/me/senha`, `GET /usuarios/me/dados`. Invalidação de sessões antigas
  (por exemplo, `sessaoValidaApos` em `usuarios`, comparada com o `iat` do JWT no plugin de autenticação).
  Limite de tentativas na troca de senha.
- **Pronto quando:** após trocar a senha, os tokens antigos dão 401 e o novo funciona.

### BE-03 · Seguir estações, nível de alerta e alívio

- **Branch:** `feat/be-03-seguir-estacoes` · **Contrato:** C3 · **Destrava:** APP-12, APP-07, APP-16.
- Tabela de estações seguidas; `nivelAlerta` no usuário; seguir todas as estações da cidade ao cadastrar;
  alertas de alívio (saída do crítico) com `tipo`; push filtrado por estações seguidas e nível; regra do
  alívio (só se o crítico teve push; cooldown próprio); texto das notificações com o nível em %.
- **Pronto quando:** testado com o servidor Expo falso: usuário que não segue a estação não recebe; `SO_CRITICO`
  não recebe atenção; todos que seguem recebem o alívio.

### BE-04 · Previsão com temperatura atual e condição

- **Branch:** `feat/be-04-previsao` · **Contrato:** C4 · **Destrava:** APP-08.
- Pedir mais campos à Open-Meteo (temperatura atual, sensação, código do tempo) e mapear para `CondicaoTempo`.
- **Pronto quando:** o formato antigo continua igual e o endpoint ainda responde se a previsão externa falhar.

### BE-05 · Pontos de apoio reais

- **Branch:** `feat/be-05-apoios` · **Contrato:** C5 · **Destrava:** APP-09.
- Capacidade opcional, `bairro`, `confianca`; importação a partir da lista da Prefeitura
  (`docs/dados/pontos_de_apoio_petropolis_coordenadas.pdf`, 68 pontos): Alta e Média, guardando a confiança.
  Validação contra o grafo de ruas (apoio a mais de 150 m da rua mais próxima fica sinalizado). Dados oficiais da
  Defesa Civil substituem a lista quando chegarem.
- **Pronto quando:** o seed carrega os 60 pontos e o relatório de importação lista os descartados e os sinalizados.

### BE-06 · Pesquisa por rua

- **Branch:** `feat/be-06-busca-rua` · **Contrato:** C6 · **Destrava:** APP-15.
- Importar ruas do OpenStreetMap para o PostGIS (geometria com índice espacial), busca sem acento e tolerante a
  erro (`unaccent`, `pg_trgm`), ligação rua → estação mais próxima do mesmo rio.
- **Pronto quando:** "rua imperador", "Rua do Imperador" e um erro de digitação acham a mesma rua.

### BE-09 · Gestão de estações

- **Branch:** `feat/be-09-gestao-estacoes` · **Depende de:** nada; precisa das coordenadas reais.
- Script para cadastrar uma estação (rio, cidade, coordenadas, alturas, limites) e gerar o token **uma única
  vez**. Hoje só o seed cria estações.
- **Pronto quando:** uma estação nova aparece no app sem mexer no banco à mão.

### BE-08 · Recuperar senha

- **Branch:** `feat/be-08-recuperar-senha` · **Contrato:** C7 · **Destrava:** APP-14 · **Depende de:** domínio e
  provedor de e-mail.
- Endpoints, código de 6 dígitos guardado só como hash, validade, tentativas, limites, envio de e-mail e
  invalidação das sessões antigas.
- **Pronto quando:** o fluxo completo funciona com um provedor real (ou com um servidor de e-mail de teste) e
  nunca revela se o e-mail existe.

### BE-10 · Endurecimento e deploy

- **Branch:** `feat/be-10-deploy` · **Depende de:** hospedagem decidida.
- Encerramento limpo no `SIGTERM`, CORS, cabeçalhos de segurança, idempotência das leituras (reenvio do ESP32),
  `Dockerfile`, build sem `tsx`, `db:deploy`, HTTPS (confirmar se o firmware fala HTTPS), `TRUST_PROXY`, backup e
  retenção de leituras.
- **Pronto quando:** a API está publicada, o app aponta para ela e há um roteiro de implantação em `docs/`.

### BE-11 · Manutenção

- **Branch:** `chore/be-11-manutencao` · **Depende de:** nada.
- Registrar em `docs/decisoes.md` as decisões 001 e 002 (referenciadas no código e ainda não escritas); versionar
  o servidor Expo falso usado nas verificações de push em `tools/`; remover pendências do README.

---

## Roteamento, dados geográficos e desvio

### RT-00 · Prova de viabilidade no celular

- **Branch:** `feat/rt-00-prova-celular` · **Estado:** feito e medido; **falta o commit** (confirme no `git log`).
- Medido num Galaxy A17: carga de 1,2 s e p95 do `rotear` de 45 ms com os dois rios críticos.

### RT-01 · Polimento dos textos de curva

- **Branch:** `feat/rt-01-textos-curva`.
- Mais prefixos de preposição (Ponte, Vila, Viela, Trilha...), fusão de passos de travessia a menos de 15 m e
  texto de curva sem "na via".

### RT-02 · Base da tela de rota

- **Branch:** `feat/rt-02-base-rota` · **Destrava:** APP-18 · **Depende de:** decisão do mapa.
- Em `apps/mobile/src/roteamento/`: pré-carga dos dados em segundo plano depois da abertura do app (a carga
  congela a interface por cerca de 1 s), um hook `useRota` (calcular, acompanhar, recalcular fora do caminho),
  as duas rotas (recomendada e mais curta) e o estado "sem rota segura". O App cuida do visual.

### RT-03 · Dados embutidos no app

- **Branch:** `feat/rt-03-dados-embutidos`.
- Decidir se os arquivos gerados serão versionados (cerca de 2 MB, base derivada do OpenStreetMap, licença ODbL
  e atribuição), como o build os inclui e como o app detecta versão antiga.

### RT-04 · Validação com a Defesa Civil

- Constantes do desvio (alcance de 1.000 m, faixas de 15 e 50 m, penalidades, teto de desvio), mapa oficial de
  áreas inundáveis, pontos de apoio 2024, rotas de fuga e ilhas de segurança. **Depende de contato externo.**

### RT-05 · Área do grafo

- **Branch:** `feat/rt-05-area-grafo`.
- Cerca de 19 dos 63 pontos de apoio localizados (Itaipava, Pedro do Rio, Posse, Secretário e outros) ficam
  fora da área atual do grafo. Decidir se amplia a área (o grafo cresce) ou se restringe a cobertura.

### RT-06 · Correções no OpenStreetMap

- Grafias erradas ("Rio Pirabanha", "Rio Quintandinha") e lacuna de 22 m no Piabanha. Depois: regerar
  `grafo:rios` e `grafo:exposicao` juntos.
