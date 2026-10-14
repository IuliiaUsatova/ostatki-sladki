import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { DomainError, invariant } from '../domain/errors.ts'
import {
  forgotPassword,
  passwordReset,
  verificationConfirmation,
  verificationRequest,
} from '../domain/auth-validation.ts'
import type { Locale, User } from '../domain/types.ts'
import type { AuthMail, AuthMailer } from './mail.ts'
import { hashPassword } from './password.ts'
import type { Repository } from './repository.ts'

export const VERIFICATION_TTL_MS = 24 * 60 * 60_000
export const PASSWORD_RESET_TTL_MS = 30 * 60_000
export const AUTH_MAIL_COOLDOWN_MS = 60_000
const WINDOW_MS = 15 * 60_000
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
type Purpose = Exclude<AuthMail['kind'], 'password_changed'>
type Credential = {
  user_id: string
  email: string
  credential_revision: number
}
type Token = {
  user_id: string
  credential_revision: number
  email: string
  locale: Locale
}

function invalidToken(): never {
  throw new DomainError(
    'INVALID_OR_EXPIRED_TOKEN',
    'Ссылка недействительна или срок её действия истёк.',
  )
}

/** One-time email capabilities are stored only as hashes, never as mail links or plaintext. */
export class AuthLifecycle {
  private repository: Repository
  private clock: () => number
  private mailer: AuthMailer
  private responseDelayMs: number

  constructor(
    repository: Repository,
    clock: () => number,
    mailer: AuthMailer,
    responseDelayMs = 5_000,
  ) {
    this.repository = repository
    this.clock = clock
    this.mailer = mailer
    this.responseDelayMs = responseDelayMs
  }

  private rateLimit(action: string, email: string | null): void {
    const now = this.clock()
    this.repository.transaction(() => {
      this.repository.db
        .prepare('DELETE FROM auth_attempts WHERE window_start<?')
        .run(now - WINDOW_MS)
      this.repository.db
        .prepare('DELETE FROM auth_mail_requests WHERE requested_at<?')
        .run(now - WINDOW_MS)
      this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE expires_at<=?')
        .run(now)
      const scopes: Array<[string, string, number, number]> = [
        ['email-auth-global', 'all', 30, 60_000],
      ]
      if (email !== null) scopes.push([action, digest(email), 5, WINDOW_MS])
      for (const [scope, key, limit, window] of scopes) {
        const row = this.repository.db
          .prepare(
            'SELECT count,window_start FROM auth_attempts WHERE action=? AND email_hash=?',
          )
          .get(scope, key) as
          | { count: number; window_start: number }
          | undefined
        invariant(
          !row || row.window_start + window <= now || row.count < limit,
          'RATE_LIMITED',
          'Слишком много попыток. Попробуйте позже.',
          429,
        )
      }
      for (const [scope, key, , window] of scopes)
        this.repository.db
          .prepare(
            `INSERT INTO auth_attempts VALUES (?,?,1,?)
          ON CONFLICT(action,email_hash) DO UPDATE SET
          count=CASE WHEN window_start+?<=? THEN 1 ELSE count+1 END,
          window_start=CASE WHEN window_start+?<=? THEN ? ELSE window_start END`,
          )
          .run(scope, key, now, window, now, window, now, now)
    })
  }

  private claimMail(purpose: Purpose, email: string): boolean {
    return this.repository.transaction(() => {
      const now = this.clock()
      const key = digest(email)
      const row = this.repository.db
        .prepare(
          'SELECT requested_at FROM auth_mail_requests WHERE purpose=? AND email_hash=?',
        )
        .get(purpose, key) as { requested_at: number } | undefined
      if (row && row.requested_at + AUTH_MAIL_COOLDOWN_MS > now) return false
      this.repository.db
        .prepare(
          `INSERT INTO auth_mail_requests VALUES (?,?,?)
        ON CONFLICT(purpose,email_hash) DO UPDATE SET requested_at=excluded.requested_at`,
        )
        .run(purpose, key, now)
      return true
    })
  }

  private credential(email: string): Credential | null {
    const row = this.repository.db
      .prepare(
        `SELECT c.user_id,c.email,s.credential_revision FROM credentials c
      JOIN auth_state s ON s.user_id=c.user_id WHERE c.email=? COLLATE NOCASE`,
      )
      .get(email) as Credential | undefined
    return row ?? null
  }

  private async send(
    credential: Credential,
    purpose: Purpose,
    locale: Locale,
  ): Promise<void> {
    const token = randomBytes(32).toString('base64url')
    const tokenHash = digest(token)
    const now = this.clock()
    this.repository.transaction(() => {
      const current = this.credential(credential.email)
      invariant(
        current &&
          current.credential_revision === credential.credential_revision,
        'INVALID_OR_EXPIRED_TOKEN',
        'Ссылка недействительна или срок её действия истёк.',
      )
      this.repository.db
        .prepare('INSERT INTO auth_tokens VALUES (?,?,?,?,?,?)')
        .run(
          tokenHash,
          credential.user_id,
          purpose,
          credential.credential_revision,
          now,
          now +
            (purpose === 'verify_email'
              ? VERIFICATION_TTL_MS
              : PASSWORD_RESET_TTL_MS),
        )
    })
    try {
      await this.mailer.send({
        kind: purpose,
        to: credential.email,
        locale,
        token,
      })
      // Keep recent delivered links usable even when a later resend cannot be delivered.
      this.repository.db
        .prepare(
          `DELETE FROM auth_tokens WHERE user_id=? AND purpose=? AND token_hash NOT IN
        (SELECT token_hash FROM auth_tokens WHERE user_id=? AND purpose=? ORDER BY created_at DESC,rowid DESC LIMIT 5)`,
        )
        .run(credential.user_id, purpose, credential.user_id, purpose)
    } catch {
      this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE token_hash=?')
        .run(tokenHash)
      console.warn('Ostatki authentication email submission failed.')
      throw new DomainError(
        'MAIL_UNAVAILABLE',
        'Не удалось отправить письмо. Попробуйте позже.',
        503,
      )
    }
  }

