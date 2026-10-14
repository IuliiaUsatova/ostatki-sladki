import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { DomainError, invariant } from '../domain/errors.ts'
import type { PhotoAsset, User } from '../domain/types.ts'
import type { Repository } from './repository.ts'
import { PHOTO_ID, PhotoStorage } from './photo-storage.ts'

export const MAX_PHOTO_UPLOAD_BYTES = 6 * 1024 * 1024
export const MAX_PHOTO_INPUT_PIXELS = 16_000_000
export const MAX_VENUE_PHOTOS = 40
export const MAX_VENUE_PHOTO_BYTES = 100 * 1024 * 1024
const UPLOAD_WINDOW_MS = 15 * 60_000
const MIME_FORMAT = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const
type PhotoRow = {
  id: string
  venue_id: string
  owner_id: string
  mime: string
  width: number
  height: number
  bytes: number
  created_at: string
}
export type PhotoOptions = {
  storageDirectory?: string
  currentSession?: () => User | null
}

/** Bound input buffers and native decoders together, including a small waiting queue. */
export class PhotoUploadGate {
  private active = 0
  private waiting: Array<() => void> = []
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < 2) this.active++
    else {
      invariant(
        this.waiting.length < 2,
        'PHOTO_BUSY',
        'Загрузка фотографий занята. Попробуйте позже.',
        503,
      )
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    try {
      return await operation()
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }
}
const processState = globalThis as typeof globalThis & {
  ostatkiPhotoGate?: PhotoUploadGate
}
const uploadGate = (processState.ostatkiPhotoGate ??= new PhotoUploadGate())

const asset = (row: PhotoRow): PhotoAsset => ({
  id: row.id,
  url: `/api/photos/${row.id}`,
  width: row.width,
  height: row.height,
  bytes: row.bytes,
  createdAt: row.created_at,
})

function currentUser(
  repository: Repository,
  user: User | null,
  options: PhotoOptions,
): User | null {
  const identity = options.currentSession ? options.currentSession() : user
  return identity ? repository.user(identity.id) : null
}

function owner(
  repository: Repository,
  user: User | null,
  options: PhotoOptions,
  verified = false,
): User {
  const current = currentUser(repository, user, options)
  invariant(
    current,
    'AUTH_REQUIRED',
    'Войдите в аккаунт, чтобы продолжить.',
    401,
  )
  invariant(
    current.role === 'cafe' &&
      current.venueId &&
      repository.venue(current.venueId),
    'FORBIDDEN',
    'Фотографии доступны владельцу заведения.',
    403,
  )
  if (verified)
    invariant(
      current.emailVerified === true,
      'EMAIL_NOT_VERIFIED',
      'Подтвердите email, чтобы загрузить фотографию.',
      403,
    )
  return current
}

function consumeUpload(repository: Repository, user: User, now: number): void {
  const key = createHash('sha256').update(user.id).digest('hex')
  repository.transaction(() => {
    repository.db
      .prepare('DELETE FROM auth_attempts WHERE window_start<?')
      .run(now - UPLOAD_WINDOW_MS)
    const row = repository.db
      .prepare(
        "SELECT count,window_start FROM auth_attempts WHERE action='photo-upload' AND email_hash=?",
      )
      .get(key) as { count: number; window_start: number } | undefined
    invariant(
      !row || row.window_start + UPLOAD_WINDOW_MS <= now || row.count < 20,
      'RATE_LIMITED',
      'Слишком много загрузок. Попробуйте позже.',
      429,
    )
    repository.db
      .prepare(
        `INSERT INTO auth_attempts VALUES ('photo-upload',?,1,?) ON CONFLICT(action,email_hash) DO UPDATE SET count=CASE WHEN window_start+?<=? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start+?<=? THEN ? ELSE window_start END`,
      )
      .run(key, now, UPLOAD_WINDOW_MS, now, UPLOAD_WINDOW_MS, now, now)
  })
}

