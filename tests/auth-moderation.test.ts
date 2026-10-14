import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { grantAdministrator } from '../src/server/auth.ts'
import {
  assertSameOrigin,
  endpoint,
  json,
  readJson,
  sessionCookie,
} from '../src/server/http.ts'

const INITIAL_TIME = Date.parse('2026-10-11T12:00:00Z')
const PASSWORD = 'Correct horse батарея 123!'
const VENUE = {
  name: 'Honest Bakery',
  address: 'Abay 44, Almaty',
  description: 'Fresh bakery with pickup offers every evening.',
  contactPhone: '+77000000000',
}
const REASONS = {
  ru: 'Уточните адрес входа.',
  kk: 'Кіреберіс мекенжайын нақтылаңыз.',
  en: 'Please clarify the pickup entrance.',
}

test('Origin guard uses direct same-port loopback Host when Next normalizes the URL', () => {
  const url = 'http://localhost:3104/api/auth/login'
  const request = (headers: Record<string, string>) =>
    new Request(url, { method: 'POST', headers })
  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({ host: '127.0.0.1:3104', origin: 'http://127.0.0.1:3104' }),
    ),
  )
  assert.doesNotThrow(() =>
    assertSameOrigin(
      request({ host: '[::1]:3104', origin: 'http://[::1]:3104' }),
    ),
  )
  const rejected: Record<string, string>[] = [
    { host: '127.0.0.1:3104', origin: 'https://127.0.0.1:3104' },
    { host: '127.0.0.1:3104', origin: 'http://127.0.0.1:3103' },
    { host: '127.0.0.1:3104', origin: 'http://evil.example' },
    { host: 'evil.example:3104', origin: 'http://evil.example:3104' },
    { host: 'localhost:3104@evil.example', origin: 'http://evil.example' },
    { host: 'localhost:3104/evil', origin: 'http://localhost:3104' },
    { host: 'localhost:3104,evil.example', origin: 'http://localhost:3104' },
    { host: 'localhost:3103', origin: 'http://localhost:3103' },
    {
      host: '127.0.0.1:3104',
      origin: 'http://127.0.0.1:3104',
      'sec-fetch-site': 'cross-site',
    },
  ]
  for (const headers of rejected)
    assert.throws(
      () => assertSameOrigin(request(headers)),
      code('ORIGIN_REJECTED'),
    )
  assert.throws(
    () =>
      assertSameOrigin(
        request({
          origin: 'http://evil.example',
          'x-forwarded-host': 'evil.example',
        }),
      ),
    code('ORIGIN_REJECTED'),
  )
})

test('fixed deployment origin rejects forwarded spoofing and retains secure cookies behind a proxy', () => {
  const previous = process.env.OSTATKI_PUBLIC_ORIGIN
  process.env.OSTATKI_PUBLIC_ORIGIN = 'https://food.example.com'
  try {
    const request = new Request('http://localhost:3104/api/auth/login', {
      method: 'POST',
      headers: { host: 'localhost:3104', origin: 'https://food.example.com' },
    })
    assert.doesNotThrow(() => assertSameOrigin(request))
    assert.match(sessionCookie(request, 'a'.repeat(43)), /; Secure$/)
    assert.throws(
      () =>
        assertSameOrigin(
          new Request(request.url, {
            method: 'POST',
            headers: {
              host: 'localhost:3104',
              origin: 'https://evil.example',
              'x-forwarded-host': 'evil.example',
            },
          }),
        ),
      code('ORIGIN_REJECTED'),
    )
  } finally {
    if (previous === undefined) delete process.env.OSTATKI_PUBLIC_ORIGIN
    else process.env.OSTATKI_PUBLIC_ORIGIN = previous
  }
})

function fixture(path = ':memory:') {
  let time = INITIAL_TIME
  const repository = new Repository(path, time, { seedFixtures: true })
  const service = new MarketplaceService(repository, () => time)
  return {
    repository,
    service,
    advance: (ms: number) => {
      time += ms
    },
  }
}