  async requestVerification(
    user: User | null,
    value: unknown,
  ): Promise<{ sent: true } | { verified: true }> {
    const input = verificationRequest(value)
    const current = user ? this.repository.user(user.id) : null
    invariant(
      current?.email,
      'AUTH_REQUIRED',
      'Войдите в аккаунт, чтобы продолжить.',
      401,
    )
    if (current.emailVerified) return { verified: true }
    this.mailer.assertReady()
    this.rateLimit('request-verification', current.email)
    invariant(
      this.claimMail('verify_email', current.email),
      'RATE_LIMITED',
      'Подождите минуту перед повторной отправкой.',
      429,
    )
    const credential = this.credential(current.email)
    invariant(
      credential,
      'AUTH_REQUIRED',
      'Войдите в аккаунт, чтобы продолжить.',
      401,
    )
    await this.send(credential, 'verify_email', input.locale)
    return { sent: true }
  }

  private validToken(token: string, purpose: Purpose): Token {
    const row = this.repository.db
      .prepare(
        `SELECT t.user_id,t.credential_revision,c.email,c.locale FROM auth_tokens t
      JOIN credentials c ON c.user_id=t.user_id JOIN auth_state s ON s.user_id=t.user_id
      WHERE t.token_hash=? AND t.purpose=? AND t.expires_at>? AND t.credential_revision=s.credential_revision`,
      )
      .get(digest(token), purpose, this.clock()) as Token | undefined
    return row ?? invalidToken()
  }

  confirmVerification(user: User | null, value: unknown): { verified: true } {
    const input = verificationConfirmation(value)
    const current = user ? this.repository.user(user.id) : null
    invariant(
      current?.email,
      'AUTH_REQUIRED',
      'Войдите в аккаунт, чтобы подтвердить email.',
      401,
    )
    this.rateLimit('confirm-verification', null)
    return this.repository.transaction(() => {
      const token = this.validToken(input.token, 'verify_email')
      invariant(
        token.user_id === current.id,
        'VERIFY_ACCOUNT_MISMATCH',
        'Войдите в аккаунт, которому адресовано письмо.',
        403,
      )
      const consumed = this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE token_hash=?')
        .run(digest(input.token))
      if (Number(consumed.changes) !== 1) invalidToken()
      const changed = this.repository.db
        .prepare(
          `UPDATE auth_state SET verified_at=COALESCE(verified_at,?),credential_revision=credential_revision+1
          WHERE user_id=? AND credential_revision=?`,
        )
        .run(this.clock(), token.user_id, token.credential_revision)
      if (Number(changed.changes) !== 1) invalidToken()
      this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE user_id=?')
        .run(token.user_id)
      this.repository.db
        .prepare('DELETE FROM sessions WHERE user_id=?')
        .run(token.user_id)
      return { verified: true }
    })
  }

  async forgot(value: unknown): Promise<{ accepted: true }> {
    const input = forgotPassword(value)
    this.mailer.assertReady()
    this.rateLimit('forgot-password', input.email)
    const started = Date.now()
    try {
      if (this.claimMail('reset_password', input.email)) {
        const credential = this.credential(input.email)
        if (credential) {
          try {
            await this.send(credential, 'reset_password', input.locale)
          } catch {
            /* Account existence and delivery failure have the same public response. */
          }
        }
      }
    } finally {
      // The provider times out within 4s; equalize unknown, cooldown and delivery-failure responses.
      await delay(Math.max(0, this.responseDelayMs - (Date.now() - started)))
    }
    return { accepted: true }
  }

  async reset(value: unknown): Promise<{ reset: true }> {
    const input = passwordReset(value)
    this.rateLimit('reset-password', null)
    this.validToken(input.token, 'reset_password')
    const passwordHash = await hashPassword(input.password)
    const result = this.repository.transaction(() => {
      const token = this.validToken(input.token, 'reset_password')
      const consumed = this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE token_hash=?')
        .run(digest(input.token))
      if (Number(consumed.changes) !== 1) invalidToken()
      const changed = this.repository.db
        .prepare(
          `UPDATE auth_state SET credential_revision=credential_revision+1,verified_at=COALESCE(verified_at,?)
        WHERE user_id=? AND credential_revision=?`,
        )
        .run(this.clock(), token.user_id, token.credential_revision)
      if (Number(changed.changes) !== 1) invalidToken()
      this.repository.db
        .prepare('UPDATE credentials SET password_hash=? WHERE user_id=?')
        .run(passwordHash, token.user_id)
      this.repository.db
        .prepare('DELETE FROM sessions WHERE user_id=?')
        .run(token.user_id)
      this.repository.db
        .prepare('DELETE FROM auth_tokens WHERE user_id=?')
        .run(token.user_id)
      this.repository.db
        .prepare(
          "DELETE FROM auth_attempts WHERE action='login' AND email_hash=?",
        )
        .run(digest(token.email))
      return { email: token.email, locale: token.locale }
    })
    try {
      await this.mailer.send({
        kind: 'password_changed',
        to: result.email,
        locale: result.locale,
      })
    } catch {
      console.warn('Ostatki authentication email submission failed.')
      /* A notification failure cannot undo a committed password reset. */
    }
    return { reset: true }
  }
}