export async function readPhotoBody(
  request: Request,
): Promise<{ bytes: Buffer; format: 'jpeg' | 'png' | 'webp' }> {
  const mime = request.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  invariant(
    mime && Object.hasOwn(MIME_FORMAT, mime),
    'PHOTO_TYPE_UNSUPPORTED',
    'Выберите фотографию JPEG, PNG или WebP.',
    415,
  )
  const declaredSize = request.headers.get('content-length')
  if (declaredSize !== null) {
    invariant(
      /^\d+$/.test(declaredSize),
      'PHOTO_INVALID',
      'Не удалось прочитать фотографию.',
    )
    invariant(
      Number(declaredSize) <= MAX_PHOTO_UPLOAD_BYTES,
      'PHOTO_TOO_LARGE',
      'Фотография не должна превышать 6 МБ.',
      413,
    )
  }
  invariant(request.body, 'PHOTO_INVALID', 'Выберите фотографию.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new DomainError(
            'PHOTO_INVALID',
            'Не удалось получить фотографию. Повторите загрузку.',
            408,
          ),
        ),
      30_000,
    )
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      size += value.byteLength
      invariant(
        size <= MAX_PHOTO_UPLOAD_BYTES,
        'PHOTO_TOO_LARGE',
        'Фотография не должна превышать 6 МБ.',
        413,
      )
      chunks.push(value)
    }
    invariant(size > 0, 'PHOTO_INVALID', 'Выберите фотографию.')
    return {
      bytes: Buffer.concat(chunks, size),
      format: MIME_FORMAT[mime as keyof typeof MIME_FORMAT],
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof DomainError) throw error
    throw new DomainError('PHOTO_INVALID', 'Не удалось прочитать фотографию.')
  } finally {
    if (timer) clearTimeout(timer)
    reader.releaseLock()
  }
}

async function decodePhoto(bytes: Buffer, format: 'jpeg' | 'png' | 'webp') {
  try {
    // libpng can expose only the first APNG frame, so inspect its animation control chunk too.
    if (format === 'png') {
      let offset = 8
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset)
        invariant(
          bytes.toString('ascii', offset + 4, offset + 8) !== 'acTL',
          'PHOTO_INVALID',
          'Выберите фотографию без анимации.',
        )
        offset += 12 + length
      }
    }
    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: MAX_PHOTO_INPUT_PIXELS,
      limitInputChannels: 4,
      animated: false,
    })
    const metadata = await image.metadata()
    invariant(
      metadata.format === format &&
        (metadata.pages ?? 1) === 1 &&
        metadata.width &&
        metadata.height &&
        metadata.width >= 64 &&
        metadata.height >= 64 &&
        metadata.width <= 8192 &&
        metadata.height <= 8192 &&
        metadata.width * metadata.height <= MAX_PHOTO_INPUT_PIXELS,
      'PHOTO_INVALID',
      'Выберите обычную фотографию размером от 64 пикселей, не более 16 мегапикселей.',
    )
    const result = await image
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true })
    invariant(
      result.data.length <= MAX_PHOTO_UPLOAD_BYTES,
      'PHOTO_TOO_LARGE',
      'Фотография слишком большая.',
      413,
    )
    return result
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError(
      'PHOTO_INVALID',
      'Не удалось обработать фотографию. Выберите другой файл.',
    )
  }
}

export function listVenuePhotos(
  repository: Repository,
  user: User | null,
  options: PhotoOptions = {},
): PhotoAsset[] {
  const actor = owner(repository, user, options)
  return (
    repository.db
      .prepare(
        'SELECT * FROM photo_assets WHERE venue_id=? AND owner_id=? ORDER BY created_at DESC,id',
      )
      .all(actor.venueId!, actor.id) as PhotoRow[]
  ).map(asset)
}

