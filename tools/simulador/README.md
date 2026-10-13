# Simulador de estação

Faz o papel do ESP32 enquanto a estação física não existe: envia leituras para `POST /leituras` com o token da estação de teste.

```bash
cp .env.example .env
pnpm simulador          # na raiz do repositório
```

| Cenário (`CENARIO`) | Comportamento                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `estavel`           | Nível oscilando perto de 35%                                                               |
| `cheia`             | Sobe 2% por leitura até passar do transbordamento: dispara os alertas de atenção e crítico |
| `vazante`           | Desce de 95% até 20%                                                                       |

Para a demonstração na Supernova, `CENARIO=cheia` com `INTERVALO_S=3` mostra o rio mudando de estado em menos de um minuto.
