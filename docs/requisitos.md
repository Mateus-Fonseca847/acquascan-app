# Requisitos

Derivados do mapa mental do aplicativo (repositório acquascan-supernova, `docs/02-solucao/mapa-mental.png`). Cada requisito tem um código (RF = funcional, RNF = não funcional) para ser citado em commits, pull requests e TODOs no código.

## Funcionais

| Código | Requisito                                                             | Versão          | Status                                                      |
| ------ | --------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| RF01   | Cadastro com nome, e-mail e CEP                                       | v0.2.0          | API pronta; app ainda não integrado                         |
| RF02   | Login                                                                 | v0.2.0          | Tela pronta; API responde 501                               |
| RF03   | Mapa de Petrópolis com as estações coloridas pelo estado              | v0.1.0          | Feito                                                       |
| RF04   | Pesquisa do estado do rio por rua                                     | v0.3.0          | Endpoint reservado (501)                                    |
| RF05   | Nível do rio em %                                                     | v0.1.0          | Feito                                                       |
| RF06   | Estado do rio (estável, atenção, crítico)                             | v0.1.0          | Feito                                                       |
| RF07   | Histórico de medições                                                 | v0.1.0          | Feito (lista de 24 h; gráfico pendente)                     |
| RF08   | Notificação quando o estado piora na região do usuário                | v0.4.0          | Alerta registrado no banco; push pendente                   |
| RF09   | Estimativa de evolução do estado                                      | v0.1.0          | Feito (tempo até transbordar no ritmo atual)                |
| RF10   | Previsão do tempo de 7 dias com cores de perigo                       | v0.1.0          | Feito (limites provisórios)                                 |
| RF11   | Pontos de apoio próximos: nome, capacidade, contato, distância e rota | v0.1.0 / v0.3.0 | Lista, contato e rota feitos; proximidade pelo app pendente |
| RF12   | Vazão em L/s                                                          | v0.1.0          | Armazenada e convertida; exibição pendente                  |

## Não funcionais

| Código | Requisito                      | Como atendemos                                                                                                                 |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| RNF01  | Acessibilidade                 | Estado sempre com cor, ícone e texto; contraste AA; fonte mínima de 16 px; alvos de toque de 44 px                             |
| RNF02  | Privacidade (LGPD)             | Consentimento obrigatório no cadastro, dados mínimos, exclusão de conta. Ver [privacidade.md](privacidade.md)                  |
| RNF03  | Segurança das estações         | Token por estação, só o hash no banco                                                                                          |
| RNF04  | Atualização                    | App atualiza os dados a cada minuto, no mesmo ritmo das estações                                                               |
| RNF05  | Honestidade da informação      | Estimativa apresentada como estimativa; estação sem dados aparece como "Sem dados", nunca com valor antigo como se fosse atual |
| RNF06  | Funcionar sem a estação física | Simulador em `tools/simulador`                                                                                                 |

## Pendências de definição

- Limites de atenção e crítico de cada estação: validar com a Defesa Civil.
- Limites de risco de chuva (`packages/shared/src/chuva.ts`): provisórios.
- Lista real de pontos de apoio: obter da Defesa Civil.
