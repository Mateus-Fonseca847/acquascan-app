import { defineConfig } from 'vitest/config';

// Valores só para os testes: nenhum segredo real é necessário (nem no CI).
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
      JWT_SECRET: 'segredo-somente-para-testes-0123456789abcdef',
    },
  },
});
