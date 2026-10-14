import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { DomainError } from '../src/domain/errors.ts'
import type { PhotoAsset } from '../src/shared/api/contracts.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { endpoint } from '../src/server/http.ts'
import { PhotoStorage, photoDirectory } from '../src/server/photo-storage.ts'
import {
  MAX_PHOTO_UPLOAD_BYTES,
  MAX_VENUE_PHOTOS,
  MAX_VENUE_PHOTO_BYTES,
  PhotoUploadGate,
  listVenuePhotos,
  photoResponse,
  readPhoto,
  readPhotoBody,
  uploadVenuePhoto,
} from '../src/server/photos.ts'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected
const png = () =>
  sharp({
    create: { width: 128, height: 96, channels: 3, background: '#146259' },
  })
    .png()
    .toBuffer()
function pngChunk(type: string, payload: Buffer): Buffer {
  const chunk = Buffer.alloc(payload.length + 12)
  chunk.writeUInt32BE(payload.length, 0)
  chunk.write(type, 4, 'ascii')
  payload.copy(chunk, 8)
  chunk.writeUInt32BE(
    crc32(chunk.subarray(4, payload.length + 8)),
    payload.length + 8,
  )
  return chunk
}
const request = (
  bytes: Buffer,
  mime = 'image/png',
  headers: Record<string, string> = {},
) =>
  new Request('https://food.example/api/merchant/photos', {
    method: 'POST',
    headers: {
      'content-type': mime,
      origin: 'https://food.example',
      ...headers,
    },
    body: new Uint8Array(bytes),
  })

