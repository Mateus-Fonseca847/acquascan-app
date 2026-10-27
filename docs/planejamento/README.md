# Planejamento do AquaScan

Esta pasta é o plano de trabalho compartilhado entre quem cuida do **backend, dados e roteamento** e quem
cuida do **frontend**. Cada lado tem o seu Claude Code, e os dois seguem o mesmo `CLAUDE.md`.

## Ordem de leitura

| #   | Arquivo                                            | Para quê                                                                               |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | [contexto-e-decisoes.md](contexto-e-decisoes.md)   | O produto, o estado atual e as decisões vigentes (inclui onde o PDF do Figma não vale) |
| 2   | [trabalho-em-paralelo.md](trabalho-em-paralelo.md) | Dono de cada pasta, branches, PRs, arquivos que dão conflito                           |
| 3   | [contratos-api.md](contratos-api.md)               | Endpoints e campos planejados, para o frontend e a API andarem em paralelo             |
| 4   | [tarefas-frontend.md](tarefas-frontend.md)         | Cartões do frontend (`FE-xx`)                                                          |
| 5   | [tarefas-backend.md](tarefas-backend.md)           | Cartões do backend, dados e roteamento (`BE-xx`, `RT-xx`)                              |
| 6   | [quadro.md](quadro.md)                             | Status de cada cartão                                                                  |

## Glossário dos IDs

| ID              | Significa                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `FE-xx`         | Tarefa do frontend (`apps/mobile`)                                                                 |
| `BE-xx`         | Tarefa do backend (`apps/api`, `packages/shared`, banco, CI)                                       |
| `RT-xx`         | Tarefa de roteamento, dados geográficos e desvio de rios                                           |
| Contrato        | Descrição de endpoint ou campo que o frontend e a API combinam antes de implementar                |
| Flag de recurso | Chave em `apps/mobile/src/config/recursos.ts` que liga uma tela quando a API correspondente existe |
| Frontend        | `apps/mobile` (o aplicativo móvel)                                                                 |

Nomes antigos que aparecem em commits e no CHANGELOG: `F1..F10` (fases do frontend), `B1..B8` (blocos de
backend) e `R1..R8` (etapas do roteamento). O mapeamento está em [quadro.md](quadro.md).

## Como pegar uma tarefa

1. Escolha o primeiro cartão do seu lado cujo status seja "A fazer" e cujas dependências estejam "Feito".
2. Atualize a `main` e crie a branch com o nome indicado no cartão (de preferência num `git worktree`).
3. Cole este prompt no Claude Code:

```
Leia CLAUDE.md e docs/planejamento/README.md. Execute a tarefa <ID> de docs/planejamento/<arquivo>.md.
Antes de codar, me liste as dúvidas e o que vai tocar. Não faça commit.
```

4. Revise o diff, rode o roteiro de teste do cartão, faça o commit e abra o PR com o modelo da pasta
   `.github`.
5. Atualize a sua linha em [quadro.md](quadro.md) no mesmo PR.

## Se travar

- Falta de informação ou de endpoint: abra uma issue com o rótulo `bloqueado`, cite o ID do cartão e pegue
  o próximo cartão que não dependa disso.
- Discordância com uma decisão: abra uma issue com o rótulo `decisao`. Ninguém muda uma decisão vigente
  sozinho; quem decide está em [contexto-e-decisoes.md](contexto-e-decisoes.md).
- Bug em código do outro lado: issue com rótulo `bug` e os passos para reproduzir. Não corrija em pasta
  que não é sua.

## Regra de ouro

Documentação e código andam juntos. Um PR que muda comportamento atualiza `docs/api.md`, o README do pacote
e o `CHANGELOG.md`. Documentação desatualizada é pior que nenhuma.
