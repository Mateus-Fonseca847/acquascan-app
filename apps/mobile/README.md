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

## Roteamento no celular: dados e tela de prova (R7a)

O app usa `@acquascan/roteamento` e `@acquascan/desvio` (workspaces). A prova de viabilidade carrega o grafo, os rios e a exposição **dentro do app**, roda o roteador e o desvio no Hermes e mede os tempos. Não há tela final de rota: o redesenho do app vem depois.

### Gerar os dados

Os arquivos vêm de `tools/grafo/saida/` e ficam **fora do git** (`apps/mobile/assets/roteamento/` está no `.gitignore`: são derivados do OpenStreetMap, e a licença ODbL pede atribuição; se serão versionados ainda é uma decisão em aberto, veja [creditos-dados.md](../../docs/creditos-dados.md)).

```bash
pnpm grafo:construir && pnpm grafo:rios && pnpm grafo:exposicao   # só se ainda não gerou
pnpm dados:app
```

O `pnpm dados:app` confere que os três arquivos são da mesma geração (o `sha256` do grafo e o dos rios registrados na exposição, e o número de arestas); se não forem, falha e manda rodar os três comandos em sequência. Depois copia `grafo-petropolis.json`, `exposicao-petropolis.json` e os rios (como `rios-petropolis.json`: o Metro só carrega dados `.json`) para `assets/roteamento/` e grava `versao.json` com os três hashes e a data. Reinicie o Metro com `pnpm dev:mobile -- --clear` depois de gerar.

### Carregamento preguiçoso

`src/roteamento/dados.ts` expõe `carregarRoteamento(estacoes)`, que devolve `{ roteador, desvio, tempos, ... }`. Os `require` dos três JSON ficam **dentro das funções** (nada é lido na abertura do app) e o resultado fica em cache no módulo (`criarRoteador` e `criarDesvio` rodam uma vez). Cada `require` está em um `try/catch`, que o Metro trata como dependência opcional: sem os arquivos, o bundle e o typecheck **não quebram**, e o erro (em português, mandando rodar `pnpm dados:app`) só aparece quando alguém tenta carregar.

**Caminho adotado: `require` de JSON.** É o mais simples, não precisa de dependência nem de `metro.config.js`, e o Metro empacotou sem problemas (`expo export --platform android` compilou o bytecode Hermes: bundle de 3,8 MB sem os dados e 5,1 MB com eles). O que o export **não** mede é o tempo de carga no aparelho. Se a tela de prova mostrar um tempo de "ler e interpretar" alto (ver abaixo), a alternativa é `expo-asset` mais leitura do arquivo (o Expo já instala `expo-asset`, mas ela exigiria o arquivo como asset, isto é, uma extensão que o Metro trate como asset, e `expo-file-system` para ler: dependências diretas que deveriam ser decididas antes). O Metro resolveu `@acquascan/roteamento` e `@acquascan/desvio` sem `metro.config.js`.

### Tela de prova

Só em desenvolvimento (`__DEV__`): Perfil, botão **Teste de roteamento** (rota `app/(dev)/rota-teste.tsx`; em build de produção o botão some e a rota não é registrada). Toque em **Rodar a prova**; a tela pode travar por alguns segundos enquanto mede. Ela:

- carrega os dados e mostra os **tempos de carga** (ler e interpretar os arquivos, `criarRoteador`, `criarDesvio`);
- cria 3 estações hipotéticas **derivadas do GeoJSON** (duas no Piabanha, a 25% e 75% do comprimento, e uma no Quitandinha, a 50%; cada uma no ponto médio do trecho que cai nessa fração);
- roda **100 rotas** entre vértices aleatórios do grafo (semente 20261016, mostrada na tela) em dois modos, **sem risco** e **rios em CRÍTICO**, e mostra a mediana, o p95 e o máximo do `rotear` e do `gerarPassos`, quantas rotas mudaram (a recomendada difere da mais curta) e a exposição crítica média;
- desenha **uma** rota no mapa (a primeira do modo crítico) e mostra o tempo de montar a polilinha;
- lista o texto dos **10 primeiros passos** dessa rota;
- escreve no console **uma linha** `[R7a] ...` com todos os números, fácil de copiar.

**Como ler os números.** `rotear` inclui o roteador e o desvio (no modo crítico são duas buscas: a mais curta e a segura). Referência no Node deste computador, para comparar: carga ~25 ms de leitura, ~22 ms de `criarRoteador` e ~4 ms de `criarDesvio`; `rotear` com mediana de 0,3 ms (sem risco) e 0,6 ms (crítico), p95 abaixo de 1,6 ms; `gerarPassos` com mediana de ~0,15 ms; 42 das 100 rotas mudam no modo crítico. No celular espere números maiores (Hermes e CPU móvel). Para uma tela de rota, o que importa é a carga (acontece uma vez) e o p95 do `rotear` ficarem bem abaixo de ~100 ms.

### Funções puras e o que fica sem teste automático

A escolha das estações hipotéticas, o sorteio dos pares e as estatísticas estão em `src/roteamento/puro.ts` (só `import type`), e a conferência dos hashes está em `tools/grafo/src/dados-app.ts`. Todas têm teste no vitest de `tools/grafo` (`prova-app.test.ts` importa `puro.ts` daqui). **Sem teste automático:** `dados.ts` (depende de `require` do Metro), a tela `rota-teste.tsx` e o botão do Perfil: valide no Expo Go.

## Testes

O app ainda não tem runner de testes. As regras puras (classificação de erros, quando a sessão expira, estado inicial) ficam em `src/services/regras.ts`, prontas para testar quando houver um. Enquanto isso, valide manualmente no Expo Go com a API no ar.

## Regras de interface

- Estado do rio sempre com **cor + ícone + texto** (`BadgeEstado`), nunca só cor.
- Textos com no mínimo 16 px e botões com no mínimo 44 px de altura (`theme/medidas.ts`).
- Mensagens de erro dizem o que aconteceu e o que fazer, com botão "Tentar de novo".
- Cores só a partir de `theme/`. Não escreva valores hexadecimais nas telas.
