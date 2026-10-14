import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import type { User, VenueProfileContent } from '../src/shared/api/contracts.ts'
import { venueProfile } from '../src/domain/venue-validation.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { grantAdministrator } from '../src/server/auth.ts'
import { endpoint, readJson } from '../src/server/http.ts'
import { PATCH as patchProfile } from '../src/app/api/merchant/profile/route.ts'
import { PATCH as reviewVenue } from '../src/app/api/admin/venues/[id]/route.ts'
import { POST as reserve } from '../src/app/api/reservations/route.ts'
import { POST as createOffer } from '../src/app/api/merchant/offers/route.ts'
import { PATCH as patchOffer } from '../src/app/api/merchant/offers/[id]/route.ts'
import { PATCH as patchApplication } from '../src/app/api/merchant/application/route.ts'
import { POST as confirmOrder } from '../src/app/api/orders/[id]/confirm/route.ts'
import { POST as collectOrder } from '../src/app/api/merchant/pickup/route.ts'
import { POST as requestVerification } from '../src/app/api/auth/verification/request/route.ts'
import { POST as confirmVerification } from '../src/app/api/auth/verification/confirm/route.ts'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const PASSWORD = 'A profile fixture password 2026!'
const VENUE = {
  name: 'Profile Bakery',
  address: 'Abay 44, Almaty',
  description: 'Fresh bread and pastries prepared every morning.',
  contactPhone: '+77000000000',
}
const PROFILE: VenueProfileContent = {
  translations: {
    ru: {
      description: 'Маленькая пекарня с хлебом и свежей выпечкой каждый день.',
      pickupInstructions: 'Зайди через главный вход и покажи код у стойки.',
    },
    kk: {
      description: 'Күн сайын нан мен жаңа тоқаш пісіретін шағын наубайхана.',
      pickupInstructions:
        'Негізгі есіктен кіріп, кассада тапсырыс кодын көрсет.',
    },
    en: {
      description:
        'A neighbourhood bakery making fresh bread and pastries every day.',
      pickupInstructions:
        'Use the main entrance and show your collection code at the counter.',
    },
  },
  openingHours: Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: day >= 5,
    opens: day >= 5 ? '' : '09:00',
    closes: day >= 5 ? '' : '18:00',
  })),
  photoIds: [],
}
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected

function fixture(path = ':memory:') {
  const repository = new Repository(path, NOW, { seedFixtures: true })
  const service = new MarketplaceService(repository, () => NOW)
  return { repository, service }
}

async function account(
  f: ReturnType<typeof fixture>,
  email: string,
  cafe = false,
  verified = true,
): Promise<User> {
  const result = await f.service.register({
    name: cafe ? 'Profile Owner' : 'Profile Buyer',
    email,
    password: PASSWORD,
    locale: 'en',
    accountType: cafe ? 'cafe' : 'buyer',
    ...(cafe ? { venue: VENUE } : {}),
  })
  if (verified)
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
      .run(NOW, result.user.id)
  return f.repository.user(result.user.id)!
}

async function admin(f: ReturnType<typeof fixture>): Promise<User> {
  const user = await account(f, 'admin@example.invalid')
  grantAdministrator(f.repository, user.email!, NOW)
  return f.repository.user(user.id)!
}

function photo(
  f: ReturnType<typeof fixture>,
  owner: User,
  options: { ownerId?: string; venueId?: string } = {},
) {
  const id = randomUUID()
  f.repository.db
    .prepare('INSERT INTO photo_assets VALUES (?,?,?,?,?,?,?,?)')
    .run(
      id,
      options.venueId ?? owner.venueId!,
      options.ownerId ?? owner.id,
      'image/webp',
      800,
      600,
      5000,
      new Date(NOW).toISOString(),
    )
  return id
}

function approve(
  f: ReturnType<typeof fixture>,
  administrator: User,
  owner: User,
) {
  const application = f.service.merchantApplication(owner).application
  return f.service.reviewVenue(administrator, application.id, {
    action: 'approve',
    expectedRevision: application.revision,
  }).application
}

function offerInput(f: ReturnType<typeof fixture>, image: string) {
  const {
    title,
    kind,
    description,
    guarantee,
    allergens,
    price,
    originalPrice,
    totalQuantity,
    pickupStart,
    pickupEnd,
    translations,
  } = f.service.getOffer('goa-surprise').offer
  return {
    title,
    kind,
    description,
    guarantee,
    allergens,
    price,
    originalPrice,
    totalQuantity,
    pickupStart,
    pickupEnd,
    translations,
    image,
  }
}