export async function uploadVenuePhoto(
  repository: Repository,
  user: User | null,
  request: Request,
  now: number,
  options: PhotoOptions = {},
): Promise<PhotoAsset> {
  const initial = owner(repository, user, options, true)
  consumeUpload(repository, initial, now)
  return uploadGate.run(async () => {
    owner(repository, user, options, true)
    const input = await readPhotoBody(request)
    const processed = await decodePhoto(input.bytes, input.format)
    const actor = owner(repository, user, options, true)
    invariant(
      actor.id === initial.id && actor.venueId === initial.venueId,
      'FORBIDDEN',
      'Загрузка больше недоступна.',
      403,
    )
    const id = randomUUID()
    const storage = new PhotoStorage(
      repository.databaseFile,
      options.storageDirectory,
    )
    await storage.save(id, processed.data)
    try {
      return repository.transaction(() => {
        const current = owner(repository, user, options, true)
        invariant(
          current.id === actor.id && current.venueId === actor.venueId,
          'FORBIDDEN',
          'Загрузка больше недоступна.',
          403,
        )
        const quota = repository.db
          .prepare(
            'SELECT count(*) AS total,coalesce(sum(bytes),0) AS bytes FROM photo_assets WHERE venue_id=?',
          )
          .get(actor.venueId!) as { total: number; bytes: number }
        invariant(
          quota.total < MAX_VENUE_PHOTOS &&
            quota.bytes + processed.data.length <= MAX_VENUE_PHOTO_BYTES,
          'PHOTO_LIMIT_REACHED',
          'Достигнут лимит фотографий заведения.',
          409,
        )
        const row: PhotoRow = {
          id,
          venue_id: actor.venueId!,
          owner_id: actor.id,
          mime: 'image/webp',
          width: processed.info.width,
          height: processed.info.height,
          bytes: processed.data.length,
          created_at: new Date(now).toISOString(),
        }
        repository.db
          .prepare('INSERT INTO photo_assets VALUES (?,?,?,?,?,?,?,?)')
          .run(
            row.id,
            row.venue_id,
            row.owner_id,
            row.mime,
            row.width,
            row.height,
            row.bytes,
            row.created_at,
          )
        return asset(row)
      })
    } catch (error) {
      await storage.remove(id)
      throw error
    }
  })
}

function canRead(
  repository: Repository,
  row: PhotoRow,
  user: User | null,
  now: number,
): boolean {
  const url = `/api/photos/${row.id}`
  if (repository.venue(row.venue_id)?.status === 'approved') {
    const publicReference = repository.db
      .prepare(
        `SELECT 1 FROM venue_profiles p,json_each(p.content,'$.photoIds') photo WHERE p.venue_id=? AND photo.value=? UNION ALL SELECT 1 FROM offers WHERE venue_id=? AND status='published' AND pickup_end>? AND image=? LIMIT 1`,
      )
      .get(row.venue_id, row.id, row.venue_id, new Date(now).toISOString(), url)
    if (publicReference) return true
  }
  if (!user) return false
  if (user.role === 'admin' && user.emailVerified === true) return true
  if (
    user.role === 'cafe' &&
    user.venueId === row.venue_id &&
    user.id === row.owner_id
  )
    return true
  if (user.role === 'buyer')
    return !!repository.db
      .prepare(
        "SELECT 1 FROM orders WHERE buyer_id=? AND json_extract(snapshot,'$.image')=? LIMIT 1",
      )
      .get(user.id, url)
  if (
    (user.role === 'cafe' || user.role === 'pickup') &&
    user.venueId === row.venue_id
  )
    return !!repository.db
      .prepare(
        "SELECT 1 FROM orders WHERE venue_id=? AND json_extract(snapshot,'$.image')=? LIMIT 1",
      )
      .get(user.venueId, url)
  return false
}

export async function readPhoto(
  repository: Repository,
  user: User | null,
  id: string,
  now: number,
  options: PhotoOptions = {},
): Promise<Buffer> {
  invariant(PHOTO_ID.test(id), 'PHOTO_NOT_FOUND', 'Фотография не найдена.', 404)
  const row = repository.db
    .prepare('SELECT * FROM photo_assets WHERE id=?')
    .get(id) as PhotoRow | undefined
  invariant(
    row &&
      row.mime === 'image/webp' &&
      canRead(repository, row, currentUser(repository, user, options), now),
    'PHOTO_NOT_FOUND',
    'Фотография не найдена.',
    404,
  )
  const bytes = await new PhotoStorage(
    repository.databaseFile,
    options.storageDirectory,
  ).read(id)
  invariant(
    bytes.length === row.bytes &&
      canRead(repository, row, currentUser(repository, user, options), now),
    'PHOTO_NOT_FOUND',
    'Фотография не найдена.',
    404,
  )
  return bytes
}

export function photoResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
