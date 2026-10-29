# Quadro

Status: **A fazer** · **Em andamento** · **Em revisão** · **Feito** · **Bloqueado** (diga por quê na issue).
Edite **só a sua linha**, no mesmo PR da tarefa. O quadro oficial também pode viver no GitHub Projects; este
arquivo é o espelho versionado.

## Frontend

| ID    | Título                                          | Status                           | PR  |
| ----- | ----------------------------------------------- | -------------------------------- | --- |
| FE-00 | Ambiente, diagnóstico e mapa                    | A fazer                          |     |
| FE-01 | Tema e componentes base                         | A fazer                          |     |
| FE-02 | Abas, flags de recurso e fixtures               | A fazer                          |     |
| FE-03 | Boas-vindas, entrar e criar conta (visual novo) | A fazer                          |     |
| FE-04 | Aba Mapa: estações, resumo e atualização        | A fazer                          |     |
| FE-05 | Detalhe do rio                                  | A fazer                          |     |
| FE-06 | Histórico de medições e todas as leituras       | A fazer                          |     |
| FE-07 | Alertas                                         | A fazer                          |     |
| FE-08 | Aba Tempo                                       | A fazer                          |     |
| FE-09 | Aba Apoio                                       | A fazer                          |     |
| FE-10 | Conta                                           | A fazer                          |     |
| FE-11 | Estados globais e acessibilidade                | A fazer                          |     |
| FE-12 | Seguir estações, nível de alerta, região        | Bloqueado (BE-03)                |     |
| FE-13 | Dados pessoais, alterar senha, baixar dados     | Bloqueado (BE-02)                |     |
| FE-14 | Recuperar senha                                 | Bloqueado (BE-08, design)        |     |
| FE-15 | Pesquisa por rua                                | Bloqueado (BE-06)                |     |
| FE-16 | Permissões e push                               | Bloqueado (build, contas, BE-03) |     |
| FE-17 | Rios coloridos e legenda "Sem medição"          | Bloqueado (mapa, estações reais) |     |
| FE-18 | Tela de rota com desvio                         | Bloqueado (RT-02)                |     |
| FE-19 | Cache offline em disco                          | Bloqueado (decisão)              |     |

## Backend (dono: Backend)

| ID    | Título                                        | Status                 | PR  |
| ----- | --------------------------------------------- | ---------------------- | --- |
| BE-00 | Contratos publicados                          | Em revisão             |     |
| BE-07 | CI com banco de verdade                       | A fazer                |     |
| BE-01 | Estação "sem dados" e seed realista           | A fazer                |     |
| BE-02 | Perfil editável, trocar senha, exportar dados | A fazer                |     |
| BE-03 | Seguir estações, nível de alerta e alívio     | A fazer                |     |
| BE-04 | Previsão com temperatura atual e condição     | A fazer                |     |
| BE-05 | Pontos de apoio reais                         | A fazer                |     |
| BE-06 | Pesquisa por rua                              | A fazer                |     |
| BE-09 | Gestão de estações                            | A fazer                |     |
| BE-08 | Recuperar senha                               | Bloqueado (e-mail)     |     |
| BE-10 | Endurecimento e deploy                        | Bloqueado (hospedagem) |     |
| BE-11 | Manutenção                                    | A fazer                |     |

## Roteamento e dados (dono: Backend)

| ID    | Título                          | Status                      | PR  |
| ----- | ------------------------------- | --------------------------- | --- |
| RT-00 | Prova de viabilidade no celular | Feito (confirmar commit)    |     |
| RT-01 | Polimento dos textos de curva   | A fazer                     |     |
| RT-02 | Base da tela de rota            | Bloqueado (mapa)            |     |
| RT-03 | Dados embutidos no app          | A fazer                     |     |
| RT-04 | Validação com a Defesa Civil    | Bloqueado (contato externo) |     |
| RT-05 | Área do grafo                   | A fazer                     |     |
| RT-06 | Correções no OpenStreetMap      | A fazer                     |     |

## Avisos entre os lados

Leia antes de pegar o próximo cartão. Cada aviso diz o que mudou e o que cada lado precisa fazer.

### 29/10/2026 · Contratos publicados (BE-00) e leitura da previsão

**O que mudou, em poucas palavras**

- Os contratos C1 a C7 viraram **tipos** em `packages/shared/src/contratos.ts`. **Nenhum endpoint novo existe ainda:**
  "Publicado" quer dizer que o formato está combinado, não que o servidor já responde assim. Só o BE-01 a BE-08
  fazem o servidor responder.
