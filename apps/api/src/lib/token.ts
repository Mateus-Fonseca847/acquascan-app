import { createHash, randomBytes } from 'node:crypto';

/** Gera um token aleatório para uma estação nova. */
export function gerarToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * O banco guarda só o hash do token. Se o banco vazar,
 * os tokens das estações continuam desconhecidos.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