const buyer = (email = 'buyer@example.com') => ({
  name: 'Buyer Name',
  email,
  password: PASSWORD,
  locale: 'en',
  accountType: 'buyer',
})
// These marketplace tests begin after email ownership was established; lifecycle tests cover that proof.
async function verifiedAccount(
  repository: Repository,
  service: MarketplaceService,
  value: unknown,
) {
  const result = await service.register(value)
  repository.db
    .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
    .run(INITIAL_TIME, result.user.id)
  return repository.user(result.user.id)!
}
const cafe = (email = 'cafe@example.com') => ({
  ...buyer(email),
  name: 'Cafe Owner',
  accountType: 'cafe',
  venue: VENUE,
})
function code(expected: string) {
  return (error: unknown) =>
    error instanceof DomainError && error.code === expected
}
async function administrator(
  repository: Repository,
  service: MarketplaceService,
) {
  const registered = await service.register(buyer('administrator@example.com'))
  grantAdministrator(repository, 'administrator@example.com', INITIAL_TIME)
  repository.db
    .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
    .run(INITIAL_TIME, registered.user.id)
  assert.equal(service.session(registered.token), null)
  return repository.user(registered.user.id)!
}
function offerInput(service: MarketplaceService) {
  const source = service.getOffer('goa-surprise').offer
  return {
    title: source.title,
    kind: source.kind,
    description: source.description,
    guarantee: source.guarantee,
    allergens: source.allergens,
    price: source.price,
    originalPrice: source.originalPrice,
    totalQuantity: 10,
    image: source.image,
    pickupStart: source.pickupStart,
    pickupEnd: source.pickupEnd,
    translations: source.translations,
    idempotencyKey: 'owned-offer-0001',
  }
}

