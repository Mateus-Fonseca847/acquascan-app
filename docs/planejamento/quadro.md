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
