import type { DatabaseSync } from 'node:sqlite'
type Row = Record<string, unknown>
export function getIdempotent(
  db: DatabaseSync,
  actorId: string,
  key: string,
): { action: string; payloadHash: string; resourceId: string } | null {
  const row = db
    .prepare('SELECT * FROM idempotency WHERE actor_id=? AND key=?')
    .get(actorId, key) as Row | undefined
  return row
    ? {
        action: String(row.action),
        payloadHash: String(row.payload_hash),
        resourceId: String(row.resource_id),
      }
    : null
}

export function recordIdempotency(
  db: DatabaseSync,
  actorId: string,
  key: string,
  action: string,
  hash: string,
  resourceId: string,
) {
  db.prepare('INSERT INTO idempotency VALUES (?,?,?,?,?)').run(
    actorId,
    key,
    action,
    hash,
    resourceId,
  )
}
