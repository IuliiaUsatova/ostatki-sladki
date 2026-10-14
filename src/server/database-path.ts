import { join, resolve } from 'node:path'

export function databasePath(): string {
  const configured = process.env.OSTATKI_DATABASE_FILE
  return configured
    ? resolve(configured)
    : join(process.cwd(), 'data', 'ostatki.sqlite')
}
