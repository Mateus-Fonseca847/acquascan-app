# Contexto e decisões vigentes

## 1. O produto

Sensores ultrassônicos (ESP32) medem o nível de rios de Petrópolis e enviam leituras à API. A API calcula
nível, estado (Estável, Atenção, Crítico) e a estimativa de tempo até transbordar, e avisa os usuários. O app
mostra os rios, a previsão do tempo, os pontos de apoio e, em breve, rotas a pé até um apoio **evitando rios
em estado crítico**. Tudo precisa funcionar também com pouca conexão.

Quem decide: **Mateus** (produto e backend). O dev do app decide a implementação das telas dentro das
decisões abaixo. Em dúvida, abra uma issue com o rótulo `decisao`.

## 2. Arquitetura em resumo

- **API** (Fastify 5, Prisma, PostgreSQL com PostGIS): estações, leituras, alertas, usuários, push, previsão
  (Open-Meteo, com cache), pontos de apoio, cidades.
- **App** (Expo SDK 57, Expo Router, TanStack Query): consome a API; sessão no SecureStore.
- **Regras compartilhadas** (`packages/shared`): níveis, estados e esquemas, usados pela API e pelo app.
- **Roteamento no celular** (`packages/roteamento`, `packages/desvio`): grafo de ruas do OpenStreetMap
  embutido no app, A\* próprio, desvio de rios em estado crítico a partir de dados estáticos de exposição e do
  estado dinâmico das estações. Não depende de servidor de rotas.
- **Ferramentas** (`tools/grafo`, `tools/simulador`): geração dos dados geográficos e simulação de estações.

## 3. Estado atual (atualize quando um PR mudar isto)

**Feito:** leituras e estações, alertas, previsão, pontos de apoio por distância, cidades; cadastro, login
(JWT de 7 dias), perfil, exclusão de conta, tokens de push, envio de push (desligado por padrão), recibos,
cooldown, limite de tentativas; sessão no app (login, cadastro, visitante); grafo de ruas, rios, exposição,
A\*, instruções de curva e política de desvio; prova de viabilidade medida num Galaxy A17 no Expo Go (carga
de 1,2 s e p95 do `rotear` de 45 ms com os dois rios críticos).

**Conhecido e em aberto:**

- A aba Rios do app fica em "Carregando" quando o celular não alcança a API (`APP-00` investiga).
- O mapa aparece preto no Android com o Expo Go (`react-native-maps`). A biblioteca de mapa **não está
  decidida** (`APP-00` investiga e recomenda).
- Push nunca foi testado num aparelho. Não funciona no Expo Go: exige development build.
- O seed é fictício: 2 estações, 3 pontos de apoio. Coordenadas reais ainda não existem.
- `docs/privacidade.md` ainda tem `[PREENCHER]`. Política de Privacidade e Termos de Uso precisam de revisão
  por alguém habilitado.
- Confirme no `git log` se o commit da prova de viabilidade do roteamento e o do polimento dos textos de
  curva (`RT-01`) já entraram.

## 4. Decisões vigentes

| Tema                      | Decisão                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro                  | Nome, e-mail, senha (8 a 128), `cidadeId` e consentimento. **Sem telefone. Sem CEP.**                                                                                                                                                                                                                         |
| Região                    | A cidade escolhida de `GET /cidades`. O mapa abre na localização do aparelho se permitida (só em primeiro plano, nunca enviada ao servidor); senão, no centro da cidade                                                                                                                                       |
| Sessão                    | JWT de 7 dias no SecureStore. Visitante permitido. Só **401** de chamada autenticada desloga                                                                                                                                                                                                                  |
| Exclusão de conta         | Pede a senha. 403 se errada (não desloga). 204 apaga tudo por cascata                                                                                                                                                                                                                                         |
| Limite de tentativas      | Login: 10 por 15 min por IP + e-mail e 40 por 15 min por IP. Cadastro: 20 por hora. Exclusão: 5 por 15 min. Atrás de proxy, ligar `TRUST_PROXY`                                                                                                                                                               |
| Seguir estações           | Padrão: todas as estações da cidade. O usuário pode ajustar                                                                                                                                                                                                                                                   |
| Nível de alerta           | **Duas** opções: `ATENCAO_E_CRITICO` (padrão) e `SO_CRITICO`                                                                                                                                                                                                                                                  |
| Aviso de melhora (alívio) | Só quando a estação **sai do crítico** (para atenção ou estável). Vai a todos que seguem a estação, em qualquer nível, e só se o crítico daquela estação teve push enviado. De atenção para estável **não** notifica                                                                                          |
| Cooldown de push          | 30 min por estação (`PUSH_COOLDOWN_MIN`). Alerta de gravidade igual ou menor dentro da janela é suprimido (continua registrado e listado). Escalada sempre envia. O alívio tem cooldown próprio                                                                                                               |
| Recuperar senha           | Código de 6 dígitos por e-mail (vale 15 min, 5 tentativas). Resposta igual exista ou não o e-mail. Redefinir e trocar a senha invalidam as sessões antigas                                                                                                                                                    |
| Estação sem dados         | Sem leitura há mais de 20 min (configurável): "Sem dados", cinza, calculado **no servidor**. Para o desvio, crítico e atenção continuam valendo por até 6 h (falha segura)                                                                                                                                    |
| Rios no mapa              | Só se colore o trecho a até 1.000 m de uma estação do mesmo rio. O resto é "Sem medição", com legenda                                                                                                                                                                                                         |
| Desvio de rios            | Crítico: faixa de 50 m, penalidade 49, bloqueia travessia na primeira tentativa. Atenção: faixa de 15 m, penalidade 3. Frações de trechos somadas por rua. Trechos de rio de 250 m. O que o mapa mostra em vermelho é exatamente o que a rota evita. **Constantes provisórias**, a validar com a Defesa Civil |
| Tela de rota              | Mostra a rota recomendada e, quando a diferença de exposição for de 100 m ou mais, a mais curta ao lado, com os números. Existe o estado "sem rota segura"                                                                                                                                                    |
| Offline                   | Grafo, rios e exposição embutidos no app (cerca de 2 MB). Últimos dados em cache. "Rota salva". Download de mapa offline **não está decidido**                                                                                                                                                                |
| Pontos de apoio           | Lista da Prefeitura (68 pontos). Importar confiança Alta (43) e Média (17), guardando a confiança; Baixa (3) e não encontrados (5) ficam fora. Capacidade opcional. Contato padrão 199. As coordenadas vêm do Google Places: **provisórias**, a confirmar em campo ou com a Defesa Civil                      |
| Previsão                  | Open-Meteo, com cache. Classificação de risco provisória                                                                                                                                                                                                                                                      |
| Logs                      | Só método e caminho. Sem IP, query nem corpo                                                                                                                                                                                                                                                                  |
| Dados do OpenStreetMap    | Atribuição visível no app. Os arquivos gerados ficam fora do Git por enquanto                                                                                                                                                                                                                                 |

