# Changelog

Todas as mudanças relevantes do aplicativo AcquaScan (API, app mobile, pacote compartilhado e simulador).

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/). Mudanças ainda não lançadas ficam em **Não lançado**. Uma versão só recebe tag depois de validada em [docs/validacao.md](docs/validacao.md).

## [Não lançado]

### Alterado

- Cadastro (RF01): o usuário escolhe a **cidade** (`cidadeId`, lista de `GET /cidades`) no lugar do CEP, no esquema de `@acquascan/shared`, na API e na tela do app. A tela ainda não envia o cadastro à API
- `usuarios.cidade_id` passou a ser obrigatório (migração `cadastro_por_cidade`)
- O log de cada requisição passa a trazer só método e caminho, sem host, IP nem query string (`lib/log.ts`). Antes o Fastify registrava `remoteAddress`, `remotePort` e a URL completa
- Erros de requisição causados pelo cliente que o próprio Fastify detecta (como JSON malformado) passam a responder 400 `Requisição inválida`, em vez de 500 com registro no log

### Removido

- CEP, latitude e longitude do usuário: campos do cadastro, colunas `usuarios.cep`, `latitude` e `longitude` (apagadas na migração `cadastro_por_cidade`) e a consulta de CEP na BrasilAPI (`lib/cep.ts`), por minimização de dados (LGPD) e para o cadastro não depender de serviço externo
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
- Esqueleto que responde 501 para a pesquisa por rua
- Seed com dados fictícios de desenvolvimento
- `lib/senha.ts`: hash de senha com scrypt assíncrono (`node:crypto`), com os parâmetros gravados no próprio hash
- `POST /auth/cadastro`: valida, normaliza o e-mail, recusa e-mail repetido (409) e cidade inexistente (400), grava só o hash da senha e responde 201 com `id`, `nome` e `email`
- `POST /auth/login`: confere e-mail e senha (com hash fictício quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails têm conta) e responde 200 com um JWT e `{ id, nome, email }`; e-mail inexistente e senha errada dão o mesmo 401
- JWT com `@fastify/jwt` (HS256, `sub` com o id do usuário e validade em `JWT_EXPIRA_EM`, padrão 7 dias), com as variáveis `JWT_SECRET` e `JWT_EXPIRA_EM`
- Plugin `autenticar-usuario`: valida o token, busca o usuário no banco e o disponibiliza em `request.usuario`
- Limite de tentativas (`@fastify/rate-limit`, contadores em memória): login 10 por 15 min por IP + e-mail e 40 por 15 min por IP, cadastro 20 por hora por IP e exclusão de conta 5 por 15 min por IP; ao passar, 429 com `Retry-After` e cabeçalhos `x-ratelimit-*`. Números em `config/limites.ts`. Nova variável `TRUST_PROXY` (padrão `false`), necessária atrás de um proxy
- Registro de tokens de push (RF08, primeira etapa; nenhuma notificação é enviada ainda): `POST` e `DELETE /usuarios/me/push-token`. O token do Expo é único e passa a ser do usuário da sessão se já existia (reatribuição), cada usuário guarda no máximo 10 (os mais antigos saem) e o `DELETE` só apaga tokens do próprio usuário, sempre com 204. Coluna `push_tokens.atualizado_em` (migração `push_token_atualizado_em`) e `pushTokenEntradaSchema` em `@acquascan/shared`. O token nunca vai para log. O app só gera o token em aparelho físico com development build, não no Expo Go
- `GET /usuarios/me`: perfil de quem está logado (`id`, `nome`, `email`, `consentimentoEm`, `criadoEm` e `cidade`), sem a senha; tipo `Perfil` em `@acquascan/shared`
- `DELETE /auth/conta` (LGPD): exclui a conta de quem está logado, confirmada pela senha (403 se estiver errada), e apaga também os tokens de push; responde 204, inclusive se a conta já tiver sido apagada. Esquema `excluirContaEntradaSchema` em `@acquascan/shared`
- Cidades: tabela `cidades` (nome, UF, centro), `cidadeId` obrigatório nas estações e nos usuários (migrações `adiciona_cidades` e `cadastro_por_cidade`, que criam Petrópolis/RJ e ligam a ela as estações e os usuários existentes), tipo `Cidade` em `@acquascan/shared` e `GET /cidades`, público e em ordem alfabética

**Mobile**

- Abas: rios (mapa e lista), previsão, pontos de apoio e perfil
- Detalhe da estação com nível, estado, estimativa e histórico de 24 h
- Telas de login e cadastro com validação local e termo de consentimento
- Tema com a paleta azul e branca e estados acessíveis (cor, ícone e texto)

**Simulador**

- Cenários `estavel`, `cheia` e `vazante` enviando leituras para a API
