import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import {
  geoPoint,
  greatCircleDistanceKm,
  MAX_MERCATOR_LATITUDE,
} from '../src/shared/lib/geo/index.ts'
import { nearbySearchInput } from '../src/domain/nearby-validation.ts'
import { venueProfile } from '../src/domain/venue-validation.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import { POST } from '../src/app/api/nearby/search/route.ts'

const NOW = Date.parse('2026-10-13T12:00:00.000Z')
const input = { center: null, radiusKm: null, search: '', kind: 'all' }
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected
function fixture(path = ':memory:') {
  const repository = new Repository(path, NOW, { seedFixtures: true }),
    service = new MarketplaceService(repository, () => NOW, {
      allowPersonaSessions: true,
    })
  return { repository, service }
}
function point(
  f: ReturnType<typeof fixture>,
  venueId: string,
  location: unknown,
) {
  const profile = f.repository.venueProfile(venueId)
  f.repository.db
    .prepare('UPDATE venue_profiles SET content=? WHERE venue_id=?')
    .run(JSON.stringify({ ...profile, location }), venueId)
}

test('geopoints are strictly numeric and map-bounded; great-circle math covers zero, antimeridian and near-antipodal arcs', () => {
  assert.deepEqual(geoPoint({ latitude: 0, longitude: 0 }), {
    latitude: 0,
    longitude: 0,
  })
  assert.deepEqual(
    geoPoint({ latitude: MAX_MERCATOR_LATITUDE, longitude: -180 }),
    { latitude: MAX_MERCATOR_LATITUDE, longitude: -180 },
  )
  for (const value of [
    { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 },
    { latitude: '0', longitude: 0 },
    { latitude: 86, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: 0, source: 'device' },
    null,
    [0, 0],
    { latitude: 0 },
  ])
    assert.throws(() => geoPoint(value), code('INVALID_INPUT'))
  assert.equal(
    greatCircleDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    0,
  )
  assert.ok(
    Math.abs(
      greatCircleDistanceKm(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ) - 222.39016,
    ) < 0.001,
  )
  assert.ok(
    Math.abs(
      greatCircleDistanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ) - 20015.1144,
    ) < 0.001,
  )
})

test('nearby input requires every field, bounded literal search and center-bound radius without coordinate coercion', () => {
  assert.deepEqual(nearbySearchInput(input), input)
  assert.deepEqual(
    nearbySearchInput({
      ...input,
      center: { latitude: 0, longitude: 0 },
      radiusKm: 1.5,
      search: '  Main bakery  ',
    }),
    {
      ...input,
      center: { latitude: 0, longitude: 0 },
      radiusKm: 1.5,
      search: 'Main bakery',
    },
  )
  for (const value of [
    { ...input, center: undefined },
    { ...input, radiusKm: 1 },
    { ...input, center: { latitude: 0, longitude: 0 }, radiusKm: 0 },
    { ...input, center: { latitude: 0, longitude: 0 }, radiusKm: 51 },
    { ...input, center: { latitude: 0, longitude: 0 }, radiusKm: '5' },
    { ...input, kind: ['all'] },
    { ...input, search: 'x'.repeat(101) },
    { ...input, latitude: 0 },
    { center: null, radiusKm: null, kind: 'all' },
  ])
    assert.throws(() => nearbySearchInput(value), code('INVALID_INPUT'))
})

test('legacy seed coordinates stay absent, ordinary distances are unknown, and missing/malformed locations remain separate unlocated results', () => {
  const f = fixture()
  try {
    for (const id of ['goa-food', 'bread-house'])
      assert.ok(!Object.hasOwn(f.repository.venueProfile(id)!, 'location'))
    assert.equal(f.service.getPublicVenue('goa-food').venue.location, null)
    assert.equal(f.service.getOffer('goa-surprise').offer.distanceKm, null)
    const result = f.service.nearbySearch(input)
    assert.equal(result.venues.length, 0)
    assert.equal(result.unlocated.length, 2)
    for (const item of result.unlocated) {
      assert.equal(item.venue.location, null)
      assert.equal(item.distanceKm, null)
      for (const offer of item.offers) assert.equal(offer.distanceKm, null)
    }
    for (const malformed of [
      { latitude: 0, longitude: 0, extra: true },
      { latitude: '0', longitude: 0 },
      JSON.stringify({ latitude: 0, longitude: 0 }),
    ]) {
      point(f, 'goa-food', malformed)
      const next = f.service.nearbySearch({
        ...input,
        center: { latitude: 0, longitude: 0 },
        radiusKm: 1,
      })
      assert.equal(next.venues.length, 0)
      assert.equal(next.unlocated.length, 2)
      assert.equal(
        next.unlocated.find((item) => item.venue.id === 'goa-food')!.distanceKm,
        null,
      )
    }
  } finally {
    f.repository.close()
  }
})

