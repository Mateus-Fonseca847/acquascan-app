# Solução de problemas

## O app abre, mas mostra "Sem conexão com o servidor"

No celular, `localhost` aponta para o próprio celular. Em `apps/mobile/.env`, use o IP do computador na rede (`EXPO_PUBLIC_API_URL=http://192.168.x.x:3333`).

1. Descubra o IP: `ipconfig` (Windows) ou `ip a` (Linux/macOS).
2. Celular e computador na mesma rede Wi-Fi. Redes de escola ou "visitante" às vezes bloqueiam a comunicação entre aparelhos: use o roteador do celular.
3. Abra `http://SEU_IP:3333/saude` no navegador do celular. Se não abrir, o firewall do computador está bloqueando a porta 3333.
4. Depois de mudar o `.env`, reinicie o Expo (`pnpm dev:mobile`).

### O app fica carregando e depois mostra que o servidor demorou demais

O app espera 10 segundos por cada tentativa e tenta uma segunda vez; se a API não responder, aparece "O servidor demorou demais para responder" com o botão **Tentar de novo** (antes, o app ficava carregando para sempre). As causas mais comuns:

1. **IP errado no `.env`.** O `apps/mobile/.env.example` traz só um **exemplo** (`192.168.0.10`); o IP do seu computador provavelmente é outro. Confira com `ipconfig`, ajuste `EXPO_PUBLIC_API_URL` e reinicie o Expo com `pnpm dev:mobile -- --clear` (o valor é embutido no app quando o Expo inicia, então só mudar o arquivo não basta).
2. **Porta 3333 bloqueada no firewall do Windows.** Teste no navegador **do celular**: abra `http://SEU_IP:3333/saude`. Se aparecer `{"status":"ok",...}`, a rede e o firewall estão certos e o problema é o IP ou o Expo desatualizado. Se não abrir (e o mesmo endereço abre no computador), libere a porta. Em um PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "AcquaScan API 3333" -Direction Inbound -Protocol TCP -LocalPort 3333 -Action Allow -Profile Private
```

> **Atenção:** a regra vale só para redes classificadas como **Privadas**. Se o Windows classificou o seu Wi-Fi ou cabo como **Pública**, a regra não se aplica. Veja a classificação com `Get-NetConnectionProfile` e, se for uma rede de confiança (a sua casa, por exemplo), mude para Privada em Configurações > Rede e Internet > propriedades da conexão. Não faça isso em redes públicas.

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