async function fixture(database = ':memory:') {
  const directory = await mkdtemp(join(tmpdir(), 'ostatki-photos-'))
  const repository = new Repository(
    database === ':file:' ? join(directory, 'photos.sqlite') : database,
    NOW,
    { seedFixtures: true },
  )
  const service = new MarketplaceService(repository, () => NOW, {
    allowPersonaSessions: true,
  })
  for (const id of [
    'yerlan',
    'dana',
    'pending-owner',
    'alina',
    'timur',
    'aliya',
  ]) {
    repository.db
      .prepare('INSERT INTO credentials VALUES (?,?,?,?,?)')
      .run(
        id,
        `${id}@example.invalid`,
        'unused-fixture-password-hash',
        'en',
        new Date(NOW).toISOString(),
      )
    repository.db
      .prepare('INSERT INTO auth_state (user_id,verified_at) VALUES (?,?)')
      .run(id, id === 'timur' ? null : NOW)
  }
  repository.db
    .prepare(
      "INSERT INTO users VALUES ('photo-admin','Photo Admin','buyer',NULL)",
    )
    .run()
  repository.db
    .prepare(
      "INSERT INTO credentials VALUES ('photo-admin','admin@example.invalid','unused-fixture-password-hash','en',?)",
    )
    .run(new Date(NOW).toISOString())
  repository.db
    .prepare(
      "INSERT INTO auth_state (user_id,verified_at) VALUES ('photo-admin',?)",
    )
    .run(NOW)
  repository.db
    .prepare("INSERT INTO admin_grants VALUES ('photo-admin',?)")
    .run(new Date(NOW).toISOString())
  const options = { storageDirectory: join(directory, 'private-photos') }
  return {
    repository,
    service,
    options,
    directory,
    user: (id = 'yerlan') => repository.user(id)!,
    cleanup: async () => {
      repository.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test('JPEG, PNG and WebP uploads are decoded, resized, stripped of EXIF and stored privately as WebP', async () => {
  const f = await fixture()
  try {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const source = await sharp({
        create: {
          width: 2400,
          height: 1600,
          channels: 3,
          background: '#9e5237',
        },
      })
        .toFormat(format)
        .toBuffer()
      const photo = await uploadVenuePhoto(
        f.repository,
        f.user(),
        request(source, `image/${format}`),
        NOW,
        f.options,
      )
      assert.equal(photo.width, 1920)
      assert.equal(photo.height, 1280)
      assert.match(photo.id, /^[a-f0-9-]{36}$/)
      assert.equal(photo.url, `/api/photos/${photo.id}`)
      assert.equal(
        Object.keys(photo).sort().join(','),
        'bytes,createdAt,height,id,url,width',
      )
      const stored = await readPhoto(
        f.repository,
        f.user(),
        photo.id,
        NOW,
        f.options,
      )
      const metadata = await sharp(stored).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.exif, undefined)
      assert.equal(metadata.xmp, undefined)
      assert.equal(stored.length, photo.bytes)
      const permissions = await stat(
        join(f.options.storageDirectory, `${photo.id}.webp`),
      )
      assert.equal(permissions.mode & 0o777, 0o600)
    }
    const oriented = await sharp({
      create: { width: 80, height: 160, channels: 3, background: '#456284' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: 'Local image test' } })
      .toBuffer()
    const photo = await uploadVenuePhoto(
      f.repository,
      f.user(),
      request(oriented, 'image/jpeg'),
      NOW,
      f.options,
    )
    assert.equal(photo.width, 160)
    assert.equal(photo.height, 80)
    assert.equal(
      (
        await sharp(
          await readPhoto(f.repository, f.user(), photo.id, NOW, f.options),
        ).metadata()
      ).exif,
      undefined,
    )
    assert.equal(listVenuePhotos(f.repository, f.user(), f.options).length, 4)
    assert.deepEqual(
      listVenuePhotos(f.repository, f.user('dana'), f.options),
      [],
    )
    assert.equal(
      (await readdir(f.options.storageDirectory)).some((name) =>
        name.endsWith('.tmp'),
      ),
      false,
    )
  } finally {
    await f.cleanup()
  }
})

test('bounded upload reading rejects declared and streamed overflow, unsupported MIME and empty input', async () => {
  const oversized = request(Buffer.from('small'), 'image/png', {
    'content-length': String(MAX_PHOTO_UPLOAD_BYTES + 1),
  })
  await assert.rejects(readPhotoBody(oversized), code('PHOTO_TOO_LARGE'))
  assert.equal(oversized.bodyUsed, false)
  for (const mime of ['image/svg+xml', 'image/gif', 'application/octet-stream'])
    await assert.rejects(
      readPhotoBody(request(Buffer.from('bad'), mime)),
      code('PHOTO_TYPE_UNSUPPORTED'),
    )
  await assert.rejects(
    readPhotoBody(request(Buffer.alloc(0))),
    code('PHOTO_INVALID'),
  )
  let cancelled = false
  let chunks = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunks++
      controller.enqueue(new Uint8Array(64 * 1024))
    },
    cancel() {
      cancelled = true
    },
  })
  const streamed = new Request('https://food.example/api/merchant/photos', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: stream,
    duplex: 'half',
  } as RequestInit)
  await assert.rejects(readPhotoBody(streamed), code('PHOTO_TOO_LARGE'))
  assert.equal(cancelled, true)
  assert.ok(chunks <= MAX_PHOTO_UPLOAD_BYTES / (64 * 1024) + 2)
})

