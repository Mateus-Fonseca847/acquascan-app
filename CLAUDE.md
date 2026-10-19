# Regras do projeto AcquaScan

App de alerta de enchentes (Petrópolis). Monorepo pnpm: apps/api (Fastify, Prisma, PostGIS),
apps/mobile (Expo SDK 57, Expo Router), packages/*, tools/*. Docs em docs/.

## Sempre
- Leia docs/api.md e o README do pacote antes de mexer.
- Dependências: versão exata (sem ^), publicada há mais de 14 dias. Nada novo sem avisar.
- Nunca registre senha, token, e-mail, localização nem push token em log.
- Chamadas HTTP do app só em apps/mobile/src/services/api.ts; telas usam os hooks.
- Sessão pelo useSessao(). Só 401 de chamada autenticada desloga; 403 e falha de rede NÃO.
- Estado do rio sempre com cor + ícone + texto. Fonte mínima 16, alvo de toque 44.
  Todo erro diz o que houve e oferece "Tentar de novo".
- Cores e espaços só de src/theme. Nunca hexadecimal solto na tela.
- Não edite migrações já aplicadas: crie uma nova.
- Ao terminar cada tarefa: pnpm typecheck, pnpm test, pnpm format:check.
- Apague scripts temporários e nunca deixe .env, saida/ ou cache/ no commit.

## Nunca
- git stash, git reset, git checkout em pasta compartilhada.
- Commit na main. Trabalhe na sua branch.
- CHANGELOG.md e pnpm-lock.yaml sem combinar (fonte de conflito).
- Inventar dado: capacidade ou contato desconhecido fica vazio, não é chutado.
