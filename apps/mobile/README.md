# @acquascan/mobile

App em React Native com Expo (SDK 57) e Expo Router.

## Organização

```
app/                    ← cada arquivo é uma tela (Expo Router)
├── _layout.tsx         ← provedores e navegação raiz
├── index.tsx           ← decide o destino pelo estado da sessão
├── (tabs)/             ← abas: mapa, previsão, pontos de apoio, perfil
├── (auth)/             ← boas-vindas, login e cadastro
└── estacao/[id].tsx    ← detalhe de uma estação
src/
├── components/         ← peças reutilizáveis (BadgeEstado, CartaoEstacao, Botao...)
├── contexts/Sessao.tsx ← provedor e hook useSessao()
├── hooks/consultas.ts  ← consultas à API com TanStack Query
├── services/api.ts     ← todas as chamadas HTTP (único lugar com fetch)
├── services/sessao.ts  ← token e flags no armazenamento seguro
├── services/regras.ts  ← regras puras de erro e de estado da sessão
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

## Sessão, portão de navegação e visitante

`ProvedorSessao` (`src/contexts/Sessao.tsx`) guarda o estado da sessão, lido com `useSessao()`:

| Estado       | Significado                                      | Telas                               |
| ------------ | ------------------------------------------------ | ----------------------------------- |
| `carregando` | Lendo o token e validando com `GET /usuarios/me` | Só a tela de carregamento (`index`) |
| `novo`       | Primeira abertura, nunca escolheu                | Boas-vindas, login e cadastro       |
| `visitante`  | Escolheu "Continuar sem conta" ou saiu           | Abas, estação, login e cadastro     |
| `logado`     | Tem sessão válida                                | Abas e estação                      |

- **Portão**: `app/_layout.tsx` usa `Stack.Protected` (Expo Router) e `app/index.tsx` redireciona conforme o estado. O visitante vê mapa, previsão e apoio sem restrição; só o perfil muda.
- **Token**: guardado no `expo-secure-store` (Keychain/Keystore), nunca em `AsyncStorage` nem em URL. Também ficam lá a flag "boas-vindas vistas" e uma cópia do perfil, usada quando o app abre sem internet. Qualquer erro do SecureStore vale como "sem sessão".
- **Abertura**: com token, o app chama `GET /usuarios/me`. 200 entra como logado; 401 apaga a sessão e vira visitante com o aviso "Sua sessão expirou. Entre de novo."; falha de rede ou do servidor **mantém** o usuário logado com o perfil em cache.
- **Expiração**: `api.ts` chama o gancho `aoSessaoExpirar` só quando uma chamada **autenticada** devolve 401. 403 (senha errada ao excluir a conta) e falha de rede nunca deslogam.
- **Cadastro**: a API não devolve token, então `criarContaEEntrar` cadastra e em seguida faz login com as mesmas credenciais. A senha só existe em memória durante a chamada.
- Ao entrar, sair ou excluir a conta o cache do TanStack Query é limpo.
- Nada de senha, token ou e-mail em `console.log` nem em mensagens de erro.
- Pendente: tela de exclusão de conta (`excluirConta` já existe no provedor) e remoção do token de push ao sair.

## Testes

O app ainda não tem runner de testes. As regras puras (classificação de erros, quando a sessão expira, estado inicial) ficam em `src/services/regras.ts`, prontas para testar quando houver um. Enquanto isso, valide manualmente no Expo Go com a API no ar.

## Regras de interface

- Estado do rio sempre com **cor + ícone + texto** (`BadgeEstado`), nunca só cor.
- Textos com no mínimo 16 px e botões com no mínimo 44 px de altura (`theme/medidas.ts`).
- Mensagens de erro dizem o que aconteceu e o que fazer, com botão "Tentar de novo".
- Cores só a partir de `theme/`. Não escreva valores hexadecimais nas telas.
