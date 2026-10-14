# Banco de dados

PostgreSQL com a extensão PostGIS. O modelo é definido em [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).

## Diagrama

```mermaid
erDiagram
    rios ||--o{ estacoes : tem
    estacoes ||--o{ leituras : registra
    estacoes ||--o{ alertas : gera
    usuarios ||--o{ push_tokens : possui

    rios {
        int id PK
        text nome UK
    }
    estacoes {
        int id PK
        text nome
        int rio_id FK
        float latitude
        float longitude
        float altura_instalacao_cm
        float nivel_transbordamento_cm
        float limite_atencao_pct
        float limite_critico_pct
        text token_hash UK
        bool ativa
    }
    leituras {
        int id PK
        int estacao_id FK
        float distancia_cm
        float nivel_cm
        float nivel_pct
        float vazao_lpm
        enum estado
        timestamp medido_em
        timestamp recebido_em
    }
    alertas {
        int id PK
        int estacao_id FK
        enum estado_anterior
        enum estado_novo
        timestamp criado_em
        timestamp enviado_em
    }
    pontos_apoio {
        int id PK
        text nome
        text endereco
        int capacidade
        text contato
        float latitude
        float longitude
        bool ativo
    }
    usuarios {
        int id PK
        text nome
        text email UK
        text cep
        float latitude
        float longitude
        text senha_hash
        timestamp consentimento_em
    }
    push_tokens {
        int id PK
        int usuario_id FK
        text token UK
    }
```

## Convenções

- No código (Prisma), campos em `camelCase`. No banco, tabelas e colunas em `snake_case` (via `@map`).
- Consultas SQL diretas (`$queryRaw`) usam os nomes do banco, como `pontos_apoio` e `distancia_m`.
- A leitura guarda a **distância bruta** e também o nível e o estado calculados. Se os parâmetros da estação mudarem, o histórico continua mostrando o estado da época.

## Coordenadas e PostGIS

Para o MVP, as coordenadas ficam em colunas `latitude` e `longitude` comuns, e as consultas por distância montam o ponto geográfico na hora:

```sql
ST_Distance(
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
  ST_SetSRID(ST_MakePoint(-43.178, -22.505), 4326)::geography
)  -- distância em metros
```

Com dezenas de pontos isso é instantâneo. Quando a pesquisa por rua chegar (v0.3.0), as ruas do OpenStreetMap precisarão de colunas geográficas de verdade, com índice espacial.

## Migrações

```bash
# 1. Edite apps/api/prisma/schema.prisma
# 2. Gere e aplique a migração (dê um nome descritivo)
pnpm db:migrate
# 3. Commite a pasta apps/api/prisma/migrations junto com o schema
```

Regras:

- Nunca edite uma migração que já foi para a `main`. Crie uma nova.
- A primeira migração (`init`) é criada no primeiro `pnpm db:migrate` e deve ser commitada.
- Em produção, use `pnpm --filter @acquascan/api db:deploy`, que só aplica migrações existentes.

## Dados de desenvolvimento

`pnpm db:seed` **apaga** estações, leituras, alertas e pontos de apoio e recria dados fictícios. Nunca rode em produção.
