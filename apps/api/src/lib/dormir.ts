/** Espera `ms` milissegundos. Fica em um arquivo próprio para os testes não esperarem de verdade. */
export const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
