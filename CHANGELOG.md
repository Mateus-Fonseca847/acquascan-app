# Changelog

Todas as mudanças relevantes do aplicativo AcquaScan (API, app mobile, pacote compartilhado e simulador).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/). Mudanças ainda não lançadas ficam em **Não lançado**. Uma versão só recebe tag depois de validada em [docs/validacao.md](docs/validacao.md).

## [Não lançado]

### Removido

- Telefone do cadastro de usuário (campo no app, validação em `@acquascan/shared` e coluna `usuarios.telefone` via migração `remove_telefone_usuario`), por não ter finalidade e em respeito ao princípio da minimização da LGPD

### Adicionado

**Estrutura**

- Monorepo com pnpm workspaces: `apps/api`, `apps/mobile`, `packages/shared` e `tools/simulador`
- Banco PostgreSQL + PostGIS via Docker Compose
- CI no GitHub Actions: formatação, verificação de tipos e testes
- Documentação: requisitos, arquitetura, banco de dados, API, decisões, privacidade, validação e solução de problemas

**Shared**

- Cálculo do nível (cm e %), classificação do estado e estimativa até o transbordamento
- Classificação provisória do risco de chuva
- Validações da leitura do ESP32, do cadastro e do login
- Limite de 128 caracteres para a senha no cadastro e no login
- 31 testes unitários

**API**

- `POST /leituras` com autenticação da estação por token (só o hash fica no banco)
- `GET /estacoes`, `GET /estacoes/:id` (com estimativa) e `GET /estacoes/:id/leituras`
- `GET /rios`, `GET /alertas` e registro automático de alerta quando o estado piora
- `GET /pontos-apoio`, com ordenação por distância via PostGIS quando recebe `lat` e `lng`
- `GET /previsao` com os próximos 7 dias via Open-Meteo e cache de 30 minutos
- `GET /saude` e `GET /saude/banco`
- Esqueletos que respondem 501 para cadastro, login e pesquisa por rua
- Seed com dados fictícios de desenvolvimento
- `lib/senha.ts`: hash de senha com scrypt assíncrono (`node:crypto`), com os parâmetros gravados no próprio hash
- `lib/cep.ts`: consulta de CEP na BrasilAPI v2 para obter as coordenadas do usuário, com timeout de 5 s e sem registrar dados em log

**Mobile**

- Abas: rios (mapa e lista), previsão, pontos de apoio e perfil
- Detalhe da estação com nível, estado, estimativa e histórico de 24 h
- Telas de login e cadastro com validação local e termo de consentimento
- Tema com a paleta azul e branca e estados acessíveis (cor, ícone e texto)

**Simulador**

- Cenários `estavel`, `cheia` e `vazante` enviando leituras para a API