test('distance/radius use actual selected point, exact edge before rounding, deterministic ties and date-line neighbours', () => {
  const f = fixture()
  try {
    point(f, 'goa-food', { latitude: 0, longitude: 0.01 })
    point(f, 'bread-house', { latitude: 0, longitude: 0.01 })
    const exact = greatCircleDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.01 },
    )
    const result = f.service.nearbySearch({
      ...input,
      center: { latitude: 0, longitude: 0 },
      radiusKm: exact,
    })
    assert.deepEqual(
      result.venues.map((item) => item.venue.id),
      ['bread-house', 'goa-food'],
    )
    assert.equal(result.venues[0].distanceKm, 1.11)
    assert.equal(result.venues[0].offers[0].distanceKm, 1.11)
    assert.equal(
      f.service.nearbySearch({
        ...input,
        center: { latitude: 0, longitude: 0 },
        radiusKm: exact - 0.0000001,
      }).venues.length,
      0,
    )
    assert.equal(
      f.service.nearbySearch({ ...input, center: null }).venues[0].distanceKm,
      null,
    )
    point(f, 'goa-food', { latitude: 0, longitude: -179.99 })
    point(f, 'bread-house', { latitude: 0, longitude: 170 })
    const crossing = f.service.nearbySearch({
      ...input,
      center: { latitude: 0, longitude: 179.99 },
      radiusKm: 5,
    })
    assert.deepEqual(
      crossing.venues.map((item) => item.venue.id),
      ['goa-food'],
    )
    assert.equal(crossing.venues[0].distanceKm, 2.22)
  } finally {
    f.repository.close()
  }
})

test('nearby hides every nonapproved venue, paused/past/depleted offers and applies kind + literal Unicode title/address/name matching', () => {
  const f = fixture()
  try {
    const russian = f.service.nearbySearch({ ...input, search: 'нАбОр ДнЯ' })
    assert.equal(russian.unlocated.length, 1)
    assert.deepEqual(
      russian.unlocated[0].offers.map((offer) => offer.id),
      ['goa-surprise'],
    )
    const kazakh = f.service.nearbySearch({ ...input, search: 'КЕШКІ' })
    assert.equal(kazakh.unlocated.length, 1)
    const english = f.service.nearbySearch({
      ...input,
      search: 'CHICKEN',
      kind: 'specific_item',
    })
    assert.deepEqual(
      english.unlocated[0].offers.map((offer) => offer.id),
      ['goa-chicken'],
    )
    assert.equal(
      f.service.nearbySearch({
        ...input,
        search: 'CHICKEN',
        kind: 'surprise_bag',
      }).unlocated.length,
      0,
    )
    assert.equal(
      f.service.nearbySearch({ ...input, search: 'ДОСТЫК' }).unlocated.length,
      1,
    )
    for (const search of ['%', "' OR 1=1 --", '_'])
      assert.equal(
        f.service.nearbySearch({ ...input, search }).unlocated.length,
        0,
      )
    f.repository.db
      .prepare("UPDATE offers SET status='paused' WHERE id='goa-chicken'")
      .run()
    f.repository.db
      .prepare("UPDATE offers SET pickup_end=? WHERE id='bakery-croissants'")
      .run(new Date(NOW - 1).toISOString())
    const held = f.service.reserve(SEED_USERS.buyer, {
      offerId: 'goa-surprise',
      quantity: 8,
      idempotencyKey: 'nearby-depleted-stock',
    }).order
    f.service.confirm(SEED_USERS.buyer, held.id, {
      idempotencyKey: 'nearby-confirm-stock',
    })
    const depleted = f.service.nearbySearch({ ...input, search: 'goa' })
    assert.equal(depleted.unlocated.length, 1)
    assert.equal(depleted.unlocated[0].offers.length, 0)
    assert.equal(
      f.service.nearbySearch({ ...input, search: 'goa', kind: 'surprise_bag' })
        .unlocated.length,
      0,
    )
    for (const status of [
      'pending',
      'changes_requested',
      'rejected',
      'suspended',
    ]) {
      f.repository.db
        .prepare('UPDATE venue_moderation SET status=? WHERE venue_id=?')
        .run(status, 'bread-house')
      assert.ok(
        !f.service
          .nearbySearch(input)
          .unlocated.some((item) => item.venue.id === 'bread-house'),
      )
    }
  } finally {
    f.repository.close()
  }
})

