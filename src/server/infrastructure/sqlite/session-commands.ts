import type { DatabaseSync } from 'node:sqlite'

export class SqliteSessionCommands {
  private readonly database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.database = database
  }

  deleteExpired(now: number): void {
    this.database.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
  }

  insert(hash: string, userId: string, expiresAt: number): void {
    this.database
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(hash, userId, expiresAt)
  }

  delete(hash: string): void {
    this.database.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash)
  }

  activePickupShift(
    userId: string,
    venueId: string,
    startsBy: number,
    endsAfter: number,
  ): boolean {
    return !!this.database
      .prepare(
        'SELECT user_id FROM pickup_shifts WHERE user_id=? AND venue_id=? AND starts_at<=? AND ends_at>?',
      )
      .get(userId, venueId, startsBy, endsAfter)
  }
}
