import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { greatCircleDistanceKm, isGeoPoint } from '../../../domain/geography.ts'

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.function(
    'nearby_distance',
    { deterministic: true },
    (location, centerLatitude, centerLongitude) => {
      try {
        const from = { latitude: centerLatitude, longitude: centerLongitude },
          to: unknown =
            typeof location === 'string' ? JSON.parse(location) : null
        return isGeoPoint(from) && isGeoPoint(to)
          ? greatCircleDistanceKm(from, to)
          : null
      } catch {
        return null
      }
    },
  )
  db.function('support_fold', { deterministic: true }, (value) =>
    typeof value === 'string' ? value.toLocaleLowerCase('ru') : '',
  )
  if (path !== ':memory:') chmodSync(path, 0o600)
  db.exec(
    'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;',
  )
  return db
}

export function inTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
