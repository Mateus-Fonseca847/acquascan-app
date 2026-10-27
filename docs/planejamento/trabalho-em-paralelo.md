# Trabalho em paralelo

Dois lados trabalham ao mesmo tempo, cada um com o seu Claude Code:

- **Backend**: API, banco, `packages/*`, ferramentas, dados geográficos e roteamento.
- **Frontend** : `apps/mobile`.

A regra que sustenta tudo: **cada pasta tem um dono, e só o dono edita**. Quem precisa de uma mudança fora
da sua pasta pede por issue ou PR de contrato. Assim os dois lados quase nunca conflitam.

## 1. Quem é dono de quê

| Pasta ou arquivo                                                                      | Dono              | O outro lado                                                      |
| ------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `apps/api`                                                                            | Backend           | Só lê                                                             |
| `packages/shared`                                                                     | Backend           | Só lê. Precisa de um tipo? Abra uma issue com o rótulo `contrato` |
| `packages/roteamento`, `packages/desvio`                                              | Backend           | Usa a API pública documentada no README de cada um. Não edita     |
| `tools/*`                                                                             | Backend           | Só lê                                                             |
| `docs/api.md`, `docs/banco-de-dados.md`, `docs/decisoes.md`, `docs/creditos-dados.md` | Backend           | Só lê                                                             |
| `apps/mobile`                                                                         | Frontend          | Só lê                                                             |
| `apps/mobile/src/roteamento/`, `apps/mobile/app/(dev)/`                               | Backend (RT)      | O frontend não edita sem avisar: a tela de rota nasce aqui        |
| `docs/design`                                                                         | Frontend          | Só lê                                                             |
| `docs/planejamento`, `CLAUDE.md`, `.github`                                           | **Compartilhado** | PR de docs, revisado pelo outro lado                              |
| `CHANGELOG.md`, `pnpm-lock.yaml`                                                      | **Compartilhado** | Ver a seção 5                                                     |

## 2. Branches

- Nome: `feat/<id-do-cartão>-<assunto>`, tudo em minúsculas, ex. `feat/fe-03-auth-visual`,
  `feat/be-01-sem-dados`, `feat/rt-01-textos-curva`. Correções: `fix/<assunto>`. Só docs: `docs/<assunto>`.
- **Uma tarefa, uma branch, um PR.** PR pequeno (referência: menos de uns 400 linhas de diff sem contar
  testes, docs e arquivos gerados). Se passou disso, divida a tarefa.
- Sempre crie a partir da `main` atualizada. **Nada de branch em cima de branch**: se depende de algo não
  mergeado, espere o merge ou combine uma ordem na issue.
- Antes de abrir o PR e a cada dia em branches longas: `git fetch origin` e `git rebase origin/main`.
- Merge pelo GitHub com **squash**; o título do PR vira a mensagem do commit (`feat(mobile): ...`).
  Apague a branch depois do merge.
- A `main` é protegida: exige CI verde e uma aprovação **do outro lado**. Ninguém envia direto para ela.

## 3. Contrato primeiro

O frontend não espera a API ficar pronta. O protocolo, para cada endpoint novo:

1. **PR de contrato** (Backend): tipos em `packages/shared` e a seção correspondente em `docs/api.md` e em
   [contratos-api.md](contratos-api.md), sem implementação. Mergeia rápido.
2. **O frontend constrói a tela atrás de uma flag** em `apps/mobile/src/config/recursos.ts`, desligada, usando
   dados de exemplo em `apps/mobile/src/fixtures/` tipados com os tipos de `@acquascan/shared`. Se o contrato
   mudar, o compilador avisa.
3. **PR de implementação** (Backend): endpoint pronto, testes, docs e status do contrato atualizado.
4. **O frontend liga a flag** (PR de uma linha em `recursos.ts`), troca a fixture pelo hook real e testa no
   celular com a API de verdade.

Mudar um contrato já publicado: issue com o rótulo `contrato`, ambos concordam, o Backend atualiza
[contratos-api.md](contratos-api.md) (inclusive o histórico no fim) e `packages/shared`, e o frontend se adapta.
Mudança que quebra o frontend precisa de aviso explícito na issue antes do merge.

## 4. Rotina

1. **Começar:** `git fetch origin`, olhar [quadro.md](quadro.md) e os PRs abertos, pegar o próximo cartão.
2. **Trabalhar:** de preferência num `git worktree` por tarefa:
   ```
   git fetch origin
   git worktree add ../acquascan-fe-03 -b feat/fe-03-auth-visual origin/main
   cd ../acquascan-fe-03
   pnpm install
   ```
   Copie os `.env` da pasta principal. Cada worktree tem os seus `node_modules`.
3. **Banco local:** se duas worktrees do **backend** aplicam migrações diferentes, o mesmo banco local
   acusa divergência. Use um `DATABASE_URL` com nome de banco diferente por worktree. O dev frontend roda a
   API a partir da `main` e não cria migrações.
4. **Antes do PR:** `git rebase origin/main`; `pnpm typecheck`, `pnpm test`, `pnpm format:check`; roteiro de
   teste do cartão; nenhum arquivo solto; CHANGELOG e docs atualizados; linha do [quadro.md](quadro.md).
5. **PR:** Preencha "Impacto para o outro lado": nova
   migração (o outro precisa rodar `pnpm db:migrate`), variável de ambiente nova, dependência nova
   (`pnpm install`), contrato alterado.
6. **Revisão:** o outro lado revisa em até um dia útil, olhando o diff contra o checklist do modelo. Depois
   da aprovação e do CI verde, quem abriu o PR faz o merge e atualiza o quadro.

## 5. Arquivos que dão conflito

| Arquivo                                                 | Regra                                                                                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                                          | Cada PR acrescenta linhas em "Não lançado". No conflito, mantenha as linhas dos dois lados e não reordene                                                                               |
| `pnpm-lock.yaml`                                        | Nunca resolva à mão. Quem tem a dependência nova faz o PR; no conflito, o **desenvolvedor** (não o Claude) executa `git checkout origin/main -- pnpm-lock.yaml` e depois `pnpm install` |
| `docs/api.md`                                           | Só o Backend edita                                                                                                                                                                      |
| `apps/mobile/src/services/api.ts`, `hooks/consultas.ts` | Só o Frontend edita. Acrescente funções no fim da seção correspondente; PRs pequenos                                                                                                    |
| `apps/mobile/src/theme`, `src/components`               | `FE-01` mergeia primeiro. Depois, só se acrescenta, não se reescreve                                                                                                                    |
| `apps/mobile/src/config/recursos.ts`                    | Uma linha por flag. Ligar uma flag é um PR de uma linha                                                                                                                                 |
| `quadro.md`                                             | Edite só a sua linha                                                                                                                                                                    |

## 6. Comunicação

Rótulos das issues: `bug`, `bloqueado`, `decisao`, `contrato`, `seguranca`, `doc`. Cite sempre o ID do
cartão. Use o canal rápido do grupo para avisar de migração, variável de ambiente ou dependência nova
assim que o PR for mergeado.
