# Contratos planejados da API

Estes são os endpoints e campos **novos** que o backend vai entregar e o app vai consumir. Eles existem para
os dois lados andarem em paralelo: o app constrói a tela atrás de uma flag, com dados de exemplo
(`apps/mobile/src/fixtures/`), e o backend implementa por trás do mesmo formato.

- A API **real** está em [docs/api.md](../api.md). Este arquivo só descreve o que ainda não existe.
- Todo erro tem o formato `{ "erro": "mensagem em português" }`. Códigos usuais: 400 dados inválidos, 401 sem
  sessão ou sessão expirada, 403 senha incorreta, 404 não encontrado, 409 conflito, 429 muitas tentativas.
- Os tipos oficiais ficam em `packages/shared` (só o Backend edita). Se o texto daqui discordar do código, vale o
  código, e o Backend corrige este arquivo.
- Status: **Rascunho** (combinado, sem tipos) → **Publicado** (tipos em `shared` e `docs/api.md`) →
  **Implementado** (endpoint no ar). O app só liga a flag quando estiver **Implementado**.

| #   | Contrato                                      | Cartão do Backend | Destrava no app | Flag                         | Status   |
| --- | --------------------------------------------- | ----------------- | --------------- | ---------------------------- | -------- |
| C1  | Estação "sem dados" e idade da leitura        | BE-01             | APP-04, APP-05  | `SEM_DADOS_SERVIDOR`         | Rascunho |
| C2  | Perfil editável, trocar senha, exportar dados | BE-02             | APP-13          | `PERFIL_EDICAO`              | Rascunho |
| C3  | Seguir estações, nível de alerta, alívio      | BE-03             | APP-12, APP-07  | `SEGUIR_ESTACOES`            | Rascunho |
| C4  | Previsão com temperatura atual e condição     | BE-04             | APP-08          | `PREVISAO_ATUAL`             | Rascunho |
| C5  | Pontos de apoio reais                         | BE-05             | APP-09          | (sem flag: campos opcionais) | Rascunho |
| C6  | Pesquisa por rua                              | BE-06             | APP-15          | `BUSCA_RUA`                  | Rascunho |
| C7  | Recuperar senha                               | BE-08             | APP-14          | `RECUPERAR_SENHA`            | Rascunho |

## C1. Estação sem dados (BE-01)

Dois campos novos em cada estação de `GET /estacoes` e `GET /estacoes/:id`:

```ts
semDados: boolean; // true se não há leitura há mais de ESTACAO_SEM_DADOS_MIN (padrão 20) ou nunca houve
idadeLeituraMin: number | null; // minutos desde a última leitura, pelo relógio do SERVIDOR; null se nunca houve
```

Regras:

- `ultimaLeitura` continua presente quando existe, mesmo com `semDados: true`.
- Com `semDados: true` o app mostra **"Sem dados"** (cinza, ícone e texto) no lugar do estado e não calcula
  estimativa. "Atualizado há X min" usa `idadeLeituraMin` somado ao tempo desde que o app buscou.
- O app não usa o relógio do aparelho para decidir se há dados (ele pode estar errado).

## C2. Perfil, senha e exportação (BE-02)

```ts
type NivelAlerta = 'ATENCAO_E_CRITICO' | 'SO_CRITICO'; // ver C3
interface Perfil {
  // GET /usuarios/me (campos novos: nivelAlerta, estacoesSeguidas)
  id: number;
  nome: string;
  email: string;
  consentimentoEm: string;
  criadoEm: string;
  cidade: { id: number; nome: string; uf: string; latitude: number; longitude: number };
  nivelAlerta: NivelAlerta;
  estacoesSeguidas: number[];
}
```

- `PATCH /usuarios/me` com `{ nome?, cidadeId?, nivelAlerta?, estacoesSeguidas? }` → **200** com o `Perfil`.
  Campos ausentes não mudam. O e-mail **não** muda nesta versão. `estacoesSeguidas` **substitui** o conjunto;
  os ids precisam ser de estações ativas da cidade do usuário (senão 400). Trocar de cidade sem enviar
  `estacoesSeguidas` passa a seguir todas as estações da nova cidade.
- `PATCH /usuarios/me/senha` com `{ senhaAtual, novaSenha }` → **200** `{ token }`. O token novo substitui o
  atual; **todos os outros deixam de valer**. Senha atual errada: 403 `Senha incorreta` (o app **não** desloga).
  Nova senha de 8 a 128 caracteres.
- `GET /usuarios/me/dados` → **200** (exportação, direito de portabilidade da LGPD):
  ```json
  {
    "exportadoEm": "2026-10-20T12:00:00.000Z",
    "perfil": {
      "nome": "...",
      "email": "...",
      "consentimentoEm": "...",
      "criadoEm": "...",
      "cidade": { "nome": "Petrópolis", "uf": "RJ" },
      "nivelAlerta": "ATENCAO_E_CRITICO"
    },
    "estacoesSeguidas": [{ "id": 1, "nome": "Piabanha 01 · Centro" }],
    "dispositivosPush": 1
  }
  ```
  Nunca inclui senha, hash, token de sessão nem push token.

