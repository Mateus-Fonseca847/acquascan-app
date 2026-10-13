# @acquascan/mobile

App em React Native com Expo (SDK 57) e Expo Router.

## Organização

```
app/                    ← cada arquivo é uma tela (Expo Router)
├── _layout.tsx         ← provedores e navegação raiz
├── index.tsx           ← redireciona para o mapa
├── (tabs)/             ← abas: mapa, previsão, pontos de apoio, perfil
├── (auth)/             ← login e cadastro
└── estacao/[id].tsx    ← detalhe de uma estação
src/
├── components/         ← peças reutilizáveis (BadgeEstado, CartaoEstacao, Botao...)
├── hooks/consultas.ts  ← consultas à API com TanStack Query
├── services/api.ts     ← todas as chamadas HTTP
├── theme/              ← cores, aparência dos estados, medidas
├── utils/formatar.ts   ← datas, distâncias e percentuais em pt-BR
└── config/env.ts
```

O alias `@/` aponta para `src/` (ex.: `import { cores } from '@/theme'`).

## Rodando no celular

1. Instale o app **Expo Go** no celular.
2. Copie `.env.example` para `.env` e coloque o **IP do seu computador** em `EXPO_PUBLIC_API_URL`.
3. Celular e computador na mesma rede Wi-Fi.
4. Na raiz do repositório: `pnpm dev:mobile` e leia o QR code com o celular.

## Regras de interface

- Estado do rio sempre com **cor + ícone + texto** (`BadgeEstado`), nunca só cor.
- Textos com no mínimo 16 px e botões com no mínimo 44 px de altura (`theme/medidas.ts`).
- Mensagens de erro dizem o que aconteceu e o que fazer, com botão "Tentar de novo".
- Cores só a partir de `theme/`. Não escreva valores hexadecimais nas telas.
