# @aquascan/shared

Código usado ao mesmo tempo pela API, pelo app e pelo simulador. Mudar algo aqui afeta os três.

| Arquivo            | Conteúdo                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/estado.ts`    | Cálculo do nível (cm e %), classificação do estado e estimativa até o transbordamento                   |
| `src/chuva.ts`     | Classificação da chuva prevista (limites provisórios)                                                   |
| `src/esquemas.ts`  | Validações Zod: leitura do ESP32, cadastro, login, coordenadas                                          |
| `src/tipos.ts`     | Formato das respostas da API                                                                            |
| `src/previsao.ts`  | `lerPrevisao`: lê a resposta de `GET /previsao` na forma de hoje (lista) e na do C4 (`{ atual, dias }`) |
| `src/contratos.ts` | Tipos dos contratos planejados (C1 a C7), ainda sem endpoint                                            |

```bash
pnpm --filter @aquascan/shared test
```

Toda regra nova em `estado.ts` ou `chuva.ts` deve vir com teste.