- Duas decisões novas: (1) o alerta ganha o campo `rio` (C3); (2) `GET /previsao` vai deixar de ser uma lista e
  passar a ser `{ atual, dias }` (C4).
- A decisão (2) **quebra o app atual** se o servidor trocar de formato sozinho. Por isso o app já foi preparado: a
  função `lerPrevisao` (`packages/shared/src/previsao.ts`) lê as duas formas, e a aba Previsão continua igual.

**Frontend: o que fazer, em ordem**

1. Atualize a `main`, rode `pnpm install`, `pnpm typecheck` e `pnpm test`. Tudo deve passar.
2. Ao montar uma tela atrás de flag, importe o tipo de `@aquascan/shared` e tipe as fixtures com ele:

   | Cartão       | Tipos para usar                                                                                |
   | ------------ | ---------------------------------------------------------------------------------------------- |
   | FE-04, FE-05 | `EstacaoResumoComStatus`, `EstacaoDetalheComStatus` (campos `semDados` e `idadeLeituraMin`)    |
   | FE-07, FE-12 | `AlertaComTipo` (`tipo` e `rio`), `PerfilCompleto`, `NivelAlerta`                              |
   | FE-08        | `PrevisaoResposta`, `PrevisaoAtual`, `CondicaoTempo`                                           |
   | FE-09        | `PontoApoioReal` (`capacidade` e `contato` podem ser `null`)                                   |
   | FE-13        | `PerfilCompleto`, `DadosExportados`, `TrocaSenhaResposta`                                      |
   | FE-14        | `EsqueciSenhaResposta`; validações `esqueciSenhaEntradaSchema` e `redefinirSenhaEntradaSchema` |
   | FE-15        | `ResultadoRua`                                                                                 |

3. **Não ligue nenhuma flag** só porque o contrato está Publicado. A flag só liga quando o contrato estiver
   **Implementado** (endpoint no ar), como já diz `contratos-api.md` e como o passo 4 da seção 3 de `trabalho-em-paralelo.md` descreve.
4. **FE-08 (previsão):** não apague a leitura da lista de hoje (`lerPrevisao`) até o BE-04 estar no ar. Depois que a
   tela quiser mostrar a temperatura atual, use `data.atual`: quando for `null`, esconda a linha. Nunca invente a
   temperatura.
5. **FE-07 (alertas):** hoje a API não devolve `rio`; veja a nota no cartão.

**Backend: o que fazer, em ordem**

1. **BE-04:** só faça o merge depois que o PR com `lerPrevisao` estiver na `main`, e avise o frontend no PR. Decida
   também o que vai em `atual` quando a previsão externa falhar (o contrato deixa em aberto).
2. **BE-03:** além de `tipo`, passe a devolver `rio` em cada item de `GET /alertas`.
3. **BE-05:** `capacidade` passa a aceitar `null`; mova o tipo `PontoApoioReal` para `tipos.ts` quando implementar.
4. Em todo cartão BE-01 a BE-08: ao implementar, mova o tipo de `contratos.ts` para `tipos.ts`, remova o duplicado,
   atualize `docs/api.md` e mude o status do contrato para **Implementado**.

## Já concluído antes deste plano

Leituras, estações, alertas, previsão, apoios por distância e cidades; cadastro, login, perfil básico,
exclusão de conta, tokens de push, envio de push, recibos, cooldown e limite de tentativas; sessão no frontend;
grafo de ruas, rios, exposição, A\*, instruções de curva, política de desvio com trechos curtos e soma
das frações.

## Nomes antigos

| Antigo                                   | Novo                       |
| ---------------------------------------- | -------------------------- |
| F1 (sessão, login, cadastro no frontend) | Feito                      |
| F2                                       | FE-03                      |
| F3                                       | FE-04, FE-05, FE-17        |
| F4                                       | FE-08, FE-09               |
| F5                                       | FE-10, FE-13               |
| F6                                       | FE-06, FE-07               |
| F7                                       | FE-12                      |
| F8                                       | FE-15                      |
| F9                                       | FE-16                      |
| F10                                      | FE-19                      |
| B1, B2, B3, B4                           | BE-01, BE-02, BE-03, BE-04 |
| B5                                       | BE-06                      |
| B6                                       | BE-08                      |
| B7                                       | BE-05                      |
| B8                                       | BE-10                      |
| R1 a R3, R4a, R5, R6, R6b                | Feito                      |
| R3b                                      | RT-01                      |
| R7a                                      | RT-00                      |
| R7                                       | RT-02 e FE-18              |
| R8                                       | RT-03                      |
| APP-nn (primeira versão do plano)        | FE-nn                      |