test('new/legacy profiles are empty without invented details while seeded approved venues have curated public galleries', async () => {
  const f = fixture()
  try {
    assert.equal(f.repository.databaseFile, ':memory:')
    const owner = await account(f, 'owner@example.invalid', true)
    const profile = f.service.merchantProfile(owner)
    assert.equal(profile.profile, null)
    assert.equal(profile.revision, 1)
    assert.deepEqual(profile.photos, [])
    assert.throws(
      () => f.service.getPublicVenue(owner.venueId!),
      code('VENUE_NOT_FOUND'),
    )
    const seeded = f.service.getPublicVenue('goa-food')
    assert.equal(seeded.venue.profile?.openingHours.length, 7)
    assert.ok(seeded.venue.profile?.translations.en.description)
    assert.ok(seeded.venue.profile?.translations.kk.pickupInstructions)
    assert.deepEqual(
      seeded.venue.photos.map((item) => item.url),
      ['/images/goa-food.png', '/images/goa-interior.png'],
    )
    assert.ok(!('photoIds' in seeded.venue.profile!))
    assert.throws(
      () => f.service.getPublicVenue('new-cafe'),
      code('VENUE_NOT_FOUND'),
    )
    assert.throws(
      () => f.service.getPublicVenue('unknown-cafe'),
      code('VENUE_NOT_FOUND'),
    )
  } finally {
    f.repository.close()
  }
})

test('localized profile validation requires seven unique days, canonical hours, unique owned-photo identifiers and a strict shape', () => {
  const reversed = {
    ...PROFILE,
    openingHours: [...PROFILE.openingHours].reverse(),
  }
  assert.deepEqual(venueProfile(reversed), PROFILE)
  const malformed = [
    {
      ...PROFILE,
      translations: {
        ru: PROFILE.translations.ru,
        en: PROFILE.translations.en,
      },
    },
    {
      ...PROFILE,
      translations: { ...PROFILE.translations, de: PROFILE.translations.en },
    },
    {
      ...PROFILE,
      translations: {
        ...PROFILE.translations,
        en: { ...PROFILE.translations.en, email: 'private@example.invalid' },
      },
    },
    {
      ...PROFILE,
      translations: {
        ...PROFILE.translations,
        en: { ...PROFILE.translations.en, description: 'too short' },
      },
    },
    { ...PROFILE, openingHours: PROFILE.openingHours.slice(1) },
    {
      ...PROFILE,
      openingHours: PROFILE.openingHours.map((day) => ({ ...day, day: 0 })),
    },
    {
      ...PROFILE,
      openingHours: PROFILE.openingHours.map((day, index) =>
        index === 0 ? { ...day, opens: '24:00' } : day,
      ),
    },
    {
      ...PROFILE,
      openingHours: PROFILE.openingHours.map((day, index) =>
        index === 0 ? { ...day, opens: '20:00', closes: '09:00' } : day,
      ),
    },
    {
      ...PROFILE,
      openingHours: PROFILE.openingHours.map((day, index) =>
        index === 6 ? { ...day, opens: '09:00' } : day,
      ),
    },
    { ...PROFILE, photoIds: [randomUUID(), '../outside'] },
    { ...PROFILE, photoIds: Array.from({ length: 9 }, () => randomUUID()) },
    {
      ...PROFILE,
      photoIds: [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ],
    },
    { ...PROFILE, ownerId: 'injected-owner' },
  ]
  for (const input of malformed)
    assert.throws(() => venueProfile(input), code('INVALID_INPUT'))
})

test('profile reads stay owner scoped and only a currently verified cafe can submit edits', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true, false)
    const buyer = await account(f, 'buyer@example.invalid')
    assert.throws(() => f.service.merchantProfile(null), code('AUTH_REQUIRED'))
    assert.throws(() => f.service.merchantProfile(buyer), code('FORBIDDEN'))
    assert.throws(
      () =>
        f.service.updateMerchantProfile(
          { ...owner, emailVerified: true },
          { expectedRevision: 1, profile: PROFILE },
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.throws(
      () =>
        f.service.updateMerchantProfile(owner, {
          expectedRevision: 1,
          profile: PROFILE,
          venueId: 'goa-food',
        }),
      code('EMAIL_NOT_VERIFIED'),
    )
    const forged = { ...owner, venueId: 'goa-food', role: 'admin' as const }
    assert.equal(f.service.merchantProfile(forged).venue.id, owner.venueId)
    assert.equal(f.service.merchantProfile(owner).profile, null)
  } finally {
    f.repository.close()
  }
})