test('real registration stores salted hashes, preserves Unicode and rejects privilege/identity injection', async () => {
  const { repository, service } = fixture()
  try {
    const first = await service.register(buyer('  Buyer@Example.com  '))
    assert.equal(first.user.email, 'buyer@example.com')
    assert.equal(first.user.locale, 'en')
    assert.equal(first.user.role, 'buyer')
    assert.equal(first.user.venueId, null)
    assert.equal(service.session(first.token)?.id, first.user.id)
    const second = await service.register(buyer('another@example.com'))
    const credentials = repository.db
      .prepare('SELECT password_hash FROM credentials ORDER BY rowid')
      .all()
    assert.notEqual(credentials[0].password_hash, credentials[1].password_hash)
    assert.match(
      String(credentials[0].password_hash),
      /^scrypt\$131072\$8\$1\$/,
    )
    assert.ok(!JSON.stringify(first).includes(PASSWORD))
    assert.ok(!JSON.stringify(first.user).includes('password'))
    assert.notEqual(first.token, second.token)
    for (const extra of [
      { role: 'admin' },
      { userId: first.user.id },
      { persona: 'cafe' },
    ]) {
      await assert.rejects(
        service.register({ ...buyer('spoof@example.com'), ...extra }),
        code('INVALID_INPUT'),
      )
    }
    await assert.rejects(
      service.register({
        ...buyer('short@example.com'),
        password: 'short password',
      }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      service.register({
        ...buyer('long@example.com'),
        password: '界'.repeat(129),
      }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      service.register({
        ...buyer('bad-role@example.com'),
        accountType: 'admin',
      }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      service.register(buyer('BUYER@example.COM')),
      code('EMAIL_UNAVAILABLE'),
    )
  } finally {
    repository.close()
  }
})

test('login fails generically, rotates/revokes sessions and actual logout revokes access', async () => {
  const { repository, service } = fixture()
  try {
    const registered = await service.register(buyer())
    const auth = await service.login(
      { email: 'BUYER@EXAMPLE.COM', password: PASSWORD },
      registered.token,
    )
    assert.notEqual(auth.token, registered.token)
    assert.equal(service.session(registered.token), null)
    assert.equal(service.session(auth.token)?.id, registered.user.id)
    const failures: string[] = []
    for (const credentials of [
      { email: 'buyer@example.com', password: 'a wrong password' },
      { email: 'missing@example.com', password: 'a wrong password' },
    ]) {
      await assert.rejects(service.login(credentials), (error: unknown) => {
        assert.ok(error instanceof DomainError)
        failures.push(`${error.status}:${error.code}:${error.message}`)
        return true
      })
    }
    assert.equal(failures[0], failures[1])
    service.deleteSession(auth.token)
    assert.equal(service.session(auth.token), null)
  } finally {
    repository.close()
  }
})

test('parallel credential work is bounded and simultaneous email registration produces one account', async () => {
  const { repository, service } = fixture()
  try {
    const first = service.register(buyer('race@example.com'))
    const second = service.register(buyer('RACE@EXAMPLE.COM'))
    await assert.rejects(
      service.register(buyer('busy@example.com')),
      code('RETRY_LATER'),
    )
    const outcomes = await Promise.allSettled([first, second])
    assert.equal(
      outcomes.filter((result) => result.status === 'fulfilled').length,
      1,
    )
    const failure = outcomes.find((result) => result.status === 'rejected')
    assert.ok(
      failure &&
        failure.status === 'rejected' &&
        code('EMAIL_UNAVAILABLE')(failure.reason),
    )
    assert.equal(
      repository.db.prepare('SELECT count(*) AS total FROM credentials').get()
        ?.total,
      1,
    )
  } finally {
    repository.close()
  }
})

test('password verification preserves meaningful whitespace instead of trimming input', async () => {
  const { repository, service } = fixture()
  try {
    const exactPassword = '  a password with meaningful spaces  '
    await service.register({ ...buyer(), password: exactPassword })
    await assert.rejects(
      service.login({
        email: 'buyer@example.com',
        password: exactPassword.trim(),
      }),
      code('INVALID_CREDENTIALS'),
    )
    assert.equal(
      (
        await service.login({
          email: 'buyer@example.com',
          password: exactPassword,
        })
      ).user.email,
      'buyer@example.com',
    )
  } finally {
    repository.close()
  }
})

test('seeded persona sessions are disabled by default, including cookies from old runtime', () => {
  const { repository, service } = fixture()
  try {
    assert.throws(
      () => service.createSession({ persona: 'cafe' }),
      code('FORBIDDEN'),
    )
    const testService = new MarketplaceService(repository, () => INITIAL_TIME, {
      allowPersonaSessions: true,
    })
    const old = testService.createSession({ persona: 'cafe' })
    assert.equal(testService.session(old.token)?.role, 'cafe')
    assert.equal(service.session(old.token), null)
    assert.throws(
      () =>
        service.listVenueApplications({
          id: 'alina',
          name: 'Injected',
          role: 'admin',
          venueId: null,
        }),
      code('FORBIDDEN'),
    )
  } finally {
    repository.close()
  }
})

test('HTTP auth protects origin, strict fields and response/cookie boundaries', async () => {
  const { repository, service } = fixture()
  const url = 'https://ostatki.example/api/auth/register'
  const request = (value: unknown, origin = 'https://ostatki.example') =>
    new Request(url, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(value),
    })
  const handler = async (req: Request) =>
    endpoint(
      req,
      true,
      async ({ service: current, token }) => {
        const result = await current.register(await readJson(req), token)
        return json({ user: result.user }, 201, {
          'Set-Cookie': sessionCookie(req, result.token),
        })
      },
      service,
    )
  try {
    assert.equal(
      (await handler(request(buyer(), 'https://evil.example'))).status,
      403,
    )
    const spoof = await handler(request({ ...buyer(), role: 'admin' }))
    assert.equal(spoof.status, 400)
    const result = await handler(request(buyer()))
    assert.equal(result.status, 201)
    assert.match(
      result.headers.get('set-cookie')!,
      /HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/,
    )
    const body = await result.json()
    assert.deepEqual(Object.keys(body), ['user'])
    assert.ok(!JSON.stringify(body).includes(PASSWORD))
    assert.ok(!JSON.stringify(body).includes('password_hash'))
    const fakeLogin = new Request('https://ostatki.example/api/session', {
      method: 'POST',
      headers: {
        origin: 'https://ostatki.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ persona: 'cafe' }),
    })
    const rejected = await endpoint(
      fakeLogin,
      true,
      async ({ service: current }) => current.login(await readJson(fakeLogin)),
      service,
    )
    assert.equal(rejected.status, 400)
    assert.equal((await rejected.json()).error.code, 'INVALID_INPUT')
    const denied = await endpoint(
      new Request('https://ostatki.example/api/admin/venues'),
      false,
      ({ service: current, user }) => current.listVenueApplications(user),
      service,
    )
    assert.equal(denied.status, 401)
  } finally {
    repository.close()
  }
})

test('persistent auth throttles lock repeated attempts before hashing and recover after their window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-auth-rate-'))
  const path = join(dir, 'test.sqlite')
  let repository: Repository | undefined
  try {
    const first = fixture(path)
    repository = first.repository
    for (let attempt = 0; attempt < 5; attempt++)
      await assert.rejects(
        first.service.login({
          email: 'missing@example.com',
          password: PASSWORD,
        }),
        code('INVALID_CREDENTIALS'),
      )
    repository.close()
    repository = undefined
    const second = fixture(path)
    repository = second.repository
    await assert.rejects(
      second.service.login({
        email: 'MISSING@EXAMPLE.COM',
        password: PASSWORD,
      }),
      code('RATE_LIMITED'),
    )
    second.advance(15 * 60_000)
    await assert.rejects(
      second.service.login({
        email: 'missing@example.com',
        password: PASSWORD,
      }),
      code('INVALID_CREDENTIALS'),
    )
  } finally {
    repository?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('administrator grant requires existing account, never email matching, and revokes prior sessions', async () => {
  const { repository, service } = fixture()
  try {
    assert.throws(
      () =>
        grantAdministrator(
          repository,
          'unregistered@example.com',
          INITIAL_TIME,
        ),
      code('ACCOUNT_NOT_FOUND'),
    )
    const result = await service.register(
      buyer('bootstrap-owner@example.invalid'),
    )
    assert.equal(result.user.role, 'buyer')
    assert.throws(
      () => service.listVenueApplications(result.user),
      code('FORBIDDEN'),
    )
    grantAdministrator(repository, result.user.email!, INITIAL_TIME)
    assert.equal(service.session(result.token), null)
    repository.db
      .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
      .run(INITIAL_TIME, result.user.id)
    const signedIn = await service.login({
      email: result.user.email,
      password: PASSWORD,
    })
    assert.equal(signedIn.user.role, 'admin')
    assert.ok(service.listVenueApplications(signedIn.user).venues.length >= 3)
  } finally {
    repository.close()
  }
})

test('new cafe requires moderation, blocks direct/public offers and ownership stays server-bound', async () => {
  const { repository, service } = fixture()
  try {
    const owner = await verifiedAccount(repository, service, cafe())
    const other = await verifiedAccount(
      repository,
      service,
      cafe('other-cafe@example.com'),
    )
    const admin = await administrator(repository, service)
    const current = service.merchantApplication(owner).application
    assert.equal(current.status, 'pending')
    assert.equal(current.revision, 1)
    assert.equal(current.history[0].action, 'submit')
    assert.equal(service.merchant(owner).venue.status, 'pending')
    assert.throws(
      () => service.createOffer(owner, offerInput(service)),
      code('VENUE_PENDING'),
    )
    assert.throws(
      () => service.getVenueApplication(owner, current.id),
      code('FORBIDDEN'),
    )
    const approved = service.reviewVenue(admin, current.id, {
      action: 'approve',
      expectedRevision: 1,
    }).application
    assert.equal(approved.status, 'approved')
    assert.equal(approved.revision, 2)
    const offer = service.createOffer(owner, offerInput(service)).offer
    assert.ok(service.listOffers().offers.some((item) => item.id === offer.id))
    const serialized = JSON.stringify(service.getOffer(offer.id))
    assert.ok(!serialized.includes(owner.email!))
    assert.ok(!serialized.includes(VENUE.contactPhone))
    assert.throws(
      () => service.patchOffer(other, offer.id, { price: 2000 }),
      code('VENUE_PENDING'),
    )
    assert.notEqual(
      service.merchantApplication(other).application.id,
      current.id,
    )
  } finally {
    repository.close()
  }
})

test('moderation CAS prevents stale/replayed reviews and owner edits require a new reviewed snapshot', async () => {
  const { repository, service } = fixture()
  try {
    const owner = await verifiedAccount(repository, service, cafe())
    const admin = await administrator(repository, service)
    const current = service.merchantApplication(owner).application
    assert.throws(
      () =>
        service.reviewVenue(admin, current.id, {
          action: 'request_changes',
          expectedRevision: 1,
          reasons: { en: 'Only English' },
        }),
      code('INVALID_INPUT'),
    )
    const changes = service.reviewVenue(admin, current.id, {
      action: 'request_changes',
      expectedRevision: 1,
      reasons: REASONS,
    }).application
    assert.equal(changes.status, 'changes_requested')
    assert.deepEqual(changes.reasons, REASONS)
    assert.equal(changes.reviewedBy, admin.name)
    assert.throws(
      () =>
        service.reviewVenue(admin, current.id, {
          action: 'approve',
          expectedRevision: 1,
        }),
      code('MODERATION_CONFLICT'),
    )
    const corrected = service.updateMerchantApplication(owner, {
      ...VENUE,
      address: 'Abay 44, side entrance',
      expectedRevision: changes.revision,
    }).application
    assert.equal(corrected.status, 'pending')
    assert.equal(corrected.reasons, null)
    assert.equal(corrected.history.length, 3)
    assert.equal(corrected.history[0].snapshot.address, VENUE.address)
    assert.equal(corrected.history[2].snapshot.address, corrected.address)
    assert.throws(
      () =>
        service.updateMerchantApplication(owner, {
          ...VENUE,
          expectedRevision: changes.revision,
        }),
      code('MODERATION_CONFLICT'),
    )
    const approved = service.reviewVenue(admin, current.id, {
      action: 'approve',
      expectedRevision: corrected.revision,
    }).application
    assert.equal(approved.status, 'approved')
    const pendingAgain = service.updateMerchantApplication(owner, {
      ...VENUE,
      name: 'New Bakery Name',
      expectedRevision: approved.revision,
    }).application
    assert.equal(pendingAgain.status, 'pending')
    assert.throws(
      () =>
        service.reviewVenue(admin, current.id, {
          action: 'approve',
          expectedRevision: approved.revision,
        }),
      code('MODERATION_CONFLICT'),
    )
    assert.throws(
      () => service.createOffer(owner, offerInput(service)),
      code('VENUE_PENDING'),
    )
  } finally {
    repository.close()
  }
})

test('suspension hides new sales and blocks unconfirmed holds while preserving confirmed fulfilment', async () => {
  const { repository, service } = fixture()
  try {
    const owner = await verifiedAccount(repository, service, cafe())
    const customer = await verifiedAccount(repository, service, buyer())
    const admin = await administrator(repository, service)
    const application = service.merchantApplication(owner).application
    const approved = service.reviewVenue(admin, application.id, {
      action: 'approve',
      expectedRevision: application.revision,
    }).application
    const offer = service.createOffer(owner, offerInput(service)).offer
    const reserved = service.reserve(customer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'customer-reserved-1',
    }).order
    const second = service.reserve(customer, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'customer-reserved-2',
    }).order
    const confirmed = service.confirm(customer, reserved.id, {
      idempotencyKey: 'customer-confirmed-1',
    }).order
    service.reviewVenue(admin, application.id, {
      action: 'suspend',
      expectedRevision: approved.revision,
      reasons: REASONS,
    })
    assert.equal(service.merchant(owner).venue.status, 'suspended')
    assert.ok(!service.listOffers().offers.some((item) => item.id === offer.id))
    assert.throws(() => service.getOffer(offer.id), code('OFFER_NOT_FOUND'))
    assert.throws(
      () =>
        service.reserve(customer, {
          offerId: offer.id,
          quantity: 1,
          idempotencyKey: 'customer-reserved-3',
        }),
      code('OFFER_UNAVAILABLE'),
    )
    assert.throws(
      () =>
        service.confirm(customer, second.id, {
          idempotencyKey: 'customer-confirmed-2',
        }),
      code('VENUE_PENDING'),
    )
    assert.throws(
      () => service.patchOffer(owner, offer.id, { status: 'published' }),
      code('VENUE_PENDING'),
    )
    assert.equal(
      service.lookupPickup(owner, confirmed.pickupCode).order.id,
      confirmed.id,
    )
    assert.equal(
      service.collect(owner, {
        code: confirmed.pickupCode,
        idempotencyKey: 'fulfil-confirmed-1',
      }).order.status,
      'collected',
    )
    assert.equal(
      service.getOrder(customer, confirmed.id).order.snapshot.venueName,
      VENUE.name,
    )
  } finally {
    repository.close()
  }
})

test('registration, roles and moderation history survive reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-auth-persistence-'))
  const path = join(dir, 'test.sqlite')
  let repository: Repository | undefined
  try {
    const first = fixture(path)
    repository = first.repository
    const owner = await verifiedAccount(repository, first.service, cafe())
    const admin = await administrator(repository, first.service)
    first.service.reviewVenue(admin, owner.venueId!, {
      action: 'reject',
      expectedRevision: 1,
      reasons: REASONS,
    })
    repository.close()
    repository = undefined
    const second = fixture(path)
    repository = second.repository
    const auth = await second.service.login({
      email: owner.email,
      password: PASSWORD,
    })
    const persisted = second.service.merchantApplication(auth.user).application
    assert.equal(persisted.status, 'rejected')
    assert.equal(persisted.history.length, 2)
    assert.deepEqual(persisted.reasons, REASONS)
    assert.equal(repository.user(admin.id)?.role, 'admin')
  } finally {
    repository?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
