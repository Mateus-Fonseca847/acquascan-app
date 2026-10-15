# Privacidade e LGPD

O AcquaScan coleta dados pessoais no cadastro. A Lei Geral de Proteção de Dados (Lei 13.709/2018) exige finalidade clara, coleta mínima, consentimento e direito de exclusão.

## Dados coletados

| Dado          | Finalidade                   | Obrigatório           | Onde fica                           |
| ------------- | ---------------------------- | --------------------- | ----------------------------------- |
| Nome          | Identificar o usuário no app | Sim                   | `usuarios.nome`                     |
| E-mail        | Login                        | Sim                   | `usuarios.email`                    |
| Cidade        | Definir a região dos alertas | Sim                   | `usuarios.cidade_id`                |
| Senha         | Login                        | Sim                   | Só o hash, em `usuarios.senha_hash` |
| Token de push | Enviar notificações          | Se o usuário permitir | `push_tokens.token`                 |

## Token de notificação (push)

O token de push identifica o **aparelho** do usuário, e por isso é tratado como dado pessoal:

- só é guardado se o usuário **permitir** as notificações no celular; sem permissão, o app não gera nem envia o token;
- fica em `push_tokens`, ligado à conta, e **sai junto com ela** na exclusão da conta;
- se outra pessoa entrar no mesmo aparelho, o token é **reatribuído** a quem entrou: o dono anterior deixa de receber alertas ali;
- cada usuário guarda no máximo 10 aparelhos (os mais antigos saem primeiro);
- nunca aparece em log, resposta ou mensagem de erro, e só é usado para enviar os alertas do AcquaScan.

O app só consegue gerar o token em aparelho físico com development build (não no Expo Go).

### O que a notificação contém

As mensagens enviadas ao Expo Push Service levam só o nome do **rio**, o nome da **estação**, o **novo estado** e três números de identificação (`alertaId`, `estacaoId`, `estado`). Elas **não têm nome, e-mail, cidade do usuário nem qualquer outro dado pessoal**: a mesma mensagem vai a todos os aparelhos da cidade. O token de push é o único dado do usuário que chega ao Expo, porque é ele que identifica o aparelho. Apenas usuários da cidade da estação recebem o alerta, e só alertas das últimas 1 hora são enviados. Para conferir a entrega, a API guarda por no máximo 24 horas o _ticket_ que o Expo devolve (tabela `push_tickets`): é só um código aleatório do Expo ligado ao token e ao alerta, **sem dado pessoal**, e ele é apagado junto com o token ou com a conta do usuário. Se o recibo disser que o aparelho não existe mais, o token é apagado. O Expo (e, por trás dele, a Apple e o Google) trata a entrega; verifique os termos deles ao escrever a política de privacidade.

## Minimização

O AcquaScan não guarda telefone, CEP, endereço nem a localização exata do usuário: só a cidade, que basta para escolher os alertas. A cidade vem de uma lista da própria API, então nenhum dado do usuário é enviado a serviços de terceiros no cadastro.

## Como funciona a exclusão da conta

O usuário logado envia a própria senha em `DELETE /auth/conta`, para confirmar que é ele. Com a senha certa, a API apaga **de verdade** (sem guardar cópia):

- o cadastro em `usuarios`: nome, e-mail, cidade escolhida, hash da senha e data do consentimento;
- os tokens de notificação em `push_tokens`, apagados junto pelo banco (`onDelete: Cascade`).

Não são apagados os dados que não pertencem ao usuário: a cidade, as estações, as leituras e os alertas. A resposta é 204 e o token de login deixa de valer na hora. Com a senha errada, nada é apagado (403). Como a conta é apagada por inteiro, não há dado pessoal a anonimizar. Cópias de segurança do banco, quando existirem, precisarão de uma regra de retenção (ver Pendências).

## Regras de implementação

- **Consentimento:** o cadastro só é aceito com `consentimento: true` (validado em `@acquascan/shared`) e a data é salva em `consentimento_em`.
- **Senhas:** sempre com hash lento (scrypt ou argon2). Nunca em texto, nunca em log.
- **Exclusão:** `DELETE /auth/conta` apaga a conta do usuário logado (ver abaixo). O app ainda não tem o botão: a exclusão já funciona na API.
- **Logs:** não registrar e-mail, nome, senha, token de push, IP, query string nem o corpo das requisições nos logs da API (o log traz só método e caminho). Nem o envio de notificações registra tokens ou mensagens: só contagens. O IP e o e-mail usados no limite de tentativas ficam apenas na memória da API, como chave do contador, e somem quando ela reinicia.
- **Desenvolvimento:** usar apenas dados fictícios. Nunca copiar dados reais de produção para o computador.

## Pendências

- [PREENCHER] Prazo de retenção das cópias de segurança do banco e como elas respeitam a exclusão de conta.
- [PREENCHER] Texto completo dos termos de uso e da política de privacidade, revisado por um responsável.
- [PREENCHER] Responsável pelos dados (controlador) e contato para solicitações dos usuários.
