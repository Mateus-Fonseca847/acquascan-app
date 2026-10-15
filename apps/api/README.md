# @acquascan/api

A API é o centro do sistema AcquaScan. Ela recebe as medições das estações, calcula o estado de cada rio, guarda tudo no banco de dados e entrega essas informações para o app.

```
ESP32 (ou simulador) ──POST /leituras──▶  API  ◀──GET /estacoes, /previsao...── App
                                           │
                                           ├──▶ PostgreSQL + PostGIS
                                           └──▶ Open-Meteo (previsão do tempo)
```

Nem o app nem o ESP32 acessam o banco diretamente: tudo passa pela API, que decide o que pode ser feito.

Este README explica **como a API funciona por dentro**, para quem vai mexer no código. O formato exato de cada requisição e resposta (o "contrato" com o app e com o firmware) está em [docs/api.md](../../docs/api.md).

## Rodando

Siga o passo a passo do [README da raiz](../../README.md#primeiro-uso) para instalar as dependências, criar o `.env` e preparar o banco. Depois:

```bash
pnpm dev:api
```

Abra `http://localhost:3333/saude` no navegador. Se aparecer `{"status":"ok", ...}`, a API está no ar.

---

## O caminho de uma requisição

Toda requisição percorre as mesmas etapas. O exemplo abaixo segue uma leitura enviada pelo ESP32:

```
POST /leituras
Authorization: Bearer dev-token-estacao-1
{ "distanciaCm": 150 }
```

| Etapa           | O que acontece                                                                                            | Arquivo                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1. Servidor     | O servidor, iniciado por `pnpm dev:api`, recebe a requisição                                              | `src/server.ts`                            |
| 2. Roteamento   | O Fastify procura qual módulo responde a `POST /leituras`                                                 | `src/app.ts`                               |
| 3. Autenticação | O token é conferido; sem token válido, a resposta é 401                                                   | `src/plugins/autenticar-estacao.ts`        |
| 4. Validação    | O corpo é conferido com o Zod; se `distanciaCm` estiver errado, a resposta é 400                          | `src/modules/leituras/leituras.routes.ts`  |
| 5. Regra        | Nível, percentual e estado são calculados e a leitura é salva; se o estado piorou, um alerta é registrado | `src/modules/leituras/leituras.service.ts` |
| 6. Resposta     | A API devolve o resultado em JSON com o código 201                                                        | `src/modules/leituras/leituras.routes.ts`  |

Se algo der errado em qualquer etapa, o tratador de erros em `src/app.ts` transforma o problema numa resposta padronizada: `{ "erro": "mensagem" }`.

### A divisão entre `routes` e `service`

Cada módulo separa duas responsabilidades:

- **`*.routes.ts`** lida com o HTTP: define o endereço, valida o que chegou e devolve a resposta. Não contém regras do projeto.
- **`*.service.ts`** contém as regras e o acesso ao banco. Não sabe nada de HTTP.

Essa separação permite reaproveitar uma regra em mais de um lugar e testá-la sem subir o servidor. Em módulos muito simples, como `rios`, `cidades` e `saude`, as rotas falam direto com o banco e não há service.

---

## Estrutura

```
apps/api/
├── prisma/
│   ├── schema.prisma        ← definição das tabelas
│   ├── seed.ts              ← dados fictícios de desenvolvimento
│   └── migrations/          ← histórico de mudanças no banco (criado pelo db:migrate)
├── prisma.config.ts         ← onde estão o schema, a URL do banco e o comando do seed
├── src/
│   ├── server.ts            ← inicia o servidor
│   ├── app.ts               ← monta a API: registra módulos e trata erros
│   ├── app.test.ts          ← testes
│   ├── config/env.ts        ← variáveis de ambiente validadas
│   ├── lib/                 ← peças usadas por vários módulos
│   ├── plugins/             ← autenticação das estações e dos usuários
│   ├── modules/             ← um módulo por assunto (explicados abaixo)
│   └── generated/           ← Prisma Client gerado automaticamente (fora do Git)
└── .env.example             ← modelo das variáveis de ambiente
```

---

## Os módulos

Cada pasta em `src/modules/` cuida de um assunto.

### `leituras`: recebe as medições

**Endpoint:** `POST /leituras` (usado pelo ESP32 e pelo simulador)

É o único endpoint que grava dados vindos de fora, por isso é o único que exige autenticação. A estação envia a distância do sensor até a água. O service usa a função `avaliarLeitura` de `@acquascan/shared` para converter essa distância em nível (cm), percentual e estado, com os parâmetros daquela estação: altura de instalação, nível de transbordamento e limites.

Antes de salvar, o service busca o estado da leitura anterior. Se o novo estado for mais grave (de estável para atenção, por exemplo), chama o módulo `alertas`.

A leitura guarda a distância bruta e também os valores calculados. Assim, se os parâmetros da estação mudarem no futuro, o histórico continua mostrando o estado da época.

### `estacoes`: o que o app mostra no mapa e no detalhe

**Endpoints:** `GET /estacoes`, `GET /estacoes/:id` e `GET /estacoes/:id/leituras`

- `GET /estacoes` lista as estações ativas, cada uma com sua última leitura.
- `GET /estacoes/:id` traz uma estação com os limites e a **estimativa de minutos até transbordar**. A estimativa usa as leituras dos últimos 30 minutos para calcular a velocidade de subida e supõe que esse ritmo continue. Se o rio não está subindo, ela vem `null`.
- `GET /estacoes/:id/leituras?horas=24` traz o histórico, de 1 a 168 horas (uma semana), com no máximo 2.000 leituras.

O arquivo `estacoes.mapper.ts` converte os registros do banco para o formato que o app espera, definido em `@acquascan/shared`. Por exemplo, transforma datas em texto ISO. Os módulos `rios` e `alertas` também o usam.

### `alertas`: registra quando o rio piora

**Endpoint:** `GET /alertas?horas=24`

`registrarAlerta` é chamado pelo módulo `leituras` e grava a mudança de estado no banco. `GET /alertas` lista os alertas recentes (até 100), do mais novo para o mais antigo.

**Ainda falta:** enviar a notificação push para o celular dos usuários da região (v0.4.0). Por enquanto, o alerta é só registrado no banco e aparece no log da API.

### `cidades`: onde o AcquaScan atende

**Endpoint:** `GET /cidades` (público)

Lista as cidades cadastradas, de A a Z, com `id`, `nome`, `uf` e o centro (`latitude`, `longitude`). O app usa essa lista para o usuário escolher a cidade no cadastro. A rota fala direto com o banco, sem service, e não registra nada em log. Cada estação e cada usuário pertencem a uma cidade. Mais detalhes em [docs/banco-de-dados.md](../../docs/banco-de-dados.md#cidades).

### `push-tokens`: registro dos aparelhos para notificações

**Endpoints:** `POST /usuarios/me/push-token` e `DELETE /usuarios/me/push-token`, ambos com o corpo `{ "token": "ExponentPushToken[...]" }` e o token de sessão do usuário. Respondem **204**.

Esta é a primeira etapa do RF08: a API só **guarda** os tokens. Nenhuma notificação é enviada ainda (v0.4.0).

- **Registrar:** o token do Expo é único no banco. Se já existir, **de qualquer usuário**, ele passa a ser do usuário da sessão (o aparelho mudou de dono, por exemplo quando outra pessoa entra no mesmo celular) e `atualizadoEm` é atualizado. Registrar o mesmo token duas vezes é idempotente.
- **Limite de 10 por usuário:** passou disso, saem os mais antigos por `atualizadoEm`. O `upsert` e a limpeza acontecem na mesma transação.
- **Corrida:** se dois pedidos registrarem o mesmo token ao mesmo tempo, um deles leva `P2002` (token único). A API tenta de novo uma vez, já como atualização, em vez de devolver erro.
- **Remover:** apaga só se o token for do usuário da sessão (`deleteMany` com `usuarioId` + `token`). Token inexistente ou de outro usuário também responde 204, sem revelar nada.
- **Formato:** `pushTokenEntradaSchema` (de `@acquascan/shared`) exige `ExponentPushToken[...]` ou `ExpoPushToken[...]`, sem espaços, até 200 caracteres. Corpo inválido responde 400; sem sessão, 401.

**Privacidade:** o token identifica o aparelho e **nunca** vai para log, resposta ou mensagem de erro (um teste captura a saída do logger para garantir). Erros inesperados do banco viram uma mensagem genérica.

**Lembrete para o app:** o token do Expo só é gerado em **aparelho físico com development build**, e não no Expo Go nem em emulador. Só deve ser enviado depois que o usuário permitir as notificações.

### `usuarios`: o perfil de quem está logado

**Endpoint:** `GET /usuarios/me` (exige o token do usuário)

`usuarios.service.ts` busca o usuário do token e devolve `{ id, nome, email, consentimentoEm, criadoEm, cidade }`, com as datas em ISO e a cidade completa (`id`, `nome`, `uf`, `latitude`, `longitude`). A resposta é montada campo a campo e a senha nunca é lida do banco, então `senhaHash` não aparece de jeito nenhum. Sem token ou com token inválido, 401. Nada disso vai para o log.

### `rios`: estações agrupadas por rio

**Endpoint:** `GET /rios`

Lista cada rio com suas estações ativas e a última leitura de cada uma. É útil para telas que organizam a informação por rio em vez de por estação.

### `pontos-apoio`: onde se abrigar

**Endpoint:** `GET /pontos-apoio?lat=&lng=&limite=10`

Funciona de dois jeitos:

- **Sem `lat` e `lng`:** lista os pontos ativos em ordem alfabética.
- **Com `lat` e `lng`:** ordena pelos mais próximos e inclui a distância em metros (`distanciaM`).

O segundo caso usa uma consulta SQL escrita à mão (`$queryRaw`), porque o Prisma não sabe calcular distâncias geográficas. A função `ST_Distance` do PostGIS calcula a distância em linha reta sobre a superfície da Terra. Ela não considera ruas: a distância real a pé ou de carro fica para a v0.3.0.

### `previsao`: chuva dos próximos 7 dias

**Endpoint:** `GET /previsao`

O app não fala com a Open-Meteo diretamente: pede à nossa API, que busca os dados lá, classifica o risco de chuva de cada dia com `classificarChuva` (de `@acquascan/shared`) e devolve o resultado.

A resposta fica guardada por **30 minutos** na memória da API (cache). Isso evita consultar a Open-Meteo toda vez que alguém abre a tela. O cache some quando a API reinicia. Se a Open-Meteo estiver fora do ar ou faltar internet, a API responde 502 com uma mensagem clara, em vez de travar.

O ponto da previsão (centro de Petrópolis) vem das variáveis `PREVISAO_LATITUDE` e `PREVISAO_LONGITUDE` do `.env`.

### `saude`: a API está funcionando?

**Endpoints:** `GET /saude` e `GET /saude/banco`

`/saude` responde "ok" sempre que a API está no ar. `/saude/banco` faz uma consulta mínima ao banco e responde 503 se não conseguir. São os primeiros endereços para testar quando algo não funciona: se `/saude` responde e `/saude/banco` não, o problema está no banco.

### `auth`: cadastro, login e exclusão da conta

**Endpoints:** `POST /auth/cadastro`, `POST /auth/login` e `DELETE /auth/conta` (os dois últimos usam o token do usuário)

A regra fica em `auth.service.ts`; `auth.routes.ts` só cuida do HTTP.

**Cadastro** (`cadastrarUsuario`) segue estes passos:

1. A rota valida o corpo com `cadastroEntradaSchema`, de `@acquascan/shared`.
2. O e-mail é normalizado (sem espaços nas pontas, em minúsculas).
3. Se o e-mail já existe, responde **409** `E-mail já cadastrado`.
4. Confere se a cidade (`cidadeId`) existe; se não, responde **400** `Cidade inválida`. Não há chamada de rede.
5. Gera o hash da senha (`lib/senha.ts`) e cria o usuário, com `consentimentoEm` na hora do cadastro.
6. Se o banco recusar o `create`, o erro `P2002` (e-mail repetido por corrida) vira o mesmo **409**, e o `P2003` (cidade apagada no meio do caminho) vira o mesmo **400** `Cidade inválida`. Qualquer outro erro vira `Falha ao salvar o usuário`.
7. Responde **201** com `{ id, nome, email }`. Nunca devolve a senha nem outros dados, e não gera token: quem entra com e-mail e senha é o login.

**Privacidade:** o serviço não registra e-mail, nome nem senha, e o Fastify não registra o corpo das requisições (o log de cada requisição traz só método e caminho, sem IP, host nem query string: ver `lib/log.ts`). Um erro inesperado do banco é trocado por uma mensagem genérica antes de chegar ao log, porque a mensagem do Prisma pode incluir os dados enviados.

**Login** (`autenticarCredenciais`, mais o token na rota):

1. A rota valida o corpo com `loginEntradaSchema`; o e-mail é normalizado (sem espaços nas pontas, em minúsculas).
2. Busca o usuário pelo e-mail. Se ele não existir, a senha é conferida contra um **hash fictício** (`HASH_FICTICIO`), para que o tempo de resposta não revele quais e-mails têm conta.
3. E-mail inexistente e senha errada dão a mesma resposta: **401** `E-mail ou senha incorretos`.
4. Se confere, a rota assina um JWT e responde **200** com `{ token, usuario: { id, nome, email } }`.

O token (`@fastify/jwt`, HS256) leva **só o `sub`**, o id do usuário como texto, mais as datas padrão `iat` e `exp`. Nada de e-mail ou nome. A validade vem de `JWT_EXPIRA_EM` (padrão `7d`) e a assinatura, de `JWT_SECRET`.

Se os parâmetros do scrypt em `lib/senha.ts` mudarem, gere outro `HASH_FICTICIO` com os mesmos parâmetros (o teste `auth.login.test.ts` avisa).

**Exclusão da conta** (`excluirConta`, direito previsto na LGPD):

1. A rota exige o token do usuário (`autenticarUsuario`) e valida o corpo `{ "senha": "..." }` com `excluirContaEntradaSchema` (de 1 a 128 caracteres).
2. Confere a senha contra o hash do usuário do token. Senha incorreta responde **403** `Senha incorreta`: não é 401, para o app não confundir com sessão expirada.
3. Com a senha certa, apaga o usuário e responde **204** sem corpo. Os tokens de push saem junto (`onDelete: Cascade`).
4. É idempotente: se o usuário já não existir na hora da exclusão (erro `P2025`), a resposta também é **204**.
5. Qualquer outro erro do banco vira uma mensagem genérica, sem dados.

Depois da exclusão, o mesmo token passa a dar 401, porque o plugin busca o usuário a cada requisição. Um `DELETE` aceita corpo JSON no Fastify, no `curl` e no `fetch` do Node; um corpo ausente ou malformado responde **400**.

O login, o cadastro e a exclusão de conta têm limite de tentativas (429); veja [Limite de tentativas](#limite-de-tentativas).

### `ruas`: reservado para a próxima versão

**Endpoint:** `GET /ruas/busca` responde **501**. Os comentários `TODO` no arquivo descrevem o que falta fazer.

| Funcionalidade   | Versão | Requisito |
| ---------------- | ------ | --------- |
| Pesquisa por rua | v0.3.0 | RF04      |

---

## Peças de apoio

### `config/env.ts`

Lê o arquivo `.env` e confere cada variável com o Zod. Se faltar alguma, como `DATABASE_URL`, a API **para logo ao iniciar** e diz qual é o problema. É melhor do que subir aparentemente normal e falhar na primeira requisição.

Duas variáveis cuidam do login: `JWT_SECRET` (obrigatória, mínimo de 32 caracteres) e `JWT_EXPIRA_EM` (padrão `7d`; número + `s`, `m`, `h` ou `d`). O `.env.example` traz um segredo só para desenvolvimento, e a API se recusa a iniciar com ele em produção. Para gerar um segredo de verdade: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

`TRUST_PROXY` (padrão `false`) é repassada à opção `trustProxy` do Fastify e decide de onde vem o IP de quem chamou. **Atrás de um proxy** (nginx, Render, Railway...) ela precisa ser ligada (`true`, ou melhor, o número de proxies à frente da API, como `1`); senão todos os usuários aparecem com o IP do proxy e **dividem o mesmo limite de tentativas**. Com a API exposta direto, deixe `false`: ligada sem proxy, qualquer um forja o IP pelo cabeçalho `X-Forwarded-For` e escapa do limite.

Para criar uma variável nova: adicione-a ao esquema neste arquivo, ao `.env.example` (com um comentário explicando) e use `env.NOME_DA_VARIAVEL` no código.

### `lib/prisma.ts`

Cria a conexão com o banco, usada por todos os módulos. Importe sempre daqui (`import { prisma } from '../../lib/prisma'`) em vez de criar outra conexão.

### `lib/token.ts`

`gerarToken` cria um token aleatório para uma estação nova. `hashToken` calcula o hash SHA-256 de um token. O banco guarda **só o hash**: se alguém copiar o banco, continua sem saber os tokens das estações.

### `lib/senha.ts`

`hashSenha` gera o hash de uma senha e `verificarSenha` confere uma senha contra o hash salvo. Usam o `scrypt` do `node:crypto`, na versão assíncrona, para não bloquear o event loop do Fastify. Nunca use `scryptSync`.

O hash é uma string única: `scrypt$N$r$p$salt_base64$hash_base64`. Os parâmetros atuais são N=32768, r=8, p=3, hash de 64 bytes e salt aleatório de 16 bytes. Como N, r e p ficam dentro do hash, `verificarSenha` usa os valores gravados nele: dá para aumentar os parâmetros no futuro sem invalidar as senhas antigas.

`verificarSenha` compara com `timingSafeEqual` e retorna `false` para um hash malformado, sem lançar exceção e sem registrar a senha nem o hash. Os schemas de cadastro e login limitam a senha a 128 caracteres, para que ninguém abuse da CPU com senhas enormes.

### `lib/erros.ts`

Erros previstos, que viram respostas HTTP com o código certo:

```ts
throw naoEncontrado('Estação'); // 404
throw naoImplementado('O login', 'v0.2.0'); // 501
throw new ErroHttp(409, 'E-mail já cadastrado'); // qualquer outro código
```

### `plugins/autenticar-usuario.ts`

Protege as rotas do app. Lê `Authorization: Bearer <token>`, confere o JWT (assinatura e validade), busca o usuário no banco pelo `sub` e o disponibiliza em `request.usuario` (`id`, `nome` e `email`, nunca o hash da senha). Responde **401** se o token faltar, for inválido ou expirado, ou se o usuário não existir mais (a busca é feita a cada requisição, então uma conta apagada perde o acesso na hora). Para proteger uma rota: `{ preHandler: autenticarUsuario }`. Nem o token nem os dados do usuário vão para o log.

### Limite de tentativas

`plugins/limitar-tentativas.ts` (com `@fastify/rate-limit`) segura quem tenta adivinhar senhas ou lotar o cadastro. Os números ficam em `config/limites.ts`, cada um com um comentário explicando o porquê:

| Rota                  | Regra                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`    | **10 por 15 min** por IP + e-mail (e-mail com `trim` e minúsculas, lido do corpo; sem e-mail válido a chave é só o IP) **e** 40 por 15 min por IP |
| `POST /auth/cadastro` | 20 por hora por IP (folga de propósito: no evento da Supernova várias pessoas podem usar o mesmo Wi-Fi)                                           |
| `DELETE /auth/conta`  | 5 por 15 min por IP, conferido **antes** da autenticação                                                                                          |

Todas as tentativas contam, inclusive as bem-sucedidas. Ao passar do limite a resposta é **429** com `{ "erro": "Muitas tentativas. Tente de novo em alguns minutos." }` e o cabeçalho `Retry-After` (segundos). As respostas também trazem `x-ratelimit-limit`, `x-ratelimit-remaining` e `x-ratelimit-reset`. Nenhuma outra rota é limitada: o `POST /leituras` fica de fora porque a estação tem autenticação própria (o endurecimento é do v0.5.0).

**Como funciona:** o plugin é registrado com `global: false` e cada rota monta um `preHandler` com `app.createRateLimit` (a API manual do pacote). Foi preciso porque o login tem duas regras na mesma rota e porque o `preHandler` já tem o corpo lido, o que permite usar o e-mail na chave. O erro 429 é um `ErroHttp`, então o tratamento de erros 4xx do Fastify em `app.ts` não troca a mensagem por "Requisição inválida".

**Memória e instância única:** os contadores ficam na memória da API. Eles somem quando a API reinicia (quem estava bloqueado volta a poder tentar) e não são compartilhados entre instâncias: com duas ou mais cópias da API, cada uma conta por conta própria e o limite efetivo vira o dobro (ou mais). Para rodar várias instâncias, será preciso um contador compartilhado (o pacote suporta Redis).

**Privacidade:** IP, e-mail e corpo existem só na chave do contador, na memória, e nunca vão para o log.

**Proxy:** veja `TRUST_PROXY` em [`config/env.ts`](#configenvts).

### `plugins/autenticar-estacao.ts`

Confere o cabeçalho `Authorization: Bearer <token>`, encontra a estação pelo hash do token e a disponibiliza em `request.estacao` para a rota. Para proteger outra rota de estação, adicione `{ preHandler: autenticarEstacao }`, como em `leituras.routes.ts`.

---

## Banco de dados

O modelo das tabelas está em `prisma/schema.prisma`. Diagrama, convenções e regras de migração estão em [docs/banco-de-dados.md](../../docs/banco-de-dados.md).

Duas particularidades do Prisma 7, que a maioria dos tutoriais na internet ainda não mostra:

- O client é importado de `../generated/prisma/client`, e não de `@prisma/client`.
- A URL do banco fica em `prisma.config.ts`, e não no `schema.prisma`.

O seed (`pnpm db:seed`) **apaga** estações, leituras, alertas e pontos de apoio antes de recriar os dados fictícios. As cidades são criadas ou atualizadas com `upsert`, nunca apagadas. Nunca rode em produção.

---

## Testes

Os testes não precisam do banco nem de segredos reais: `vitest.config.ts` define `NODE_ENV=test`, `DATABASE_URL` e `JWT_SECRET` de teste (e, com `NODE_ENV=test`, o limite de tentativas fica desligado, porque os testes fazem muitas requisições do mesmo IP; `src/modules/auth/limites.routes.test.ts` o liga com `construirApp({ limitarTentativas: true })` e usa os números reais), e os módulos que usam o Prisma o substituem por um dublê. `src/app.test.ts` testa a API sem o banco:

- `GET /saude` responde ok;
- `POST /leituras` sem token responde 401;
- cadastro com dados inválidos responde 400;
- a pesquisa por rua responde 501.

As regras de cálculo (nível, estado, estimativa) são testadas no pacote `packages/shared`. Testes que dependem do banco ainda são manuais e estão registrados em [docs/validacao.md](../../docs/validacao.md).

```bash
pnpm test
```

---

## Comandos

Rode da raiz do repositório com `pnpm --filter @acquascan/api <comando>`, ou de dentro desta pasta com `pnpm <comando>`.

| Comando       | O que faz                                               |
| ------------- | ------------------------------------------------------- |
| `dev`         | Inicia com recarga automática a cada alteração          |
| `test`        | Roda os testes                                          |
| `typecheck`   | Verifica os tipos                                       |
| `db:migrate`  | Cria e aplica uma migração a partir do `schema.prisma`  |
| `db:seed`     | Recria os dados fictícios de desenvolvimento            |
| `db:generate` | Regera o Prisma Client (roda sozinho no `pnpm install`) |
| `db:studio`   | Abre o Prisma Studio para ver os dados no navegador     |
| `db:deploy`   | Aplica migrações existentes (para produção)             |

Algo deu errado? Veja [docs/solucao-de-problemas.md](../../docs/solucao-de-problemas.md).
