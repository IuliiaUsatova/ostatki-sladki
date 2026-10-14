import type { DatabaseSync } from 'node:sqlite'
import type { User, Locale } from '../../../domain/types.ts'
type Row = Record<string, unknown>
export function getUser(db: DatabaseSync, id: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id,u.name,u.role,u.venue_id,c.email,c.locale,s.verified_at,
        EXISTS(SELECT 1 FROM admin_grants a WHERE a.user_id=u.id) AS is_admin
        FROM users u LEFT JOIN credentials c ON c.user_id=u.id
        LEFT JOIN auth_state s ON s.user_id=u.id WHERE u.id=?`,
    )
    .get(id) as Row | undefined
  return row
    ? {
        id: String(row.id),
        name: String(row.name),
        role: row.is_admin ? 'admin' : (row.role as User['role']),
        venueId: row.venue_id === null ? null : String(row.venue_id),
        ...(row.email
          ? {
              email: String(row.email),
              locale: row.locale as Locale,
              emailVerified:
                row.verified_at !== null && row.verified_at !== undefined,
            }
          : {}),
      }
    : null
}

export function getSession(
  db: DatabaseSync,
  tokenHash: string,
  now: number,
): User | null {
  const row = db
    .prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?')
    .get(tokenHash, now) as Row | undefined
  return row ? getUser(db, String(row.user_id)) : null
}
