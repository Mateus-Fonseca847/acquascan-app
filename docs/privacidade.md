# Privacidade e LGPD

O AcquaScan coleta dados pessoais no cadastro. A Lei Geral de Proteção de Dados (Lei 13.709/2018) exige finalidade clara, coleta mínima, consentimento e direito de exclusão.

## Dados coletados

| Dado                        | Finalidade                                             | Obrigatório           | Onde fica                           |
| --------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------- |
| Nome                        | Identificar o usuário no app                           | Sim                   | `usuarios.nome`                     |
| E-mail                      | Login                                                  | Sim                   | `usuarios.email`                    |
| CEP                         | Definir a região dos alertas                           | Sim                   | `usuarios.cep`                      |
| Latitude e longitude do CEP | Encontrar a estação e os pontos de apoio mais próximos | Calculado             | `usuarios.latitude/longitude`       |
| Senha                       | Login                                                  | Sim                   | Só o hash, em `usuarios.senha_hash` |
| Token de push               | Enviar notificações                                    | Se o usuário permitir | `push_tokens.token`                 |

## Regras de implementação

- **Consentimento:** o cadastro só é aceito com `consentimento: true` (validado em `@acquascan/shared`) e a data é salva em `consentimento_em`.
- **Senhas:** sempre com hash lento (scrypt ou argon2). Nunca em texto, nunca em log.
- **Exclusão:** o usuário pode excluir a conta no app; a exclusão apaga também os tokens de push (`onDelete: Cascade`).
- **Logs:** não registrar e-mail ou CEP nos logs da API.
- **Desenvolvimento:** usar apenas dados fictícios. Nunca copiar dados reais de produção para o computador.

## Pendências

- [PREENCHER] Texto completo dos termos de uso e da política de privacidade, revisado por um responsável.
- [PREENCHER] Responsável pelos dados (controlador) e contato para solicitações dos usuários.
