# Quadro

Status: **A fazer** · **Em andamento** · **Em revisão** · **Feito** · **Bloqueado** (diga por quê na issue).
Edite **só a sua linha**, no mesmo PR da tarefa. O quadro oficial também pode viver no GitHub Projects; este
arquivo é o espelho versionado.

## App (dono: dev do app)

| ID     | Título                                          | Status                           | PR  |
| ------ | ----------------------------------------------- | -------------------------------- | --- |
| APP-00 | Ambiente, diagnóstico e mapa                    | A fazer                          |     |
| APP-01 | Tema e componentes base                         | A fazer                          |     |
| APP-02 | Abas, flags de recurso e fixtures               | A fazer                          |     |
| APP-03 | Boas-vindas, entrar e criar conta (visual novo) | A fazer                          |     |
| APP-04 | Aba Mapa: estações, resumo e atualização        | A fazer                          |     |
| APP-05 | Detalhe do rio                                  | A fazer                          |     |
| APP-06 | Histórico de medições e todas as leituras       | A fazer                          |     |
| APP-07 | Alertas                                         | A fazer                          |     |
| APP-08 | Aba Tempo                                       | A fazer                          |     |
| APP-09 | Aba Apoio                                       | A fazer                          |     |
| APP-10 | Conta                                           | A fazer                          |     |
| APP-11 | Estados globais e acessibilidade                | A fazer                          |     |
| APP-12 | Seguir estações, nível de alerta, região        | Bloqueado (BE-03)                |     |
| APP-13 | Dados pessoais, alterar senha, baixar dados     | Bloqueado (BE-02)                |     |
| APP-14 | Recuperar senha                                 | Bloqueado (BE-08, design)        |     |
| APP-15 | Pesquisa por rua                                | Bloqueado (BE-06)                |     |
| APP-16 | Permissões e push                               | Bloqueado (build, contas, BE-03) |     |
| APP-17 | Rios coloridos e legenda "Sem medição"          | Bloqueado (mapa, estações reais) |     |
| APP-18 | Tela de rota com desvio                         | Bloqueado (RT-02)                |     |
| APP-19 | Cache offline em disco                          | Bloqueado (decisão)              |     |

## Backend (dono: Backend)

| ID    | Título                                        | Status                 | PR  |
| ----- | --------------------------------------------- | ---------------------- | --- |
| BE-00 | Contratos publicados                          | A fazer                |     |
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

## Já concluído antes deste plano

Leituras, estações, alertas, previsão, apoios por distância e cidades; cadastro, login, perfil básico,
exclusão de conta, tokens de push, envio de push, recibos, cooldown e limite de tentativas; sessão no app;
grafo de ruas, rios, exposição, A\*, instruções de curva, política de desvio com trechos curtos e soma
das frações.

## Nomes antigos

| Antigo                              | Novo                       |
| ----------------------------------- | -------------------------- |
| F1 (sessão, login, cadastro no app) | Feito                      |
| F2                                  | APP-03                     |
| F3                                  | APP-04, APP-05, APP-17     |
| F4                                  | APP-08, APP-09             |
| F5                                  | APP-10, APP-13             |
| F6                                  | APP-06, APP-07             |
| F7                                  | APP-12                     |
| F8                                  | APP-15                     |
| F9                                  | APP-16                     |
| F10                                 | APP-19                     |
| B1, B2, B3, B4                      | BE-01, BE-02, BE-03, BE-04 |
| B5                                  | BE-06                      |
| B6                                  | BE-08                      |
| B7                                  | BE-05                      |
| B8                                  | BE-10                      |
| R1 a R3, R4a, R5, R6, R6b           | Feito                      |
| R3b                                 | RT-01                      |
| R7a                                 | RT-00                      |
| R7                                  | RT-02 e APP-18             |
| R8                                  | RT-03                      |