test('gallery attachment rejects missing/foreign/mismatched-owner photos atomically', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const other = await account(f, 'other@example.invalid', true)
    const forbidden = [
      randomUUID(),
      photo(f, other),
      photo(f, owner, { ownerId: other.id }),
      photo(f, owner, { venueId: other.venueId! }),
    ]
    for (const id of forbidden)
      assert.throws(
        () =>
          f.service.updateMerchantProfile(owner, {
            expectedRevision: 1,
            profile: { ...PROFILE, photoIds: [id] },
          }),
        code('PHOTO_NOT_FOUND'),
      )
    assert.equal(f.service.merchantProfile(owner).profile, null)
    assert.equal(f.service.merchantProfile(owner).revision, 1)
    assert.equal(
      f.service.merchantApplication(owner).application.history.length,
      1,
    )
    const mine = photo(f, owner)
    const saved = f.service.updateMerchantProfile(owner, {
      expectedRevision: 1,
      profile: { ...PROFILE, photoIds: [mine] },
    })
    assert.equal(saved.revision, 2)
    assert.deepEqual(saved.profile?.photoIds, [mine])
    assert.equal(saved.photos.length, 1)
    assert.ok(!JSON.stringify(saved.photos).includes('owner_id'))
    assert.deepEqual(Object.keys(saved.photos[0]), [
      'id',
      'url',
      'width',
      'height',
      'bytes',
      'createdAt',
    ])
  } finally {
    f.repository.close()
  }
})

test('profile edits share moderation revisions, hide pending venues, preserve full immutable snapshots and survive core edits', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const administrator = await admin(f)
    const id = photo(f, owner)
    const content = { ...PROFILE, photoIds: [id] }
    const saved = f.service.updateMerchantProfile(owner, {
      expectedRevision: 1,
      profile: content,
    })
    assert.equal(saved.venue.status, 'pending')
    const application = f.service.getVenueApplication(
      administrator,
      owner.venueId!,
    ).application
    assert.deepEqual(application.profile, content)
    assert.deepEqual(application.history.at(-1)?.snapshot, {
      ...VENUE,
      profile: content,
    })
    assert.equal(application.photos[0].url, `/api/photos/${id}`)
    assert.throws(
      () => f.service.getPublicVenue(owner.venueId!),
      code('VENUE_NOT_FOUND'),
    )
    const approved = approve(f, administrator, owner)
    const published = f.service.getPublicVenue(owner.venueId!)
    assert.deepEqual(published.venue.profile, {
      translations: PROFILE.translations,
      openingHours: PROFILE.openingHours,
    })
    assert.equal(published.venue.photos[0].url, `/api/photos/${id}`)
    const privateText = JSON.stringify(published)
    for (const forbidden of [
      owner.email!,
      VENUE.contactPhone,
      'owner_id',
      'photoIds',
      'reasons',
      'history',
    ])
      assert.ok(!privateText.includes(forbidden))
    const changed = f.service.updateMerchantApplication(owner, {
      ...VENUE,
      address: 'Abay 44, side entrance',
      expectedRevision: approved.revision,
    }).application
    assert.equal(changed.status, 'pending')
    assert.deepEqual(changed.profile, content)
    assert.deepEqual(changed.history.at(-1)?.snapshot.profile, content)
    assert.equal(
      changed.history.at(-1)?.snapshot.address,
      'Abay 44, side entrance',
    )
    assert.equal(changed.history[1].snapshot.address, VENUE.address)
    assert.throws(
      () =>
        f.service.reviewVenue(administrator, owner.venueId!, {
          action: 'approve',
          expectedRevision: approved.revision,
        }),
      code('MODERATION_CONFLICT'),
    )
    assert.throws(
      () =>
        f.service.updateMerchantProfile(owner, {
          expectedRevision: approved.revision,
          profile: { ...content, photoIds: [] },
        }),
      code('MODERATION_CONFLICT'),
    )
  } finally {
    f.repository.close()
  }
})