test('image validation rejects mismatched, truncated, animated, tiny and oversized-pixel files without storing them', async () => {
  const f = await fixture()
  try {
    const valid = await png()
    const animationControl = Buffer.alloc(8)
    animationControl.writeUInt32BE(1, 0)
    const frameControl = Buffer.alloc(26)
    frameControl.writeUInt32BE(128, 4)
    frameControl.writeUInt32BE(96, 8)
    frameControl.writeUInt16BE(1, 20)
    frameControl.writeUInt16BE(1, 22)
    const animatedPng = Buffer.concat([
      valid.subarray(0, 33),
      pngChunk('acTL', animationControl),
      pngChunk('fcTL', frameControl),
      valid.subarray(33),
    ])
    assert.equal((await sharp(animatedPng).metadata()).format, 'png')
    const tiny = await sharp({
      create: { width: 63, height: 64, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer()
    const pixels = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer()
    const longSide = await sharp({
      create: { width: 8193, height: 64, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer()
    const frames = Buffer.alloc(128 * 128 * 3)
    frames.fill(255, 0, 128 * 64 * 3)
    const animated = await sharp(frames, {
      raw: { width: 128, height: 128, channels: 3, pageHeight: 64 },
    })
      .webp({ loop: 0 })
      .toBuffer()
    assert.equal(
      (await sharp(animated, { animated: true }).metadata()).pages,
      2,
    )
    for (const [bytes, mime] of [
      [valid, 'image/jpeg'],
      [
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"/>',
        ),
        'image/png',
      ],
      [valid.subarray(0, 50), 'image/png'],
      [tiny, 'image/png'],
      [pixels, 'image/png'],
      [longSide, 'image/png'],
      [animated, 'image/webp'],
      [animatedPng, 'image/png'],
    ] as const)
      await assert.rejects(
        uploadVenuePhoto(
          f.repository,
          f.user(),
          request(bytes, mime),
          NOW,
          f.options,
        ),
        code('PHOTO_INVALID'),
      )
    assert.equal(listVenuePhotos(f.repository, f.user(), f.options).length, 0)
    const entries = await readdir(f.options.storageDirectory).catch(() => [])
    assert.deepEqual(entries, [])
  } finally {
    await f.cleanup()
  }
})

test('uploads require the current verified café owner before reading the body; CSRF and revoked sessions cannot upload', async () => {
  const f = await fixture()
  try {
    const source = await png()
    const guest = request(source)
    await assert.rejects(
      uploadVenuePhoto(f.repository, null, guest, NOW, f.options),
      code('AUTH_REQUIRED'),
    )
    assert.equal(guest.bodyUsed, false)
    const forged = {
      ...f.user('alina'),
      role: 'cafe' as const,
      venueId: 'goa-food',
      emailVerified: true,
    }
    await assert.rejects(
      uploadVenuePhoto(f.repository, forged, request(source), NOW, f.options),
      code('FORBIDDEN'),
    )
    f.repository.db
      .prepare("UPDATE auth_state SET verified_at=NULL WHERE user_id='yerlan'")
      .run()
    const stale = { ...f.user(), emailVerified: true }
    await assert.rejects(
      uploadVenuePhoto(f.repository, stale, request(source), NOW, f.options),
      code('EMAIL_NOT_VERIFIED'),
    )
    f.repository.db
      .prepare("UPDATE auth_state SET verified_at=? WHERE user_id='yerlan'")
      .run(NOW)
    const cookie = f.service.createSession({ persona: 'cafe' }).token
    const crossSite = request(source, 'image/png', {
      origin: 'https://attacker.example',
      cookie: `ostatki_session=${cookie}`,
    })
    const forbidden = await endpoint(
      crossSite,
      true,
      ({ service, user }) =>
        uploadVenuePhoto(service.repository, user, crossSite, NOW, f.options),
      f.service,
    )
    assert.equal(forbidden.status, 403)
    assert.equal(crossSite.bodyUsed, false)
    let calls = 0
    await assert.rejects(
      uploadVenuePhoto(f.repository, f.user(), request(source), NOW, {
        ...f.options,
        currentSession: () => (++calls < 4 ? f.user() : null),
      }),
      code('AUTH_REQUIRED'),
    )
    assert.equal(listVenuePhotos(f.repository, f.user(), f.options).length, 0)
    assert.deepEqual(
      await readdir(f.options.storageDirectory).catch(() => []),
      [],
    )
    const pending = await uploadVenuePhoto(
      f.repository,
      f.user('pending-owner'),
      request(source),
      NOW,
      f.options,
    )
    assert.ok(pending.id)
  } finally {
    await f.cleanup()
  }
})

test('photo visibility follows current approval and exact gallery/offer references, never draft or unrelated ownership', async () => {
  const f = await fixture()
  try {
    const photo = await uploadVenuePhoto(
      f.repository,
      f.user(),
      request(await png()),
      NOW,
      f.options,
    )
    await assert.rejects(
      readPhoto(f.repository, null, photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await assert.rejects(
      readPhoto(f.repository, f.user('dana'), photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await assert.rejects(
      readPhoto(f.repository, f.user('timur'), photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await readPhoto(
      f.repository,
      f.user('photo-admin'),
      photo.id,
      NOW,
      f.options,
    )
    f.repository.db
      .prepare(
        "UPDATE auth_state SET verified_at=NULL WHERE user_id='photo-admin'",
      )
      .run()
    await assert.rejects(
      readPhoto(f.repository, f.user('photo-admin'), photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    f.repository.db
      .prepare(
        "UPDATE venue_profiles SET content=json_set(content,'$.photoIds',json(?)) WHERE venue_id='goa-food'",
      )
      .run(JSON.stringify([photo.id]))
    await readPhoto(f.repository, null, photo.id, NOW, f.options)
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='pending' WHERE venue_id='goa-food'",
      )
      .run()
    await assert.rejects(
      readPhoto(f.repository, null, photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await readPhoto(f.repository, f.user(), photo.id, NOW, f.options)
    f.repository.db
      .prepare(
        "UPDATE venue_profiles SET content=json_set(content,'$.photoIds',json('[]')) WHERE venue_id='goa-food'",
      )
      .run()
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='approved' WHERE venue_id='goa-food'",
      )
      .run()
    f.repository.db
      .prepare(
        "UPDATE offers SET image=?,status='published' WHERE id='goa-surprise'",
      )
      .run(photo.url)
    await readPhoto(f.repository, null, photo.id, NOW, f.options)
    f.repository.db
      .prepare("UPDATE offers SET status='paused' WHERE id='goa-surprise'")
      .run()
    await assert.rejects(
      readPhoto(f.repository, null, photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    assert.equal(
      f.repository.db
        .prepare(
          "UPDATE offers SET image=?,status='published' WHERE id='bakery-croissants'",
        )
        .run(photo.url).changes,
      1,
    )
    await assert.rejects(
      readPhoto(f.repository, null, photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await assert.rejects(
      readPhoto(f.repository, f.user(), '../private', NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
  } finally {
    await f.cleanup()
  }
})

test('immutable order images remain available to their buyer and venue staff after gallery replacement and suspension', async () => {
  const f = await fixture()
  try {
    const photo = await uploadVenuePhoto(
      f.repository,
      f.user(),
      request(await png()),
      NOW,
      f.options,
    )
    f.repository.db
      .prepare("UPDATE offers SET image=? WHERE id='goa-surprise'")
      .run(photo.url)
    const order = f.service.reserve(f.user('alina'), {
      offerId: 'goa-surprise',
      quantity: 1,
      idempotencyKey: 'photo-history-reserve',
    }).order
    f.service.confirm(f.user('alina'), order.id, {
      idempotencyKey: 'photo-history-confirm',
    })
    f.repository.db
      .prepare(
        "UPDATE offers SET image='/images/goa-food.png',status='paused' WHERE id='goa-surprise'",
      )
      .run()
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='suspended' WHERE venue_id='goa-food'",
      )
      .run()
    f.repository.db
      .prepare("UPDATE auth_state SET verified_at=NULL WHERE user_id='alina'")
      .run()
    await readPhoto(f.repository, f.user('alina'), photo.id, NOW, f.options)
    await readPhoto(f.repository, f.user('aliya'), photo.id, NOW, f.options)
    await assert.rejects(
      readPhoto(f.repository, f.user('timur'), photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    await assert.rejects(
      readPhoto(f.repository, null, photo.id, NOW, f.options),
      code('PHOTO_NOT_FOUND'),
    )
    const response = photoResponse(
      await readPhoto(f.repository, f.user('alina'), photo.id, NOW, f.options),
    )
    assert.equal(response.headers.get('content-type'), 'image/webp')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
    assert.equal(
      response.headers.get('cross-origin-resource-policy'),
      'same-origin',
    )
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('content-disposition'), null)
  } finally {
    await f.cleanup()
  }
})

test('persistent rate and venue quotas reject uploads and clean files after quota or database failure', async () => {
  const f = await fixture()
  try {
    const source = await png()
    for (let index = 0; index < MAX_VENUE_PHOTOS; index++)
      f.repository.db
        .prepare('INSERT INTO photo_assets VALUES (?,?,?,?,?,?,?,?)')
        .run(
          randomUUID(),
          'goa-food',
          'yerlan',
          'image/webp',
          128,
          96,
          100,
          new Date(NOW).toISOString(),
        )
    await assert.rejects(
      uploadVenuePhoto(f.repository, f.user(), request(source), NOW, f.options),
      code('PHOTO_LIMIT_REACHED'),
    )
    assert.deepEqual(await readdir(f.options.storageDirectory), [])
    f.repository.db.prepare('DELETE FROM photo_assets').run()
    f.repository.db
      .prepare('INSERT INTO photo_assets VALUES (?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        'goa-food',
        'yerlan',
        'image/webp',
        128,
        96,
        MAX_VENUE_PHOTO_BYTES,
        new Date(NOW).toISOString(),
      )
    await assert.rejects(
      uploadVenuePhoto(f.repository, f.user(), request(source), NOW, f.options),
      code('PHOTO_LIMIT_REACHED'),
    )
    assert.deepEqual(await readdir(f.options.storageDirectory), [])
    f.repository.db.prepare('DELETE FROM photo_assets').run()
    f.repository.db.exec(
      "CREATE TRIGGER photo_write_failure BEFORE INSERT ON photo_assets BEGIN SELECT RAISE(ABORT,'fixture write failure'); END",
    )
    await assert.rejects(
      uploadVenuePhoto(f.repository, f.user(), request(source), NOW, f.options),
    )
    assert.deepEqual(await readdir(f.options.storageDirectory), [])
    f.repository.db.exec('DROP TRIGGER photo_write_failure')
    f.repository.db
      .prepare(
        "INSERT OR REPLACE INTO auth_attempts VALUES ('photo-upload',?,20,?)",
      )
      .run(
        (await import('node:crypto'))
          .createHash('sha256')
          .update('yerlan')
          .digest('hex'),
        NOW,
      )
    const limited = request(source)
    await assert.rejects(
      uploadVenuePhoto(f.repository, f.user(), limited, NOW, f.options),
      code('RATE_LIMITED'),
    )
    assert.equal(limited.bodyUsed, false)
    const resumed = await uploadVenuePhoto(
      f.repository,
      f.user(),
      request(source),
      NOW + 15 * 60_000,
      f.options,
    )
    assert.ok(resumed.id)
  } finally {
    await f.cleanup()
  }
})

test('decoder queue has two active and two waiting slots and rejects overload', async () => {
  const gate = new PhotoUploadGate()
  const releases: Array<() => void> = []
  let started = 0
  let active = 0
  let peak = 0
  const operation = () =>
    gate.run(async () => {
      started++
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active--
    })
  const tasks = [operation(), operation(), operation(), operation()]
  assert.equal(started, 2)
  await assert.rejects(operation(), code('PHOTO_BUSY'))
  releases.shift()!()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(started, 3)
  releases.shift()!()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(started, 4)
  for (const release of releases) release()
  await Promise.all(tasks)
  assert.equal(peak, 2)
})

test('photo metadata and companion storage survive reopening SQLite without entering the public directory', async () => {
  const f = await fixture(':file:')
  let reopened: Repository | null = null
  try {
    const photo: PhotoAsset = await uploadVenuePhoto(
      f.repository,
      f.user(),
      request(await png()),
      NOW,
    )
    const database = f.repository.databaseFile
    assert.equal(photoDirectory(database), `${database}.photos`)
    f.repository.close()
    reopened = new Repository(database, NOW, { seedFixtures: true })
    assert.equal(
      listVenuePhotos(reopened, reopened.user('yerlan')!).at(0)?.id,
      photo.id,
    )
    await readPhoto(reopened, reopened.user('yerlan'), photo.id, NOW)
    await assert.rejects(
      new PhotoStorage(database).read(randomUUID()),
      code('PHOTO_NOT_FOUND'),
    )
    assert.equal(database.includes('/public/'), false)
  } finally {
    reopened?.close()
    await rm(f.directory, { recursive: true, force: true })
  }
})
