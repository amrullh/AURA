import { randomBytes } from 'crypto';

/** ID berawalan agar mudah dibaca di log dan respons, misalnya inv_3f9a1c2b. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString('hex')}`;
}