test('rejected and suspended profiles are never publicly disclosed; correction starts a new reviewed revision', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const administrator = await admin(f)
    f.service.updateMerchantProfile(owner, {
      expectedRevision: 1,
      profile: PROFILE,
    })
    const reasons = {
      ru: 'Уточни время работы.',
      kk: 'Жұмыс уақытын нақтыла.',
      en: 'Clarify your opening hours.',
    }
    const rejected = f.service.reviewVenue(administrator, owner.venueId!, {
      action: 'reject',
      expectedRevision: 2,
      reasons,
    }).application
    assert.throws(
      () => f.service.getPublicVenue(owner.venueId!),
      code('VENUE_NOT_FOUND'),
    )
    const corrected = f.service.updateMerchantProfile(owner, {
      expectedRevision: rejected.revision,
      profile: PROFILE,
    })
    assert.equal(corrected.venue.status, 'pending')
    assert.equal(f.service.merchantApplication(owner).application.reasons, null)
    const approved = approve(f, administrator, owner)
    f.service.reviewVenue(administrator, owner.venueId!, {
      action: 'suspend',
      expectedRevision: approved.revision,
      reasons,
    })
    assert.throws(
      () => f.service.getPublicVenue(owner.venueId!),
      code('VENUE_NOT_FOUND'),
    )
  } finally {
    f.repository.close()
  }
})

test('owned upload images work for offers, foreign assets are rejected and existing order pictures remain immutable', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const other = await account(f, 'other@example.invalid', true)
    const buyer = await account(f, 'buyer@example.invalid')
    const administrator = await admin(f)
    approve(f, administrator, owner)
    approve(f, administrator, other)
    const first = photo(f, owner),
      second = photo(f, owner),
      foreign = photo(f, other)
    const offer = f.service.createOffer(
      owner,
      offerInput(f, `/api/photos/${first}`),
    ).offer
    const reserved = f.service.reserve(buyer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'photo-reservation-1',
    }).order
    f.service.confirm(buyer, reserved.id, {
      idempotencyKey: 'photo-confirmation-1',
    })
    assert.throws(
      () =>
        f.service.createOffer(owner, offerInput(f, `/api/photos/${foreign}`)),
      code('PHOTO_NOT_FOUND'),
    )
    assert.throws(
      () =>
        f.service.patchOffer(owner, offer.id, {
          image: `/api/photos/${foreign}`,
        }),
      code('PHOTO_NOT_FOUND'),
    )
    assert.throws(
      () =>
        f.service.patchOffer(other, offer.id, {
          image: `/api/photos/${foreign}`,
        }),
      code('OFFER_NOT_FOUND'),
    )
    assert.throws(
      () =>
        f.service.patchOffer(owner, offer.id, {
          image: 'https://untrusted.example/photo.png',
        }),
      code('INVALID_INPUT'),
    )
    assert.equal(
      f.service.patchOffer(owner, offer.id, { image: `/api/photos/${second}` })
        .offer.image,
      `/api/photos/${second}`,
    )
    assert.equal(
      f.service.getOrder(buyer, reserved.id).order.snapshot.image,
      `/api/photos/${first}`,
    )
    const next = f.service.reserve(buyer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'photo-reservation-2',
    }).order
    assert.equal(next.snapshot.image, `/api/photos/${second}`)
    assert.equal(
      f.service.getPublicVenue(owner.venueId!).offers[0].image,
      `/api/photos/${second}`,
    )
  } finally {
    f.repository.close()
  }
})