## C3. Seguir estações, nível de alerta e alívio (BE-03)

- Quem se cadastra passa a seguir todas as estações da cidade e começa em `ATENCAO_E_CRITICO`.
- `NivelAlerta`: `ATENCAO_E_CRITICO` (recebe aviso de Atenção e de Crítico) e `SO_CRITICO` (só Crítico).
  Há **duas** opções de propósito (ver `contexto-e-decisoes.md`, seção 5).
- **Alívio:** quando uma estação sai do crítico, quem a segue recebe "saiu do estado crítico", em **qualquer**
  nível, e só se o crítico daquela estação teve push enviado.
- `GET /alertas` ganha o campo `tipo` em cada item e o filtro opcional `seguidas=true` (exige sessão):
  ```ts
  tipo: 'PIORA' | 'ALIVIO'; // ALIVIO: estadoAnterior = CRITICO e estadoNovo = ATENCAO ou ESTAVEL
  ```
  Os campos atuais (`estadoAnterior`, `estadoNovo`, `criadoEm`, estação e rio) não mudam.
- Para o app, "seguir" e "nível" são parte do `Perfil` e se alteram com `PATCH /usuarios/me` (C2).
- A mensagem de push traz `data: { alertaId, estacaoId, estado }`. O app usa isso para abrir o detalhe.

## C4. Previsão com temperatura atual e condição (BE-04)

Campos **novos** em `GET /previsao`; a forma atual não muda:

```ts
type CondicaoTempo = 'ENSOLARADO' | 'NUBLADO' | 'CHUVOSO' | 'INSTAVEL' | 'TEMPESTUOSO';
atual: {
  temperaturaC: number;
  sensacaoC: number;
  condicao: CondicaoTempo;
}
// e, em cada dia da previsão:
condicao: CondicaoTempo;
```

O enum é fixo (as cinco ilustrações do design). O mapeamento do código meteorológico para o enum é do
Backend. Se a previsão externa falhar, o endpoint mantém o comportamento atual.

## C5. Pontos de apoio reais (BE-05)

Campos de cada ponto em `GET /pontos-apoio` (`distanciaM` só quando a consulta envia `lat` e `lng`):

```ts
interface PontoApoio {
  id: number;
  nome: string;
  endereco: string;
  bairro: string | null;
  capacidade: number | null; // desconhecida = null; a linha some na tela
  contato: string | null; // null: o app mostra "199 Defesa Civil"
  confianca: 'ALTA' | 'MEDIA'; // MEDIA: o app avisa "confirme com a Defesa Civil"
  latitude: number;
  longitude: number;
  distanciaM?: number;
}
```

## C6. Pesquisa por rua (BE-06)

`GET /ruas/busca?q=<texto>&limite=<1 a 20, padrão 10>` → **200** `ResultadoRua[]` (lista vazia = nenhum resultado).
`q` precisa de pelo menos 2 caracteres (senão 400). A busca ignora acento e maiúscula e tolera erro de digitação.

```ts
interface ResultadoRua {
  id: number;
  nome: string;
  bairro: string | null;
  latitude: number;
  longitude: number; // ponto da rua mais próximo da estação
  estacao: { id: number; nome: string; rio: string; estado: Estado; semDados: boolean } | null;
  distanciaEstacaoM: number | null;
}
```

Sem estação ao alcance, `estacao` e `distanciaEstacaoM` vêm `null` e a tela mostra "Sem estação nesta rua".
Bairros ficam para uma versão posterior.

## C7. Recuperar senha (BE-08)

- `POST /auth/esqueci-senha` com `{ email }` → **202** `{ "mensagem": "Se o e-mail estiver cadastrado, enviamos um código." }`,
  **sempre**, exista ou não o e-mail. Limite de pedidos por e-mail e por IP.
- `POST /auth/redefinir-senha` com `{ email, codigo, novaSenha }` → **204**. Código de 6 dígitos, vale 15 minutos,
  5 tentativas. Erro: 400 `Código inválido ou expirado`; 429 quando exceder.
- Redefinir invalida todas as sessões antigas. O usuário entra de novo com a senha nova.
- O app precisa de duas telas: pedir o código (e-mail) e digitar código + senha nova. A segunda não existe
  no PDF e precisa ser desenhada.

## C8. Ainda sem contrato (esperam dados ou decisões)

Rotas de fuga, ilhas de segurança, áreas de risco (dependem da Defesa Civil), bairros na busca, rios
coloridos no mapa (usam `packages/desvio` e dados embutidos no app, sem endpoint novo), push (endpoints de
token já existem; o envio depende de development build).

## Histórico de mudanças de contrato

| Data        | Contrato | Mudança | Quem |
| ----------- | -------- | ------- | ---- |
| (preencher) |          |         |      |
