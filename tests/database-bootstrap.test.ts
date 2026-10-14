import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureSeedingEnabled } from '../src/server/database-bootstrap.ts'
import { Repository } from '../src/server/repository.ts'
import { SEED_USERS, SEED_VENUES, seedOffers } from '../src/server/seed.ts'

const NOW = Date.parse('2026-10-13T12:00:00Z')

test('only known development and test startup modes enable fixtures by default', () => {
  for (const mode of ['development', 'test'])
    assert.equal(fixtureSeedingEnabled(mode), true)
  for (const mode of [undefined, '', 'production', 'Production', 'staging'])
    assert.equal(fixtureSeedingEnabled(mode), false)
})

test('production and an unconfigured standalone process create an empty complete database without persona or gallery fallbacks', () => {
  const repositoryModule = new URL(
    '../src/server/repository.ts',
    import.meta.url,
  )
  const source = `
    import { Repository } from ${JSON.stringify(repositoryModule.href)};
    const repository = new Repository(':memory:', ${NOW});
    try {
      const tables = repository.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      const counts = Object.fromEntries(tables.map(({name}) => [name, repository.db.prepare('SELECT COUNT(*) AS count FROM "' + name + '"').get().count]));
      console.log(JSON.stringify({seedFixtures:repository.seedFixtures,counts,photos:repository.profilePhotos('goa-food')}));
    } finally { repository.close(); }
  `
  for (const mode of ['production', 'unset'] as const) {
    const childEnvironment: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
    // Next types require NODE_ENV; explicitly remove it to test a standalone Node process.
    if (mode === 'unset') Reflect.deleteProperty(childEnvironment, 'NODE_ENV')
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        env: childEnvironment,
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, result.stderr)
    const data = JSON.parse(result.stdout)
    assert.equal(data.seedFixtures, false)
    for (const table of [
      'users',
      'venues',
      'offers',
      'credentials',
      'auth_state',
      'admin_grants',
      'sessions',
      'pickup_shifts',
      'venue_profiles',
      'venue_moderation',
      'orders',
      'notifications',
      'email_outbox',
      'support_cases',
      'photo_assets',
    ])
      assert.equal(data.counts[table], 0, table)
    assert.deepEqual(data.photos, [])
  }
})

test('a clean persistent database reopens without fixtures while preserving account grants and legacy backfills', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ostatki-bootstrap-'))
  const path = join(directory, 'isolated.sqlite')
  let repository: Repository | undefined
  try {
    repository = new Repository(path, NOW, { seedFixtures: false })
    repository.transaction(() => {
      repository!.db
        .prepare('INSERT INTO venues VALUES (?,?,?,?,?)')
        .run(
          'real-test-venue',
          'Independent QA café',
          'Synthetic business address',
          'approved',
          'Asia/Almaty',
        )
      repository!.db
        .prepare('INSERT INTO users VALUES (?,?,?,?)')
        .run('real-test-owner', 'QA owner', 'cafe', 'real-test-venue')
      repository!.db
        .prepare('INSERT INTO credentials VALUES (?,?,?,?,?)')
        .run(
          'real-test-owner',
          'bootstrap-owner@example.invalid',
          'unused-test-hash',
          'en',
          new Date(NOW).toISOString(),
        )
      repository!.db
        .prepare('INSERT INTO admin_grants VALUES (?,?)')
        .run('real-test-owner', new Date(NOW).toISOString())
    })
    repository.close()
    repository = new Repository(path, NOW + 86_400_000, { seedFixtures: false })
    assert.equal(repository.user('real-test-owner')?.role, 'admin')
    assert.equal(repository.user('real-test-owner')?.emailVerified, false)
    assert.equal(repository.venue('real-test-venue')?.status, 'approved')
    for (const table of [
      'users',
      'venues',
      'credentials',
      'auth_state',
      'admin_grants',
      'venue_moderation',
    ])
      assert.equal(
        repository.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
          ?.count,
        1,
      )
    for (const table of [
      'offers',
      'venue_profiles',
      'pickup_shifts',
      'orders',
      'notifications',
      'email_outbox',
    ])
      assert.equal(
        repository.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
          ?.count,
        0,
      )
    assert.deepEqual(
      repository.db.prepare('PRAGMA foreign_key_check').all(),
      [],
    )
    repository.close()
    repository = undefined
  } finally {
    repository?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('explicit fixture opt-in preserves development personas, offers and galleries without duplicating them on reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ostatki-bootstrap-fixtures-'))
  const path = join(directory, 'isolated.sqlite')
  let repository: Repository | undefined
  try {
    repository = new Repository(path, NOW, { seedFixtures: true })
    assert.equal(
      repository.user(SEED_USERS.buyer.id)?.name,
      SEED_USERS.buyer.name,
    )
    assert.equal(repository.profilePhotos('goa-food').length, 2)
    repository.close()
    repository = new Repository(path, NOW + 86_400_000, { seedFixtures: true })
    assert.equal(
      repository.db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count,
      Object.keys(SEED_USERS).length,
    )
    assert.equal(
      repository.db.prepare('SELECT COUNT(*) AS count FROM venues').get()
        ?.count,
      SEED_VENUES.length,
    )
    assert.equal(
      repository.db.prepare('SELECT COUNT(*) AS count FROM offers').get()
        ?.count,
      seedOffers(NOW).length,
    )
    repository.close()
    repository = new Repository(path, NOW + 172_800_000, {
      seedFixtures: false,
    })
    // Changing startup policy never purges existing data.
    assert.equal(
      repository.db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count,
      Object.keys(SEED_USERS).length,
    )
    assert.deepEqual(repository.profilePhotos('goa-food'), [])
    repository.close()
    repository = undefined
  } finally {
    repository?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