test('profile location saves use current verified owner and shared moderation revision; omissions preserve legacy shape/pins, explicit null clears', () => {
  const f = fixture()
  try {
    const owner = SEED_USERS.cafe,
      adminId = 'geo-admin'
    f.repository.db
      .prepare("INSERT INTO users VALUES (?,?,'buyer',NULL)")
      .run(adminId, 'Geo Administrator')
    for (const user of [owner, { id: adminId }]) {
      f.repository.db
        .prepare('INSERT INTO credentials VALUES (?,?,?,?,?)')
        .run(
          user.id,
          `${user.id}@example.invalid`,
          'unused-geo-fixture',
          'en',
          new Date(NOW).toISOString(),
        )
      f.repository.db
        .prepare('INSERT INTO auth_state VALUES (?,?,1)')
        .run(user.id, NOW)
    }
    f.repository.db
      .prepare('INSERT INTO admin_grants VALUES (?,?)')
      .run(adminId, new Date(NOW).toISOString())
    const admin = f.repository.user(adminId),
      profile = f.repository.venueProfile('goa-food'),
      location = { latitude: 43.25, longitude: 76.92 }
    assert.ok(!Object.hasOwn(venueProfile(profile), 'location'))
    const saved = f.service.updateMerchantProfile(owner, {
      expectedRevision: 1,
      profile: { ...profile, location },
    })
    assert.equal(saved.venue.status, 'pending')
    assert.deepEqual(
      f.repository.application('goa-food')!.history.at(-1)!.snapshot.profile!
        .location,
      location,
    )
    assert.throws(
      () => f.service.getPublicVenue('goa-food'),
      code('VENUE_NOT_FOUND'),
    )
    assert.ok(
      !f.service
        .nearbySearch(input)
        .venues.some((item) => item.venue.id === 'goa-food'),
    )
    const approved = f.service.reviewVenue(admin, 'goa-food', {
      action: 'approve',
      expectedRevision: saved.revision,
    }).application
    assert.deepEqual(
      f.service.getPublicVenue('goa-food').venue.location,
      location,
    )
    const preserved = f.service.updateMerchantProfile(owner, {
      expectedRevision: approved.revision,
      profile,
    })
    assert.deepEqual(preserved.profile!.location, location)
    const cleared = f.service.updateMerchantProfile(owner, {
      expectedRevision: preserved.revision,
      profile: { ...profile, location: null },
    })
    assert.equal(cleared.profile!.location, null)
    assert.throws(
      () =>
        f.service.updateMerchantProfile(owner, {
          expectedRevision: cleared.revision,
          profile: { ...profile, location: { latitude: 90, longitude: 0 } },
        }),
      code('INVALID_INPUT'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id=?')
      .run(owner.id)
    assert.throws(
      () =>
        f.service.updateMerchantProfile(
          { ...owner, emailVerified: true },
          {
            expectedRevision: cleared.revision,
            profile: { ...profile, location },
          },
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
  } finally {
    f.repository.close()
  }
})

test('cap applies only after geographic/text/kind filtering; nearest and unknown results are deterministic with an honest truncation flag', () => {
  const f = fixture()
  try {
    const profile = f.repository.venueProfile('goa-food')
    f.repository.transaction(() => {
      for (let index = 0; index < 515; index++) {
        const id = `synthetic-${String(index).padStart(4, '0')}`,
          near = index >= 510
        f.repository.db
          .prepare(
            "INSERT INTO venues VALUES (?,?,'Synthetic address','approved','Asia/Almaty')",
          )
          .run(id, near ? 'Synthetic Near' : 'Synthetic Far')
        f.repository.db
          .prepare(
            "INSERT INTO venue_moderation VALUES (?,'approved','','',1,?,?,NULL,NULL,NULL)",
          )
          .run(id, new Date(NOW).toISOString(), new Date(NOW).toISOString())
        f.repository.db.prepare('INSERT INTO venue_profiles VALUES (?,?)').run(
          id,
          JSON.stringify({
            ...profile,
            location: { latitude: near ? 0 : 1, longitude: near ? 0 : 1 },
          }),
        )
      }
    })
    const all = f.service.nearbySearch({
      ...input,
      center: { latitude: 0, longitude: 0 },
    })
    assert.equal(all.venues.length + all.unlocated.length, 500)
    assert.equal(all.truncated, true)
    assert.deepEqual(
      all.venues.slice(0, 5).map((item) => item.venue.id),
      Array.from(
        { length: 5 },
        (_, i) => `synthetic-${String(510 + i).padStart(4, '0')}`,
      ),
    )
    const radius = f.service.nearbySearch({
      ...input,
      center: { latitude: 0, longitude: 0 },
      radiusKm: 1,
    })
    assert.equal(radius.venues.length, 5)
    assert.equal(radius.unlocated.length, 2)
    assert.equal(radius.truncated, false)
    const filtered = f.service.nearbySearch({
      ...input,
      search: 'Synthetic Near',
    })
    assert.equal(filtered.venues.length, 5)
    assert.equal(filtered.truncated, false)
    assert.equal(
      f.service.nearbySearch({ ...input, kind: 'specific_item' }).truncated,
      false,
    )
  } finally {
    f.repository.close()
  }
})

test('owner points survive reopen but selected origins are transient; public results omit private moderation/auth/contact metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ostatki-nearby-')),
    path = join(directory, 'isolated.sqlite')
  let repository: Repository | undefined
  try {
    const f = fixture(path)
    repository = f.repository
    point(f, 'goa-food', { latitude: 0, longitude: 0 })
    const profiles = repository.db
        .prepare('SELECT * FROM venue_profiles ORDER BY venue_id')
        .all(),
      before = repository.db.prepare('SELECT total_changes() AS count').get()!
        .count
    const result = f.service.nearbySearch({
      ...input,
      center: { latitude: 0.0001, longitude: 0.0001 },
      radiusKm: 1,
    })
    assert.equal(
      repository.db.prepare('SELECT total_changes() AS count').get()!.count,
      before,
    )
    assert.deepEqual(
      repository.db
        .prepare('SELECT * FROM venue_profiles ORDER BY venue_id')
        .all(),
      profiles,
    )
    const serialized = JSON.stringify(result)
    for (const forbidden of [
      'owner',
      'contactPhone',
      'email',
      'history',
      'photoIds',
      'credential',
      'center',
      'radiusKm',
    ])
      assert.ok(!serialized.includes(forbidden))
    repository.close()
    repository = new Repository(path, NOW, { seedFixtures: true })
    assert.deepEqual(
      new MarketplaceService(repository, () => NOW).getPublicVenue('goa-food')
        .venue.location,
      { latitude: 0, longitude: 0 },
    )
  } finally {
    repository?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('actual guest POST nearby uses bounded JSON and same Origin, never URL coordinates or cache; no account is required', async () => {
  const f = fixture(),
    runtime = globalThis as typeof globalThis & {
      ostatkiService?: MarketplaceService
    },
    previous = runtime.ostatkiService
  runtime.ostatkiService = f.service
  try {
    const request = (body: unknown, origin = 'https://food.example') =>
      new Request('https://food.example/api/nearby/search', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    assert.equal(
      (await POST(request(input, 'https://foreign.example'))).status,
      403,
    )
    assert.equal(
      (
        await POST(
          request({ ...input, center: { latitude: '43', longitude: 76 } }),
        )
      ).status,
      400,
    )
    const response = await POST(request(input))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal((await response.json()).unlocated.length, 2)
    assert.equal(
      (await POST(request({ ...input, search: 'x'.repeat(17000) }))).status,
      413,
    )
  } finally {
    if (previous === undefined) delete runtime.ostatkiService
    else runtime.ostatkiService = previous
    f.repository.close()
  }
})
