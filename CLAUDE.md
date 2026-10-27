# AquaScan: instruções para o Claude Code

App de alerta de enchentes para Petrópolis (RJ). Projeto acadêmico e de utilidade pública. Um erro aqui pode
colocar alguém em risco: na dúvida, seja conservador e pergunte.

## Leia antes de qualquer tarefa

1. `docs/planejamento/README.md`: índice, glossário e como pegar uma tarefa.
2. `docs/planejamento/contexto-e-decisoes.md`: o que é o produto e o que já foi decidido.
3. `docs/planejamento/trabalho-em-paralelo.md`: dono de cada pasta, branches, PRs.
4. A tarefa em `docs/planejamento/tarefas-frontend.md` ou `tarefas-backend.md`.
5. `docs/api.md` (API real), `docs/planejamento/contratos-api.md` (endpoints planejados), o README do pacote
   que você vai mexer.

## Mapa do repositório

| Pasta                 | O que é                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `apps/api`            | API (Fastify 5, Prisma, PostgreSQL + PostGIS)                              |
| `apps/mobile`         | Frontend (Expo SDK 57, Expo Router, TanStack Query)                        |
| `packages/shared`     | Tipos, esquemas Zod e regras de nível e estado (usados por API e frontend) |
| `packages/roteamento` | Rotas a pé com A\*, instruções de curva (roda no celular)                  |
| `packages/desvio`     | Política de desvio de rios em estado crítico                               |
| `tools/grafo`         | Gera o grafo de ruas, os rios e a exposição a partir do OpenStreetMap      |
| `tools/simulador`     | Simula estações enviando leituras                                          |
| `docs/`               | Documentação; `docs/planejamento/` é o plano de trabalho                   |

## Comandos (na raiz)

```
pnpm install                  pnpm db:up   pnpm db:migrate   pnpm db:seed
pnpm dev:api                  pnpm dev:mobile -- --clear
pnpm typecheck                pnpm test    pnpm format:check
pnpm dados:app                (copia grafo, rios e exposição para o frontend)
pnpm grafo:construir | grafo:rios | grafo:exposicao   (rodar sempre rios e exposição juntos)
pnpm --filter @acquascan/api db:generate               (após mudar o schema)
```

## Fluxo de trabalho

- Uma tarefa = uma branch = um PR. Nome: `feat/<id-da-tarefa>-<assunto>`, ex. `feat/fe-03-auth-visual`.
  Crie a partir da `main` atualizada. Nunca trabalhe na `main`.
- **Não faça commit nem push.** Termine com o resumo e deixe o desenvolvedor revisar o diff e commitar.
  Mensagens de commit sugeridas, em português, no padrão `feat(mobile): ...`, `fix(api): ...`, `docs: ...`.
- Só mexa nas pastas que são do dono da sua tarefa (tabela em `trabalho-em-paralelo.md`). Se precisar mexer
  fora, pare e peça.
- Nunca use `git stash`, `git reset` nem `git checkout` para descartar mudanças.
- Ao terminar: `pnpm typecheck`, `pnpm test` e `pnpm format:check` verdes.
- Apague scripts temporários (`ed*.py` e semelhantes). Nunca deixe `.env`, `saida/`, `cache/` nem
  `apps/mobile/assets/roteamento/` no commit.
- Termine toda tarefa com: arquivos alterados, como testar, diferenças em relação ao Figma e dúvidas.

## Código

- Identificadores e textos em português do Brasil, como o resto do código.
- Chamadas HTTP do frontend só em `apps/mobile/src/services/api.ts`; telas usam os hooks de
  `src/hooks/consultas.ts`.
- Sessão pelo `useSessao()`. Só **401 de chamada autenticada** encerra a sessão. 403 e falha de rede não.
- Cores, fontes e espaços só de `src/theme`. Nunca hexadecimal solto numa tela.
- Migração já aplicada não se edita: crie outra. Se o schema mudar, rode `db:generate`.
- Teste a lógica pura. Quando o frontend não tiver runner, isole a lógica em funções puras e avise.

## Dependências

- Versão exata (sem `^`), publicada há mais de 14 dias. Pacotes do Expo, com `expo install`.
- Nada novo sem avisar e justificar. Mudança em `pnpm-lock.yaml` só quando houver dependência nova.

## Segurança e privacidade (LGPD)

- Nunca registre em log: senha, token, e-mail, nome, localização, push token, IP ou corpo de requisição.
- O servidor não guarda a localização do aparelho. A localização é pedida só em primeiro plano.
- Não existe telefone no cadastro. Não existe CEP. Região é a cidade escolhida de `GET /cidades`.
- Erros do banco não vazam para o usuário: mensagem genérica.

## Interface e honestidade

- Estado do rio sempre com **cor + ícone + texto**: Estável, Atenção, Crítico, Sem dados.
- Fonte mínima de 16 px, alvo de toque mínimo de 44 px, rótulos de acessibilidade, contraste suficiente.
- Todo erro diz o que houve e oferece "Tentar de novo". Todo carregamento, estado vazio e "sem internet"
  precisam existir.
- **Nunca invente dado.** Capacidade, contato ou coordenada desconhecidos ficam vazios, não são chutados.
- O app nunca promete segurança. Mantenha o aviso "Estes alertas não substituem a Defesa Civil" e o
  telefone 199 onde o design pedir.
- O app não cobre deslizamento, rios sem estação nem vias interditadas, e deve dizer isso nos textos legais.
- Atribuição obrigatória: "© colaboradores do OpenStreetMap" onde houver mapa ou rota.

## Quando houver dúvida

Se o PDF do design e uma decisão em `contexto-e-decisoes.md` discordarem, **vale a decisão**. A lista do que
não vale no PDF está lá. Se faltar informação, pergunte antes de codar.
