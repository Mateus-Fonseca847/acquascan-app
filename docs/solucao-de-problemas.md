# Solução de problemas

## O app abre, mas mostra "Sem conexão com o servidor"

No celular, `localhost` aponta para o próprio celular. Em `apps/mobile/.env`, use o IP do computador na rede (`EXPO_PUBLIC_API_URL=http://192.168.x.x:3333`).

1. Descubra o IP: `ipconfig` (Windows) ou `ip a` (Linux/macOS).
2. Celular e computador na mesma rede Wi-Fi. Redes de escola ou "visitante" às vezes bloqueiam a comunicação entre aparelhos: use o roteador do celular.
3. Abra `http://SEU_IP:3333/saude` no navegador do celular. Se não abrir, o firewall do computador está bloqueando a porta 3333.
4. Depois de mudar o `.env`, reinicie o Expo (`pnpm dev:mobile`).

## `Cannot find module '../generated/prisma/client'`

O Prisma Client não foi gerado. Rode `pnpm --filter @acquascan/api db:generate`.

## `Variáveis de ambiente inválidas` ao iniciar a API

Falta o arquivo `apps/api/.env`. Copie de `apps/api/.env.example`.

## `Can't reach database server at localhost:5432`

O banco não está rodando. Abra o Docker Desktop e rode `pnpm db:up`. Confira com `docker ps`.

## `Ignored build scripts` no `pnpm install`

O pnpm só executa scripts de instalação de pacotes aprovados. A lista fica em `allowBuilds` no `pnpm-workspace.yaml`. Para aprovar um pacote novo: `pnpm approve-builds <pacote>`.

## Aviso de _peer dependency_ do `react` em `apps/api`

Vem do Prisma Studio, que pede uma versão de React diferente da usada pelo app. Não afeta a API. Se o `pnpm db:studio` não abrir, use outro visualizador de banco, como o DBeaver ou o pgAdmin.

## O mapa aparece em branco

No Expo Go, o mapa funciona sem configuração. Em um _development build_ ou na versão final para Android, o react-native-maps exige uma chave do Google Maps (configurada em `app.json`).

## Notificações push não funcionam no Expo Go

Esperado: notificações push exigem um _development build_ (planejado para a v0.4.0).

## A porta 3333 já está em uso

Outra instância da API está rodando. Feche o terminal antigo ou mude `PORT` no `apps/api/.env` (e a URL no `.env` do app e do simulador).
