import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { DomainError, invariant } from '../domain/errors.ts'

export const PHOTO_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export function photoDirectory(
  databaseFile: string,
  override?: string,
): string {
  if (override) return resolve(override)
  invariant(
    databaseFile !== ':memory:',
    'PHOTO_STORAGE_UNAVAILABLE',
    'Хранилище фотографий недоступно.',
    503,
  )
  const database = resolve(databaseFile)
  return join(dirname(database), `${basename(database)}.photos`)
}

export class PhotoStorage {
  readonly directory: string

  constructor(databaseFile: string, directory?: string) {
    this.directory = photoDirectory(databaseFile, directory)
  }

  private path(id: string): string {
    invariant(
      PHOTO_ID.test(id),
      'PHOTO_NOT_FOUND',
      'Фотография не найдена.',
      404,
    )
    return join(this.directory, `${id}.webp`)
  }

  async save(id: string, bytes: Buffer): Promise<void> {
    const destination = this.path(id)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, destination)
    } catch {
      throw new DomainError(
        'PHOTO_STORAGE_UNAVAILABLE',
        'Не удалось сохранить фотографию. Попробуйте позже.',
        503,
      )
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }

  async read(id: string): Promise<Buffer> {
    try {
      return await readFile(this.path(id))
    } catch {
      throw new DomainError('PHOTO_NOT_FOUND', 'Фотография не найдена.', 404)
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await unlink(this.path(id))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new DomainError(
          'PHOTO_STORAGE_UNAVAILABLE',
          'Не удалось обновить хранилище фотографий.',
          503,
        )
    }
  }
}
