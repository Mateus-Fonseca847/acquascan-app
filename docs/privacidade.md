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
- **Logs:** não registrar e-mail, nome, senha nem o corpo das requisições nos logs da API.
- **Desenvolvimento:** usar apenas dados fictícios. Nunca copiar dados reais de produção para o computador.

## Pendências

- [PREENCHER] Prazo de retenção das cópias de segurança do banco e como elas respeitam a exclusão de conta.
- [PREENCHER] Texto completo dos termos de uso e da política de privacidade, revisado por um responsável.
- [PREENCHER] Responsável pelos dados (controlador) e contato para solicitações dos usuários.
