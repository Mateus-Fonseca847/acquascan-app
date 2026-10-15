# API

Base em desenvolvimento: `http://localhost:3333`. Respostas em JSON, datas em ISO 8601 (UTC). Os tipos das respostas estão em [`packages/shared/src/tipos.ts`](../packages/shared/src/tipos.ts).

## Endpoints

| Método | Rota                                | Descrição                                                     | Status       |
| ------ | ----------------------------------- | ------------------------------------------------------------- | ------------ |
| GET    | `/saude`                            | A API está no ar?                                             | Pronto       |
| GET    | `/saude/banco`                      | A API alcança o banco?                                        | Pronto       |
| POST   | `/leituras`                         | Recebe uma leitura de estação (autenticado)                   | Pronto       |
| GET    | `/estacoes`                         | Estações ativas com a última leitura                          | Pronto       |
| GET    | `/estacoes/:id`                     | Detalhe com limites e estimativa                              | Pronto       |
| GET    | `/estacoes/:id/leituras?horas=24`   | Histórico (1 a 168 horas)                                     | Pronto       |
| GET    | `/cidades`                          | Cidades atendidas, em ordem alfabética (público)              | Pronto       |
| GET    | `/rios`                             | Rios com suas estações                                        | Pronto       |
| GET    | `/alertas?horas=24`                 | Alertas recentes                                              | Pronto       |
| GET    | `/pontos-apoio?lat=&lng=&limite=10` | Pontos de apoio; com `lat`/`lng`, ordenados por distância     | Pronto       |
| GET    | `/previsao`                         | Próximos 7 dias (Open-Meteo, cache de 30 min)                 | Pronto       |
| POST   | `/auth/cadastro`                    | Cadastro com nome, e-mail, senha e cidade (201)               | Pronto       |
| POST   | `/auth/login`                       | Login (responde 200 com `token` e `usuario`)                  | Pronto       |
| GET    | `/usuarios/me`                      | Perfil de quem está logado (exige token)                      | Pronto       |
| POST   | `/usuarios/me/push-token`           | Registra o token de push do aparelho; corpo `{ token }` (204) | Pronto       |
| DELETE | `/usuarios/me/push-token`           | Remove o token de push; corpo `{ token }` (204)               | Pronto       |
| DELETE | `/auth/conta`                       | Exclui a conta; corpo `{ senha }` (exige token, 204)          | Pronto       |
| GET    | `/ruas/busca?q=`                    | Pesquisa por rua                                              | 501 (v0.3.0) |

## Leitura enviada pela estação (ESP32)

```http
POST /leituras
Authorization: Bearer <token-da-estacao>
Content-Type: application/json

{
  "distanciaCm": 180.5,
  "vazaoLpm": 7.33,
  "medidoEm": "2026-10-13T14:30:00Z"
}
```

| Campo         | Obrigatório | Regra                                                                           |
| ------------- | ----------- | ------------------------------------------------------------------------------- |
| `distanciaCm` | Sim         | Distância do sensor até a água, maior que 0 e até 2000                          |
| `vazaoLpm`    | Não         | Vazão em L/min, de 0 a 1000                                                     |
| `medidoEm`    | Não         | Data ISO 8601. Sem ela, vale a hora de chegada (o ESP32 só sabe a hora com NTP) |

Resposta `201`:

```json
{ "id": 97, "nivelCm": 219.5, "nivelPct": 73.2, "estado": "ATENCAO" }
```

Teste com `curl` usando o token do seed:

```bash
curl -X POST http://localhost:3333/leituras \
  -H "Authorization: Bearer dev-token-estacao-1" \
  -H "Content-Type: application/json" \
  -d '{"distanciaCm": 150}'
```

## Cidades

`GET /cidades` não exige autenticação e devolve as cidades em ordem alfabética (lista vazia se não houver nenhuma):

```json
[{ "id": 1, "nome": "Petrópolis", "uf": "RJ", "latitude": -22.505, "longitude": -43.17861 }]
```

`latitude` e `longitude` são o centro da cidade.

## Cadastro

```bash
curl -X POST http://localhost:3333/auth/cadastro \
  -H "Content-Type: application/json" \
  -d '{ "nome": "Maria", "email": "maria@example.com", "cidadeId": 1, "senha": "no-minimo-8-caracteres", "consentimento": true }'
```

`cidadeId` é o `id` de uma cidade de `GET /cidades`. A senha tem de 8 a 128 caracteres e `consentimento` precisa ser `true`. Campos que não fazem parte do cadastro (como `cep`) são ignorados. Resposta 201: `{ "id": 1, "nome": "Maria", "email": "maria@example.com" }`.

| Código | Quando                               |
| ------ | ------------------------------------ |
| 400    | Dados inválidos ou `Cidade inválida` |
| 409    | `E-mail já cadastrado`               |

## Login e token do usuário

```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "maria@example.com", "senha": "a-senha-dela" }'
```

