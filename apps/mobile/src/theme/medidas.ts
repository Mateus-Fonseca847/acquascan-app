export const espaco = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const raio = { sm: 6, md: 12 } as const;

/** Mínimo de 16 para leitura confortável; o app respeita o aumento de fonte do celular. */
export const fonte = { pequena: 14, normal: 16, media: 18, titulo: 24, destaque: 40 } as const;

/** Área mínima de toque recomendada para acessibilidade. */
export const ALVO_TOQUE = 44;
