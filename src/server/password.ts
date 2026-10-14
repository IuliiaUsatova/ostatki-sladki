import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { DomainError } from '../domain/errors.ts'

// Bound native work and memory independently of attackers choosing fresh emails.
const N = 131_072
const R = 8
const P = 1
let activeHashes = 0
const DUMMY_SALT = Buffer.alloc(16, 17)
const DUMMY_HASH = Buffer.alloc(64, 29)

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (activeHashes >= 2)
    throw new DomainError(
      'RETRY_LATER',
      'Сервис занят. Попробуйте немного позже.',
      429,
    )
  activeHashes += 1
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N, r: R, p: P, maxmem: 192 * 1024 * 1024 },
        (error, key) => {
          if (error) reject(error)
          else resolve(key)
        },
      )
    })
  } finally {
    activeHashes -= 1
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(
  password: string,
  encoded: string | null,
): Promise<boolean> {
  const parts = encoded?.split('$')
  const valid =
    parts?.length === 6 &&
    parts[0] === 'scrypt' &&
    Number(parts[1]) === N &&
    Number(parts[2]) === R &&
    Number(parts[3]) === P &&
    /^[a-zA-Z0-9_-]{22}$/.test(parts[4]) &&
    /^[a-zA-Z0-9_-]{86}$/.test(parts[5])
  const salt = valid ? Buffer.from(parts![4], 'base64url') : DUMMY_SALT
  const expected = valid ? Buffer.from(parts![5], 'base64url') : DUMMY_HASH
  const actual = await derive(password, salt)
  const matched = timingSafeEqual(actual, expected)
  return Boolean(valid && matched)
}