## 5. Onde o PDF do Figma NÃO vale

O PDF (`docs/design/Update_App_AquaScan.pdf`) é a referência visual. Nestes pontos, vale a decisão:

1. **Telefone** ("Número de contato" em Dados pessoais): não existe.
2. **Nível de alerta:** o PDF tem 3 opções e promete "voltar ao Estável". Com o alívio indo a todos, "Todos os
   avisos" e "Atenção e Crítico" seriam iguais. Ficam **duas** opções, e o texto de apoio diz que todo
   usuário também recebe o aviso de saída do crítico. A notificação diz "saiu do estado crítico".
3. **Recuperar senha:** é por código digitado no app. Falta no PDF a tela de digitar o código e a nova senha.
4. **Capacidade do apoio:** opcional. A linha some quando não houver.
5. **Dados offline:** não existem "rotas pré-baixadas"; as rotas são calculadas no aparelho. O download do
   mapa de 28 MB não está decidido.
6. **Rios coloridos:** só até 1.000 m de uma estação. Falta no PDF a legenda "Sem medição".
7. **Tela de rota:** o PDF mostra uma rota. Faltam o desenho das duas rotas e o estado "sem rota segura".
8. **"Sua região" repete a cidade do cadastro:** use a cidade já escolhida; a tela só confirma as estações.
9. **Erros do mock:** "3 estações" ao lado de "4 estações monitoradas" e "20°/42" na previsão. Use dados reais.
10. **Tempos e distâncias** ("12 min a pé"): vêm do roteador, que assume 4,5 km/h.

## 6. O que o produto declara não cobrir

O app deve dizer isso nos textos legais e não prometer o contrário:

- **Deslizamentos de encosta.** A maior parte dos desastres de Petrópolis é de movimentos de massa, e os
  sensores de rio não os detectam.
- **Rios sem estação.** Cerca de 47% dos cruzamentos de rio da cidade são sobre rios sem estação (Palatino,
  Rio da Cidade e outros). O desvio não os enxerga.
- Alagamento fora das faixas de 15 e 50 m, vias interditadas, relevo, dados do OpenStreetMap incompletos.
- O desvio é uma ajuda, não uma garantia. Texto fixo: "evita trechos de rio em estado crítico conhecidos".

## 7. Pendências externas (não bloqueiam o código, mas bloqueiam recursos)

| Pendência                                                                                                                                     | Quem resolve                        | Bloqueia                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Dados oficiais da Defesa Civil (pontos de apoio 2024, rotas de fuga, ilhas de segurança, áreas de risco) e validação das constantes do desvio | Mateus                              | `BE-05`, `RT-04`                          |
| Domínio e provedor de e-mail                                                                                                                  | Mateus                              | `BE-08` (recuperar senha)                 |
| Conta Apple Developer (paga) e projeto Firebase; development build                                                                            | Mateus                              | `APP-16` (push)                           |
| Decisão da biblioteca de mapa                                                                                                                 | Mateus, com o relatório do `APP-00` | `APP-04`, `APP-17`, `APP-18`              |
| Hospedagem da API                                                                                                                             | Mateus                              | `BE-10`                                   |
| Coordenadas reais das estações                                                                                                                | Mateus                              | seed realista, `APP-17`                   |
| Textos legais revisados                                                                                                                       | Mateus                              | `APP-10` (Privacidade e termos)           |
| Ajustes e exportações do Figma                                                                                                                | Designer                            | `APP-03` em diante (ilustrações e ícones) |
