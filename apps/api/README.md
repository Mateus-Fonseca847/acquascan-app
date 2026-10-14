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

Essa separação permite reaproveitar uma regra em mais de um lugar e testá-la sem subir o servidor. Em módulos muito simples, como `rios` e `saude`, as rotas falam direto com o banco e não há service.

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
│   ├── plugins/             ← autenticação das estações
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

### `auth` e `ruas`: reservados para as próximas versões

**Endpoints:** `POST /auth/cadastro`, `POST /auth/login` e `GET /ruas/busca`

Já existem, mas respondem **501** com uma mensagem indicando a versão prevista. O cadastro e o login já validam os dados recebidos com os mesmos esquemas usados pelo app. Os comentários `TODO` nos arquivos descrevem o que falta fazer.

| Funcionalidade   | Versão | Requisito  |
| ---------------- | ------ | ---------- |
| Cadastro e login | v0.2.0 | RF01, RF02 |
| Pesquisa por rua | v0.3.0 | RF04       |

---

## Peças de apoio

### `config/env.ts`

Lê o arquivo `.env` e confere cada variável com o Zod. Se faltar alguma, como `DATABASE_URL`, a API **para logo ao iniciar** e diz qual é o problema. É melhor do que subir aparentemente normal e falhar na primeira requisição.

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

### `plugins/autenticar-estacao.ts`

Confere o cabeçalho `Authorization: Bearer <token>`, encontra a estação pelo hash do token e a disponibiliza em `request.estacao` para a rota. Para proteger outra rota de estação, adicione `{ preHandler: autenticarEstacao }`, como em `leituras.routes.ts`.

---

## Banco de dados

O modelo das tabelas está em `prisma/schema.prisma`. Diagrama, convenções e regras de migração estão em [docs/banco-de-dados.md](../../docs/banco-de-dados.md).

Duas particularidades do Prisma 7, que a maioria dos tutoriais na internet ainda não mostra:

- O client é importado de `../generated/prisma/client`, e não de `@prisma/client`.
- A URL do banco fica em `prisma.config.ts`, e não no `schema.prisma`.

O seed (`pnpm db:seed`) **apaga** estações, leituras, alertas e pontos de apoio antes de recriar os dados fictícios. Nunca rode em produção.

---

## Testes

`src/app.test.ts` testa a API sem precisar do banco:

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