test('profile and gallery state survive reopening; separate stale editor connections cannot overwrite the latest version', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-venue-profile-'))
  const path = join(dir, 'profile.sqlite')
  let first: Repository | undefined, second: Repository | undefined
  try {
    const f = fixture(path)
    first = f.repository
    const owner = await account(f, 'owner@example.invalid', true)
    const id = photo(f, owner)
    const other = fixture(path)
    second = other.repository
    assert.equal(first.databaseFile, path)
    f.service.updateMerchantProfile(owner, {
      expectedRevision: 1,
      profile: { ...PROFILE, photoIds: [id] },
    })
    assert.throws(
      () =>
        other.service.updateMerchantProfile(owner, {
          expectedRevision: 1,
          profile: PROFILE,
        }),
      code('MODERATION_CONFLICT'),
    )
    assert.equal(other.service.merchantProfile(owner).revision, 2)
    assert.deepEqual(other.service.merchantProfile(owner).profile?.photoIds, [
      id,
    ])
    first.close()
    first = undefined
    second.close()
    second = undefined
    const reopened = fixture(path)
    first = reopened.repository
    assert.equal(reopened.service.merchantProfile(owner).revision, 2)
    assert.deepEqual(
      reopened.service.merchantProfile(owner).profile?.translations,
      PROFILE.translations,
    )
    assert.equal(
      reopened.service.merchantProfile(owner).photos[0].url,
      `/api/photos/${id}`,
    )
    assert.deepEqual(
      reopened.service.merchantApplication(owner).application.history.at(-1)
        ?.snapshot.profile?.photoIds,
      [id],
    )
  } finally {
    first?.close()
    second?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('HTTP profile mutation preserves Origin/auth boundaries and public venue output is uncached', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const login = await f.service.login({
      email: owner.email,
      password: PASSWORD,
    })
    const request = (origin: string, cookie = true) =>
      new Request('https://food.example/api/merchant/profile', {
        method: 'PATCH',
        headers: {
          origin,
          'content-type': 'application/json',
          ...(cookie ? { cookie: `ostatki_session=${login.token}` } : {}),
        },
        body: JSON.stringify({ expectedRevision: 1, profile: PROFILE }),
      })
    const patch = async (req: Request) =>
      endpoint(
        req,
        true,
        async ({ service, token }) => {
          const input = await readJson(req)
          return service.updateMerchantProfile(service.session(token), input)
        },
        f.service,
      )
    assert.equal((await patch(request('https://evil.example'))).status, 403)
    assert.equal(
      (await patch(request('https://food.example', false))).status,
      401,
    )
    assert.equal((await patch(request('https://food.example'))).status, 200)
    const response = await endpoint(
      new Request('https://food.example/api/venues/goa-food'),
      false,
      ({ service }) => service.getPublicVenue('goa-food'),
      f.service,
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  } finally {
    f.repository.close()
  }
})

test('profile-specific JSON bound accepts maximum validated three-language Unicode while the default limit stays 16 KiB', async () => {
  const f = fixture()
  try {
    const owner = await account(f, 'owner@example.invalid', true)
    const login = await f.service.login({
      email: owner.email,
      password: PASSWORD,
    })
    const translations = Object.fromEntries(
      (['ru', 'kk', 'en'] as const).map((locale) => [
        locale,
        {
          description: '界'.repeat(1500),
          pickupInstructions: '界'.repeat(800),
        },
      ]),
    ) as VenueProfileContent['translations']
    const body = JSON.stringify({
      expectedRevision: 1,
      profile: { ...PROFILE, translations },
    })
    assert.ok(Buffer.byteLength(body) > 16_384)
    assert.ok(Buffer.byteLength(body) <= 32_768)
    const request = () =>
      new Request('https://food.example/api/merchant/profile', {
        method: 'PATCH',
        headers: {
          origin: 'https://food.example',
          'content-type': 'application/json',
          cookie: `ostatki_session=${login.token}`,
        },
        body,
      })
    await assert.rejects(readJson(request()), code('BODY_TOO_LARGE'))
    const req = request()
    const response = await endpoint(
      req,
      true,
      async ({ service, token }) => {
        const input = await readJson(req, 32_768)
        return service.updateMerchantProfile(service.session(token), input)
      },
      f.service,
    )
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).profile.translations, translations)
    await assert.rejects(readJson(request(), 32_769), code('INTERNAL_ERROR'))
  } finally {
    f.repository.close()
  }
})

