# Validação

Registro dos testes do aplicativo. Uma versão só recebe tag depois de validada aqui.

## v0.1.0: estrutura base

**Data:** 13/10/2026

### Verificações automáticas

| Verificação                           | Resultado                                             |
| ------------------------------------- | ----------------------------------------------------- |
| `pnpm install`                        | Aprovado, sem conflitos de dependências no app mobile |
| `pnpm typecheck` (4 pacotes)          | Aprovado                                              |
| `pnpm test`: shared                   | 31 testes aprovados                                   |
| `pnpm test`: API sem banco            | 4 testes aprovados                                    |
| `prisma validate` e `prisma generate` | Aprovados                                             |

### Teste de ponta a ponta (PostgreSQL 16 + PostGIS 3.4)

| Passo                                       | Resultado                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Seed                                        | 2 rios, 2 estações, 96 leituras e 3 pontos de apoio criados              |
| `GET /estacoes`                             | Retornou as 2 estações; a de teste 1 com 32,8% (estável)                 |
| `GET /pontos-apoio?lat=-22.505&lng=-43.178` | Ordenou pelo mais próximo: 678 m e 1.278 m (PostGIS funcionando)         |
| `POST /leituras` com token errado           | 401, como esperado                                                       |
| `POST /leituras` com distância negativa     | 400 com o campo inválido indicado                                        |
| Simulador, cenário `cheia`                  | Leituras aceitas; estado passou de estável para atenção e depois crítico |
| `GET /alertas`                              | 2 alertas registrados: estável → atenção e atenção → crítico             |
| `GET /estacoes/1`                           | Estimativa de transbordamento calculada a partir da subida               |
| `GET /previsao` sem internet                | 502 com mensagem clara (não derruba a API)                               |

As tabelas desse teste foram criadas manualmente porque o ambiente não tinha acesso ao servidor de binários do Prisma. **Pendente:** repetir com a migração `init` gerada por `pnpm db:migrate`.

### Pendente para fechar a v0.1.0

| Verificação                                               | Responsável | Resultado |
| --------------------------------------------------------- | ----------- | --------- |
| Gerar e commitar a migração `init`                        | [PREENCHER] |           |
| `GET /previsao` com internet                              | [PREENCHER] |           |
| App no Expo Go (Android)                                  | [PREENCHER] |           |
| App no Expo Go (iOS)                                      | [PREENCHER] |           |
| Mapa, lista e detalhe atualizando com o simulador rodando | [PREENCHER] |           |
| CI verde no GitHub                                        | [PREENCHER] |           |

### Ainda não automatizado

Os testes da API que dependem do banco são manuais. Próximo passo: um banco de teste no CI (serviço `postgis/postgis` no GitHub Actions).
