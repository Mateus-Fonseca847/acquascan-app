import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Versão assíncrona: o scrypt roda fora do event loop e não trava o Fastify. */
function scryptAsync(
  senha: string,
  salt: Buffer,
  keylen: number,
  opcoes: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, keylen, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
  });
}

const N = 32768;
const R = 8;
const P = 3;
const TAMANHO_HASH = 64;
const TAMANHO_SALT = 16;

/** Limites para um hash lido do banco: evita que um valor adulterado consuma memória demais. */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

/** O Node recusa os parâmetros se maxmem não cobrir ~128*N*r bytes; usamos o dobro de folga. */
function memoriaMaxima(n: number, r: number, p: number): number {
  return 256 * n * r + 128 * r * p;
}

/**
 * Gera o hash no formato `scrypt$N$r$p$salt_base64$hash_base64`.
 * Os parâmetros ficam dentro do hash, então podem mudar no futuro sem invalidar senhas antigas.
 */
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await scryptAsync(senha, salt, TAMANHO_HASH, {
    N,
    r: R,
    p: P,
    maxmem: memoriaMaxima(N, R, P),
  });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Confere a senha. Hash malformado retorna false (sem lançar exceção e sem registrar nada). */
export async function verificarSenha(senha: string, hashSalvo: string): Promise<boolean> {
  try {
    const partes = hashSalvo.split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

    const [n, r, p] = [partes[1], partes[2], partes[3]].map(Number) as [number, number, number];
    const parametrosValidos =
      Number.isInteger(n) &&
      Number.isInteger(r) &&
      Number.isInteger(p) &&
      n >= 2 &&
      n <= MAX_N &&
      (n & (n - 1)) === 0 &&
      r >= 1 &&
      r <= MAX_R &&
      p >= 1 &&
      p <= MAX_P;
    if (!parametrosValidos) return false;

    const salt = Buffer.from(partes[4] ?? '', 'base64');
    const esperado = Buffer.from(partes[5] ?? '', 'base64');
    if (salt.length === 0 || esperado.length === 0) return false;

    const calculado = await scryptAsync(senha, salt, esperado.length, {
      N: n,
      r,
      p,
      maxmem: memoriaMaxima(n, r, p),
    });
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}
