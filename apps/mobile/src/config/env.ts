/**
 * Variáveis com prefixo EXPO_PUBLIC_ ficam visíveis dentro do app.
 * Nunca coloque senhas ou chaves secretas aqui.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  console.warn('EXPO_PUBLIC_API_URL não definida. Copie apps/mobile/.env.example para .env.');
}

export const env = {
  apiUrl: apiUrl ?? 'http://localhost:3333',
};
