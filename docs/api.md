# API

Base em desenvolvimento: `http://localhost:3333`. Respostas em JSON, datas em ISO 8601 (UTC). Os tipos das respostas estão em [`packages/shared/src/tipos.ts`](../packages/shared/src/tipos.ts).

## Endpoints

| Método | Rota                                | Descrição                                                    | Status       |
| ------ | ----------------------------------- | ------------------------------------------------------------ | ------------ |
| GET    | `/saude`                            | A API está no ar?                                            | Pronto       |
| GET    | `/saude/banco`                      | A API alcança o banco?                                       | Pronto       |
| POST   | `/leituras`                         | Recebe uma leitura de estação (autenticado)                  | Pronto       |
| GET    | `/estacoes`                         | Estações ativas com a última leitura                         | Pronto       |
| GET    | `/estacoes/:id`                     | Detalhe com limites e estimativa                             | Pronto       |
| GET    | `/estacoes/:id/leituras?horas=24`   | Histórico (1 a 168 horas)                                    | Pronto       |
| GET    | `/rios`                             | Rios com suas estações                                       | Pronto       |
| GET    | `/alertas?horas=24`                 | Alertas recentes                                             | Pronto       |
| GET    | `/pontos-apoio?lat=&lng=&limite=10` | Pontos de apoio; com `lat`/`lng`, ordenados por distância    | Pronto       |
| GET    | `/previsao`                         | Próximos 7 dias (Open-Meteo, cache de 30 min)                | Pronto       |
| POST   | `/auth/cadastro`                    | Cadastro de usuário (responde 201 com `id`, `nome`, `email`) | Pronto       |
| POST   | `/auth/login`                       | Login                                                        | 501 (v0.2.0) |
| GET    | `/ruas/busca?q=`                    | Pesquisa por rua                                             | 501 (v0.3.0) |

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

## Erros

Todos os erros seguem o formato `{ "erro": "mensagem", "detalhes": ... }`.

| Código | Quando                                                                   |
| ------ | ------------------------------------------------------------------------ |
| 400    | Dados inválidos (`detalhes` lista os campos com problema)                |
| 401    | Token de estação ausente, inválido ou estação desativada                 |
| 404    | Recurso não encontrado                                                   |
| 409    | E-mail já cadastrado                                                     |
| 501    | Funcionalidade ainda não implementada (a mensagem diz a versão prevista) |
| 502    | Serviço externo (previsão do tempo) indisponível                         |
| 500    | Erro inesperado (detalhes no log da API)                                 |