test('actual protected JSON routes reject a session revoked while their request body is still arriving without writes', async () => {
  const f = fixture()
  const runtime = globalThis as typeof globalThis & {
    ostatkiService?: MarketplaceService
  }
  const previous = runtime.ostatkiService
  runtime.ostatkiService = f.service
  try {
    const owner = await account(f, 'delayed-owner@example.invalid', true)
    const buyer = await account(f, 'delayed-buyer@example.invalid')
    const unverified = await account(
      f,
      'delayed-unverified@example.invalid',
      false,
      false,
    )
    const administrator = await admin(f)
    const approved = approve(f, administrator, owner)
    const offer = f.service.createOffer(
      owner,
      offerInput(f, '/images/bakery.png'),
    ).offer
    const reserved = f.service.reserve(buyer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'delayed-reserved-order',
    }).order
    const confirmed = f.service.reserve(buyer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'delayed-confirmed-order',
    }).order
    f.service.confirm(buyer, confirmed.id, {
      idempotencyKey: 'delayed-confirmed-order-confirm',
    })
    const cases: Array<{
      path: string
      method: 'POST' | 'PATCH'
      actor: User
      input: unknown
      handler: (request: Request) => Promise<Response>
    }> = [
      {
        path: '/api/merchant/profile',
        method: 'PATCH',
        actor: owner,
        input: { expectedRevision: approved.revision, profile: PROFILE },
        handler: patchProfile,
      },
      {
        path: `/api/admin/venues/${owner.venueId}`,
        method: 'PATCH',
        actor: administrator,
        input: {
          action: 'suspend',
          expectedRevision: approved.revision,
          reasons: {
            ru: 'Уточните данные заведения.',
            kk: 'Мекеме туралы мәліметті нақтылаңыз.',
            en: 'Please clarify the venue details.',
          },
        },
        handler: (request) =>
          reviewVenue(request, {
            params: Promise.resolve({ id: owner.venueId! }),
          }),
      },
      {
        path: '/api/reservations',
        method: 'POST',
        actor: buyer,
        input: {
          offerId: offer.id,
          quantity: 1,
          idempotencyKey: 'delayed-new-reservation',
        },
        handler: reserve,
      },
      {
        path: '/api/merchant/offers',
        method: 'POST',
        actor: owner,
        input: offerInput(f, '/images/bakery.png'),
        handler: createOffer,
      },
      {
        path: `/api/merchant/offers/${offer.id}`,
        method: 'PATCH',
        actor: owner,
        input: { image: '/images/croissant.png' },
        handler: (request) =>
          patchOffer(request, { params: Promise.resolve({ id: offer.id }) }),
      },
      {
        path: '/api/merchant/application',
        method: 'PATCH',
        actor: owner,
        input: { ...VENUE, expectedRevision: approved.revision },
        handler: patchApplication,
      },
      {
        path: `/api/orders/${reserved.id}/confirm`,
        method: 'POST',
        actor: buyer,
        input: { idempotencyKey: 'delayed-confirmation' },
        handler: (request) =>
          confirmOrder(request, {
            params: Promise.resolve({ id: reserved.id }),
          }),
      },
      {
        path: '/api/merchant/pickup',
        method: 'POST',
        actor: owner,
        input: {
          code: f.service.getOrder(buyer, confirmed.id).order.pickupCode,
          idempotencyKey: 'delayed-collection',
        },
        handler: collectOrder,
      },
      {
        path: '/api/auth/verification/request',
        method: 'POST',
        actor: unverified,
        input: { locale: 'en' },
        handler: requestVerification,
      },
      {
        path: '/api/auth/verification/confirm',
        method: 'POST',
        actor: unverified,
        input: { token: 'a'.repeat(43) },
        handler: confirmVerification,
      },
    ]
    for (const item of cases) {
      const login = await f.service.login({
        email: item.actor.email,
        password: PASSWORD,
      })
      let releaseBody!: () => void
      let startedReading!: () => void
      const released = new Promise<void>((resolve) => {
        releaseBody = resolve
      })
      const started = new Promise<void>((resolve) => {
        startedReading = resolve
      })
      const stream = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            startedReading()
            await released
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(item.input)),
            )
            controller.close()
          },
        },
        { highWaterMark: 0 },
      )
      const request = new Request(`https://food.example${item.path}`, {
        method: item.method,
        headers: {
          origin: 'https://food.example',
          'content-type': 'application/json',
          cookie: `ostatki_session=${login.token}`,
        },
        body: stream,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' })
      const pending = item.handler(request)
      await started
      assert.ok(f.service.session(login.token), item.path)
      f.service.deleteSession(login.token)
      const changes = () =>
        f.repository.db.prepare('SELECT total_changes() AS count').get()?.count
      const before = changes()
      releaseBody()
      const response = await pending
      assert.equal(response.status, 401, item.path)
      assert.equal(
        (await response.json()).error.code,
        'AUTH_REQUIRED',
        item.path,
      )
      assert.equal(changes(), before, `${item.path} must not write`)
    }
    assert.equal(f.service.merchantProfile(owner).revision, approved.revision)
    assert.equal(f.repository.offer(offer.id)?.image, '/images/bakery.png')
    assert.equal(f.repository.order(reserved.id)?.status, 'reserved')
    assert.equal(f.repository.order(confirmed.id)?.status, 'confirmed')
  } finally {
    if (previous === undefined) delete runtime.ostatkiService
    else runtime.ostatkiService = previous
    f.repository.close()
  }
})
