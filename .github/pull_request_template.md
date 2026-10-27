## Cartão

<!-- ID do cartão (ex.: FE-03, BE-01, RT-01) e link para a issue, se houver -->

## O que mudou

<!-- 2 a 5 linhas, em português -->

## Impacto para o outro lado

<!-- Marque o que se aplica e explique -->

- [ ] Migração nova (o outro lado precisa rodar `pnpm db:migrate`)
- [ ] Variável de ambiente nova (`.env.example` atualizado)
- [ ] Dependência nova (o outro lado precisa rodar `pnpm install`)
- [ ] Contrato da API alterado (`docs/planejamento/contratos-api.md` e `packages/shared` atualizados)
- [ ] Flag de recurso ligada ou criada (`apps/mobile/src/config/recursos.ts`)
- [ ] Nenhum dos itens acima

## Como testar

<!-- Roteiro curto. Frontend: celular de verdade, com o que abrir e o que esperar. API: comandos e resultado -->

## Capturas de tela (só frontend)

<!-- Cada estado: carregando, vazio, erro, sem internet e o caminho feliz -->

## Diferenças em relação ao Figma (só frontend)

<!-- O que ficou diferente e por quê. Se seguiu uma decisão de contexto-e-decisoes.md, cite -->

## Checklist do autor

- [ ] `pnpm typecheck`, `pnpm test` e `pnpm format:check` passam
- [ ] Rebase na `main` atualizada
- [ ] Nenhum arquivo solto (`ed*.py`, scripts temporários), `.env`, `saida/`, `cache/` nem `assets/roteamento/`
- [ ] Nada de senha, token, e-mail, localização, push token ou IP em log
- [ ] Dependências com versão exata, publicadas há mais de 14 dias (ou nenhuma nova)
- [ ] Documentação, `CHANGELOG.md` e a minha linha do `docs/planejamento/quadro.md` atualizados
- [ ] Só mexi nas pastas do meu lado (ou combinei antes)

## Checklist do revisor

- [ ] O diff cumpre o cartão e não faz mais do que ele pede
- [ ] Estado do rio com cor + ícone + texto; fonte de 16 px; alvos de 44 px; erro com "Tentar de novo" (frontend)
- [ ] Só 401 de chamada autenticada desloga (frontend); 403 e falha de rede não
- [ ] Nenhum dado inventado (capacidade, contato, coordenada) e nenhuma promessa de segurança
- [ ] Testes cobrem os casos de erro, não só o caminho feliz
- [ ] Docs coerentes com o código