Resposta 200: `{ "token": "<jwt>", "usuario": { "id": 1, "nome": "Maria", "email": "maria@example.com" } }`. E-mail inexistente e senha errada dão o mesmo 401, `{ "erro": "E-mail ou senha incorretos" }`.

O app guarda o token e o envia nas rotas protegidas: `Authorization: Bearer <token>`. O token vale por `JWT_EXPIRA_EM` (padrão 7 dias); depois disso, ou se a conta for apagada, as rotas protegidas respondem 401 e o usuário precisa entrar de novo. Nenhuma rota usa o token ainda; a primeira será `DELETE /auth/conta`.

## Perfil e exclusão da conta

Os dois exigem `Authorization: Bearer <token>` (o token do login).

```bash
curl http://localhost:3333/usuarios/me -H "Authorization: Bearer <token>"
```

Resposta 200:

```json
{
  "id": 1,
  "nome": "Maria",
  "email": "maria@example.com",
  "consentimentoEm": "2026-10-15T12:00:00.000Z",
  "criadoEm": "2026-10-15T12:00:00.000Z",
  "cidade": {
    "id": 1,
    "nome": "Petrópolis",
    "uf": "RJ",
    "latitude": -22.505,
    "longitude": -43.17861
  }
}
```

```bash
curl -X DELETE http://localhost:3333/auth/conta \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "senha": "a-senha-dela" }'
```

Resposta 204, sem corpo. A conta e os tokens de push são apagados, e o mesmo token passa a dar 401. Chamar de novo com um usuário que já foi apagado também responde 204. Senha incorreta responde **403** `Senha incorreta` (e não 401, para o app não confundir com sessão expirada); corpo sem `senha` ou com JSON malformado, 400.

## Limite de tentativas

Para segurar tentativas de adivinhar senhas, três rotas têm limite. Todas as tentativas contam, inclusive as que dão certo:

| Rota                  | Limite                                                        |
| --------------------- | ------------------------------------------------------------- |
| `POST /auth/login`    | 10 por 15 minutos por IP + e-mail, e 40 por 15 minutos por IP |
| `POST /auth/cadastro` | 20 por hora por IP                                            |
| `DELETE /auth/conta`  | 5 por 15 minutos por IP                                       |

Ao passar do limite: **429** com `{ "erro": "Muitas tentativas. Tente de novo em alguns minutos." }` e o cabeçalho `Retry-After` (segundos até poder tentar de novo). As respostas dessas rotas trazem `x-ratelimit-limit`, `x-ratelimit-remaining` e `x-ratelimit-reset`. O app deve mostrar a mensagem e esperar o tempo de `Retry-After`. Os contadores ficam na memória da API (somem ao reiniciar). Atrás de um proxy, a variável `TRUST_PROXY` precisa estar ligada, senão todos dividem o mesmo IP (veja o README da API).

## Token de notificação (push)

Os dois endpoints exigem `Authorization: Bearer <token>` e o corpo `{ "token": "ExponentPushToken[...]" }`. Respondem **204**, sem corpo.

```bash
curl -X POST http://localhost:3333/usuarios/me/push-token \
  -H "Authorization: Bearer <sessão>" -H "Content-Type: application/json" \
  -d '{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }'
```

- `POST` registra o token do aparelho. Se o token já existir (mesmo de outro usuário), passa a ser do usuário da sessão. Cada usuário guarda no máximo 10 tokens; ao passar disso, os mais antigos são apagados. Repetir o registro é seguro.
- `DELETE` remove o token só se ele for do usuário da sessão. Token inexistente ou de outro usuário também responde 204.
- O formato é `ExponentPushToken[...]` ou `ExpoPushToken[...]` (até 200 caracteres, sem espaços); outro formato responde 400. Sem sessão, 401.
- O app deve chamar o `POST` só depois de o usuário permitir as notificações, e o `DELETE` ao sair da conta. **O token só é gerado em aparelho físico com development build, e não no Expo Go.**
- Nesta etapa a API só guarda os tokens; ainda não envia notificações.

## Erros

Todos os erros seguem o formato `{ "erro": "mensagem", "detalhes": ... }`.

| Código | Quando                                                                       |
| ------ | ---------------------------------------------------------------------------- |
| 400    | Dados inválidos (`detalhes` lista os campos com problema) ou JSON malformado |
| 401    | Token de estação ou de usuário ausente, inválido ou expirado; login errado   |
| 403    | Senha incorreta ao excluir a conta                                           |
| 404    | Recurso não encontrado                                                       |
| 409    | E-mail já cadastrado                                                         |
| 429    | Muitas tentativas (login, cadastro ou exclusão de conta); veja `Retry-After` |
| 501    | Funcionalidade ainda não implementada (a mensagem diz a versão prevista)     |
| 502    | Serviço externo (previsão do tempo) indisponível                             |
| 500    | Erro inesperado (detalhes no log da API)                                     |
