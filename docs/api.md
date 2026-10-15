# API

Base em desenvolvimento: `http://localhost:3333`. Respostas em JSON, datas em ISO 8601 (UTC). Os tipos das respostas estão em [`packages/shared/src/tipos.ts`](../packages/shared/src/tipos.ts).

## Endpoints

| Método | Rota                                | Descrição                                                 | Status       |
| ------ | ----------------------------------- | --------------------------------------------------------- | ------------ |
| GET    | `/saude`                            | A API está no ar?                                         | Pronto       |
| GET    | `/saude/banco`                      | A API alcança o banco?                                    | Pronto       |
| POST   | `/leituras`                         | Recebe uma leitura de estação (autenticado)               | Pronto       |
| GET    | `/estacoes`                         | Estações ativas com a última leitura                      | Pronto       |
| GET    | `/estacoes/:id`                     | Detalhe com limites e estimativa                          | Pronto       |
| GET    | `/estacoes/:id/leituras?horas=24`   | Histórico (1 a 168 horas)                                 | Pronto       |
| GET    | `/cidades`                          | Cidades atendidas, em ordem alfabética (público)          | Pronto       |
| GET    | `/rios`                             | Rios com suas estações                                    | Pronto       |
| GET    | `/alertas?horas=24`                 | Alertas recentes                                          | Pronto       |
| GET    | `/pontos-apoio?lat=&lng=&limite=10` | Pontos de apoio; com `lat`/`lng`, ordenados por distância | Pronto       |
| GET    | `/previsao`                         | Próximos 7 dias (Open-Meteo, cache de 30 min)             | Pronto       |
| POST   | `/auth/cadastro`                    | Cadastro com nome, e-mail, senha e cidade (201)           | Pronto       |
| POST   | `/auth/login`                       | Login (responde 200 com `token` e `usuario`)              | Pronto       |
| GET    | `/ruas/busca?q=`                    | Pesquisa por rua                                          | 501 (v0.3.0) |

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

## Erros

Todos os erros seguem o formato `{ "erro": "mensagem", "detalhes": ... }`.

| Código | Quando                                                                     |
| ------ | -------------------------------------------------------------------------- |
| 400    | Dados inválidos (`detalhes` lista os campos com problema)                  |
| 401    | Token de estação ou de usuário ausente, inválido ou expirado; login errado |
| 404    | Recurso não encontrado                                                     |
| 409    | E-mail já cadastrado                                                       |
| 501    | Funcionalidade ainda não implementada (a mensagem diz a versão prevista)   |
| 502    | Serviço externo (previsão do tempo) indisponível                           |
| 500    | Erro inesperado (detalhes no log da API)                                   |
