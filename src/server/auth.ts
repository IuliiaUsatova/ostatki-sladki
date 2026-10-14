import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import { login, registration } from '../domain/auth-validation.ts'
import type { User } from '../domain/types.ts'
import type { Repository } from './repository.ts'
import { hashPassword, verifyPassword } from './password.ts'

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const WINDOW_MS = 15 * 60_000
export const AUTH_SESSION_TTL_MS = 24 * 60 * 60_000

function consumeAttempt(
  repository: Repository,
  action: 'login' | 'register',
  email: string,
  now: number,
) {
  repository.transaction(() => {
    repository.db
      .prepare('DELETE FROM auth_attempts WHERE window_start<?')
      .run(now - WINDOW_MS)
    for (const [scope, key, limit, window] of [
      [action, digest(email), action === 'login' ? 5 : 3, WINDOW_MS],
      ['global', 'all', 30, 60_000],
    ] as const) {
      const row = repository.db
        .prepare(
          'SELECT count,window_start FROM auth_attempts WHERE action=? AND email_hash=?',
        )
        .get(scope, key) as { count: number; window_start: number } | undefined
      invariant(
        !row || row.window_start + window <= now || row.count < limit,
        'RATE_LIMITED',
        'Слишком много попыток. Попробуйте позже.',
        429,
      )
    }
    for (const [scope, key, window] of [
      [action, digest(email), WINDOW_MS],
      ['global', 'all', 60_000],
    ] as const) {
      repository.db
        .prepare(
          `INSERT INTO auth_attempts VALUES (?,?,1,?)
        ON CONFLICT(action,email_hash) DO UPDATE SET
        count=CASE WHEN window_start+?<=? THEN 1 ELSE count+1 END,
        window_start=CASE WHEN window_start+?<=? THEN ? ELSE window_start END`,
        )
        .run(scope, key, now, window, now, window, now, now)
    }
  })
}

function issueSession(
  repository: Repository,
  userId: string,
  previousToken: string | null,
  now: number,
) {
  const token = randomBytes(32).toString('base64url')
  repository.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
  if (previousToken)
    repository.db
      .prepare('DELETE FROM sessions WHERE token_hash=?')
      .run(digest(previousToken))
  repository.db
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run(digest(token), userId, now + AUTH_SESSION_TTL_MS)
  return { token, user: repository.user(userId)! }
}

export async function registerAccount(
  repository: Repository,
  value: unknown,
  previousToken: string | null,
  now: number,
): Promise<{ token: string; user: User }> {
  const input = registration(value)
  consumeAttempt(repository, 'register', input.email, now)
  const passwordHash = await hashPassword(input.password)
  return repository.transaction(() => {
    invariant(
      !repository.db
        .prepare('SELECT user_id FROM credentials WHERE email=? COLLATE NOCASE')
        .get(input.email),
      'EMAIL_UNAVAILABLE',
      'Этот email уже используется. Войдите в аккаунт.',
      409,
    )
    const userId = randomUUID()
    const venueId = input.venue ? randomUUID() : null
    const at = new Date(now).toISOString()
    if (input.venue && venueId) {
      repository.db
        .prepare("INSERT INTO venues VALUES (?,?,?,'pending','Asia/Almaty')")
        .run(venueId, input.venue.name, input.venue.address)
      repository.db
        .prepare(
          `INSERT INTO venue_moderation VALUES (?,'pending',?,?,1,?,?,NULL,NULL,NULL)`,
        )
        .run(venueId, input.venue.description, input.venue.contactPhone, at, at)
    }
    repository.db
      .prepare('INSERT INTO users VALUES (?,?,?,?)')
      .run(userId, input.name, input.accountType, venueId)
    repository.db
      .prepare('INSERT INTO credentials VALUES (?,?,?,?,?)')
      .run(userId, input.email, passwordHash, input.locale, at)
    repository.db
      .prepare('INSERT INTO auth_state (user_id) VALUES (?)')
      .run(userId)
    if (input.venue && venueId)
      repository.db
        .prepare(
          `INSERT INTO moderation_events VALUES (?,?,'submit',?,?,?,1,NULL,?)`,
        )
        .run(
          randomUUID(),
          venueId,
          at,
          userId,
          input.name,
          JSON.stringify(input.venue),
        )
    return issueSession(repository, userId, previousToken, now)
  })
}

export async function loginAccount(
  repository: Repository,
  value: unknown,
  previousToken: string | null,
  now: number,
): Promise<{ token: string; user: User }> {
  const input = login(value)
  consumeAttempt(repository, 'login', input.email, now)
  const credential = repository.db
    .prepare(
      `SELECT c.user_id,c.password_hash,s.credential_revision FROM credentials c
      JOIN auth_state s ON s.user_id=c.user_id WHERE c.email=? COLLATE NOCASE`,
    )
    .get(input.email) as
    | {
        user_id: string
        password_hash: string
        credential_revision: number
      }
    | undefined
  const verified = await verifyPassword(
    input.password,
    credential?.password_hash ?? null,
  )
  invariant(
    credential && verified,
    'INVALID_CREDENTIALS',
    'Неверный email или пароль.',
    401,
  )
  return repository.transaction(() => {
    // Reset or email confirmation can finish during scrypt; stale authority cannot create a session.
    const unchanged = repository.db
      .prepare(
        `SELECT c.user_id FROM credentials c JOIN auth_state s ON s.user_id=c.user_id
      WHERE c.user_id=? AND c.password_hash=? AND s.credential_revision=?`,
      )
      .get(
        credential.user_id,
        credential.password_hash,
        credential.credential_revision,
      )
    invariant(
      unchanged,
      'INVALID_CREDENTIALS',
      'Неверный email или пароль.',
      401,
    )
    repository.db
      .prepare(
        "DELETE FROM auth_attempts WHERE action='login' AND email_hash=?",
      )
      .run(digest(input.email))
    return issueSession(repository, credential.user_id, previousToken, now)
  })
}

export function grantAdministrator(
  repository: Repository,
  normalizedEmail: string,
  now: number,
): User {
  return repository.transaction(() => {
    const row = repository.db
      .prepare('SELECT user_id FROM credentials WHERE email=? COLLATE NOCASE')
      .get(normalizedEmail) as { user_id: string } | undefined
    invariant(
      row,
      'ACCOUNT_NOT_FOUND',
      'Сначала зарегистрируйте аккаунт в приложении.',
      404,
    )
    repository.db
      .prepare('INSERT OR IGNORE INTO admin_grants VALUES (?,?)')
      .run(row.user_id, new Date(now).toISOString())
    repository.db
      .prepare('DELETE FROM sessions WHERE user_id=?')
      .run(row.user_id)
    return repository.user(row.user_id)!
  })
}
