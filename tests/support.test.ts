import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import type {
  SupportCase,
  SupportKind,
  User,
} from '../src/shared/api/contracts.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import { GET as queueGET } from '../src/app/api/admin/support/route.ts'
import { GET as detailGET } from '../src/app/api/admin/support/[id]/route.ts'
import { POST as actionPOST } from '../src/app/api/admin/support/[id]/actions/route.ts'
import { POST as messagePOST } from '../src/app/api/admin/support/[id]/messages/route.ts'
import { POST as escalationPOST } from '../src/app/api/orders/[id]/issue/support/route.ts'

const NOW = Date.parse('2026-10-12T12:00:00Z')
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected
const resolution = {
  code: 'information_provided',
  texts: {
    ru: 'Порядок получения разъяснён.',
    kk: 'Алып кету тәртібі түсіндірілді.',
    en: 'The collection process has been explained.',
  },
}
function fixture(path = ':memory:') {
  const repository = new Repository(path, NOW, { seedFixtures: true })
  for (const [id, name, admin] of [
    ['support-admin-1', 'Support Admin One', true],
    ['support-admin-2', 'Support Admin Two', true],
    [SEED_USERS.buyer.id, 'Алина', false],
    [SEED_USERS['buyer-other'].id, 'Other buyer', false],
    [SEED_USERS.cafe.id, 'Ерлан', false],
    [SEED_USERS['cafe-other'].id, 'Other café', false],
  ] as const) {
    repository.db
      .prepare("INSERT OR IGNORE INTO users VALUES (?,?,'buyer',NULL)")
      .run(id, name)
    repository.db
      .prepare('INSERT OR IGNORE INTO credentials VALUES (?,?,?,?,?)')
      .run(
        id,
        `${id}@example.invalid`,
        'unused-support-fixture',
        'en',
        new Date(NOW).toISOString(),
      )
    repository.db
      .prepare('INSERT OR IGNORE INTO auth_state VALUES (?,?,1)')
      .run(id, NOW)
    if (admin)
      repository.db
        .prepare('INSERT OR IGNORE INTO admin_grants VALUES (?,?)')
        .run(id, new Date(NOW).toISOString())
  }
  repository.db
    .prepare(
      "UPDATE offers SET pickup_start=?,pickup_end=? WHERE id='goa-surprise'",
    )
    .run(
      new Date(NOW + 30 * 60000).toISOString(),
      new Date(NOW + 60 * 60000).toISOString(),
    )
  const service = new MarketplaceService(repository, () => NOW)
  return {
    repository,
    service,
    get buyer() {
      return repository.user(SEED_USERS.buyer.id)!
    },
    get cafe() {
      return repository.user(SEED_USERS.cafe.id)!
    },
    get other() {
      return repository.user(SEED_USERS['buyer-other'].id)!
    },
    get foreignCafe() {
      return repository.user(SEED_USERS['cafe-other'].id)!
    },
    get pickup() {
      return repository.user(SEED_USERS.pickup.id)!
    },
    get admin() {
      return repository.user('support-admin-1')!
    },
    get secondAdmin() {
      return repository.user('support-admin-2')!
    },
  }
}
type Fixture = ReturnType<typeof fixture>
function booking(f: Fixture) {
  const order = f.service.reserve(f.buyer, {
    offerId: 'goa-surprise',
    quantity: 1,
    idempotencyKey: randomUUID(),
  }).order
  return f.service.confirm(f.buyer, order.id, { idempotencyKey: randomUUID() })
    .order
}
function escalation(kind: SupportKind = 'help', key = randomUUID()) {
  return {
    kind,
    category: 'pickup_problem',
    message: 'Please ask support to help with collection.',
    idempotencyKey: key,
  }
}
function open(f: Fixture, kind: SupportKind = 'help', actor = f.buyer) {
  const order = booking(f)
  const issue = f.service.escalateOrderIssueSupport(
    actor,
    order.id,
    escalation(kind),
  ).issue!
  return { order, issue, current: () => f.repository.supportCase(issue.id)! }
}
function action(
  f: Fixture,
  current: SupportCase,
  command: string,
  actor = f.admin,
  extra: object = {},
) {
  return f.service.adminSupportAction(actor, current.id, {
    action: command,
    revision: current.revision,
    idempotencyKey: randomUUID(),
    ...extra,
  }).issue.support!
}

test('participants escalate only their own real bookings, including café-created issues, while fresh verified admins alone can read support', () => {
  const f = fixture()
  try {
    const { order, issue, current } = open(f, 'complaint', f.cafe)
    assert.equal(issue.messages[0].authorRole, 'cafe')
    assert.equal(current().reporterRole, 'cafe')
    assert.equal(current().status, 'new')
    assert.equal(
      f.service.getOrderIssue(f.buyer, order.id).issue?.support?.id,
      current().id,
    )
    for (const user of [f.other, f.foreignCafe])
      assert.throws(
        () => f.service.escalateOrderIssueSupport(user, order.id, escalation()),
        code('ORDER_NOT_FOUND'),
      )
    assert.throws(
      () =>
        f.service.escalateOrderIssueSupport(f.pickup, order.id, escalation()),
      code('FORBIDDEN'),
    )
    assert.throws(
      () => f.service.adminSupportDetail(f.buyer, current().id),
      code('FORBIDDEN'),
    )
    assert.throws(
      () => f.service.getOrderIssue(f.admin, order.id),
      code('FORBIDDEN'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id=?')
      .run(f.admin.id)
    assert.throws(
      () =>
        f.service.adminSupportQueue({ ...f.admin, emailVerified: true }, {}),
      code('EMAIL_NOT_VERIFIED'),
    )
    f.repository.db
      .prepare('DELETE FROM admin_grants WHERE user_id=?')
      .run(f.secondAdmin.id)
    assert.throws(
      () =>
        f.service.adminSupportDetail(
          { ...f.secondAdmin, role: 'admin' },
          current().id,
        ),
      code('FORBIDDEN'),
    )
    const unverifiedBooking = booking(f)
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id IN (?,?)')
      .run(f.buyer.id, f.cafe.id)
    assert.equal(
      f.service.getOrderIssue(f.cafe, order.id).issue?.support?.id,
      current().id,
    )
    assert.ok(
      f.service.escalateOrderIssueSupport(
        f.buyer,
        unverifiedBooking.id,
        escalation(),
      ).issue?.support,
    )
    assert.throws(
      () =>
        f.service.reserve(
          { ...f.buyer, emailVerified: true },
          {
            offerId: 'goa-surprise',
            quantity: 1,
            idempotencyKey: randomUUID(),
          },
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
  } finally {
    f.repository.close()
  }
})

test('holds and cancelled temporary holds cannot escalate; runtime detail omits pickup codes and automatic contacts everywhere', () => {
  const f = fixture()
  try {
    const hold = f.service.reserve(f.buyer, {
      offerId: 'goa-surprise',
      quantity: 1,
      idempotencyKey: randomUUID(),
    }).order
    assert.throws(
      () => f.service.escalateOrderIssueSupport(f.buyer, hold.id, escalation()),
      code('ORDER_STATE_CONFLICT'),
    )
    f.service.cancel(f.buyer, hold.id)
    assert.throws(
      () => f.service.escalateOrderIssueSupport(f.buyer, hold.id, escalation()),
      code('ORDER_STATE_CONFLICT'),
    )
    const { order, current } = open(f)
    const result = f.service.adminSupportDetail(f.admin, current().id),
      serialized = JSON.stringify(result)
    assert.ok(!('pickupCode' in result.order))
    for (const forbidden of [
      'pickupCode',
      order.pickupCode!,
      f.buyer.email!,
      f.cafe.email!,
      'contactPhone',
      'author_id',
    ])
      assert.ok(!serialized.includes(forbidden))
    assert.throws(
      () => f.service.adminSupportDetail(f.admin, randomUUID()),
      code('SUPPORT_NOT_FOUND'),
    )
  } finally {
    f.repository.close()
  }
})

test('escalation and admin actions bind original payloads and replay before changed status/revision while preserving fresh privileges', () => {
  const f = fixture()
  try {
    const order = booking(f),
      input = escalation('help')
    const first = f.service.escalateOrderIssueSupport(
      f.buyer,
      order.id,
      input,
    ).issue!
    f.service.escalateOrderIssueSupport(f.buyer, order.id, input)
    assert.equal(f.repository.supportCase(first.id)?.history.length, 1)
    assert.throws(
      () =>
        f.service.escalateOrderIssueSupport(f.buyer, order.id, {
          ...input,
          message: 'Changed request body for original key.',
        }),
      code('IDEMPOTENCY_CONFLICT'),
    )
    assert.throws(
      () =>
        f.service.escalateOrderIssueSupport(f.buyer, order.id, escalation()),
      code('SUPPORT_ALREADY_ACTIVE'),
    )
    const claim = {
      action: 'claim',
      revision: first.support!.revision,
      idempotencyKey: randomUUID(),
    }
    const claimed = f.service.adminSupportAction(
      f.admin,
      first.support!.id,
      claim,
    ).issue!.support!
    action(f, claimed, 'release')
    const again = f.service.adminSupportAction(f.admin, claimed.id, claim).issue
      .support!
    assert.equal(again.status, 'new')
    assert.equal(again.history.filter((e) => e.action === 'claimed').length, 1)
    assert.throws(
      () =>
        f.service.adminSupportAction(f.admin, claimed.id, {
          ...claim,
          action: 'wait',
        }),
      code('IDEMPOTENCY_CONFLICT'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id=?')
      .run(f.admin.id)
    assert.throws(
      () =>
        f.service.adminSupportAction(
          { ...f.admin, emailVerified: true },
          claimed.id,
          claim,
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
  } finally {
    f.repository.close()
  }
})

test('two admins cannot steal active assignment; unavailable assignees can be reclaimed with immutable public explanation', () => {
  const f = fixture()
  try {
    const { current } = open(f),
      initial = current(),
      claimed = action(f, initial, 'claim')
    assert.throws(
      () =>
        f.service.adminSupportAction(f.secondAdmin, claimed.id, {
          action: 'claim',
          revision: initial.revision,
          idempotencyKey: randomUUID(),
        }),
      code('SUPPORT_REVISION_CONFLICT'),
    )
    assert.throws(
      () => action(f, claimed, 'claim', f.secondAdmin),
      code('SUPPORT_ASSIGNMENT_CONFLICT'),
    )
    assert.throws(
      () =>
        f.service.adminSupportMessage(f.secondAdmin, claimed.id, {
          message: 'Attempted reply by another administrator.',
          revision: claimed.revision,
          idempotencyKey: randomUUID(),
        }),
      code('SUPPORT_ASSIGNMENT_CONFLICT'),
    )
    f.repository.db
      .prepare('DELETE FROM admin_grants WHERE user_id=?')
      .run(f.admin.id)
    assert.equal(current().assignee?.available, false)
    const recovered = action(f, current(), 'claim', f.secondAdmin)
    assert.equal(recovered.assignee?.id, f.secondAdmin.id)
    assert.equal(recovered.assignee?.available, true)
    assert.equal(recovered.history.at(-1)?.reason, 'assignee_unavailable')
    assert.equal(recovered.history[1].assigneeName, 'Support Admin One')
    const released = action(f, recovered, 'release', f.secondAdmin)
    assert.equal(released.status, 'new')
    assert.equal(released.assignee, null)
  } finally {
    f.repository.close()
  }
})

test('reply/wait/resume and participant messages change case revisions; active support blocks buyer resolve and decisions reopen without erasing history', () => {
  const f = fixture()
  try {
    const { order, current } = open(f)
    let c = action(f, current(), 'claim')
    c = action(f, c, 'wait')
    assert.equal(c.status, 'waiting')
    c = action(f, c, 'resume')
    assert.equal(c.status, 'in_review')
    const reply = {
      message: 'Support can help you use the side entrance.',
      revision: c.revision,
      idempotencyKey: randomUUID(),
    }
    const answered = f.service.adminSupportMessage(f.admin, c.id, reply).issue
    assert.equal(answered.messages.at(-1)?.authorRole, 'admin')
    assert.equal(answered.status, 'answered')
    assert.equal(answered.support?.status, 'waiting')
    f.service.adminSupportMessage(f.admin, c.id, reply)
    assert.equal(f.repository.orderIssue(order.id)?.messages.length, 2)
    assert.throws(
      () =>
        f.service.resolveOrderIssue(f.buyer, order.id, {
          revision: answered.revision,
        }),
      code('SUPPORT_ACTIVE'),
    )
    f.service.addOrderIssueMessage(f.cafe, order.id, {
      message: 'Our café can now use the other entrance.',
      idempotencyKey: randomUUID(),
    })
    assert.equal(current().status, 'in_review')
    assert.throws(
      () => action(f, answered.support!, 'wait'),
      code('SUPPORT_REVISION_CONFLICT'),
    )
    c = action(f, current(), 'resolve', f.admin, { resolution })
    assert.equal(c.status, 'resolved')
    assert.equal(f.repository.orderIssue(order.id)?.status, 'resolved')
    const decision = c.history.at(-1)!.resolution
    f.service.addOrderIssueMessage(f.buyer, order.id, {
      message: 'The original problem still needs assistance.',
      idempotencyKey: randomUUID(),
    })
    assert.equal(current().status, 'new')
    assert.equal(current().assignee, null)
    assert.equal(current().resolution, null)
    assert.deepEqual(
      current().history.find((e) => e.action === 'resolved')?.resolution,
      decision,
    )
    assert.equal(f.repository.order(order.id)?.status, 'confirmed')
    assert.equal(f.repository.offer(order.offerId)?.available, 7)
  } finally {
    f.repository.close()
  }
})

test('resolutions require all locales and kind-appropriate codes; explicit party/admin reopen retains original category/kind and past decisions', () => {
  const f = fixture()
  try {
    const { order, current } = open(f)
    let c = action(f, current(), 'claim')
    assert.throws(
      () =>
        f.service.adminSupportAction(f.admin, c.id, {
          action: ['resolve'],
          revision: c.revision,
          idempotencyKey: randomUUID(),
          resolution,
        }),
      code('INVALID_INPUT'),
    )
    assert.throws(
      () =>
        f.service.escalateOrderIssueSupport(f.buyer, booking(f).id, {
          ...escalation(),
          category: ['pickup_problem'],
        }),
      code('INVALID_INPUT'),
    )
    for (const decision of [
      {
        code: 'information_provided',
        texts: { ru: 'Valid Russian', en: 'Valid English' },
      },
      { code: ['information_provided'], texts: resolution.texts },
      { code: 'complaint_upheld', texts: resolution.texts },
      {
        code: 'information_provided',
        texts: { ...resolution.texts, kk: '   ' },
      },
    ])
      assert.throws(
        () => action(f, c, 'resolve', f.admin, { resolution: decision }),
        code('INVALID_INPUT'),
      )
    c = action(f, c, 'resolve', f.admin, { resolution })
    assert.throws(
      () =>
        f.service.addOrderIssueMessage(f.cafe, order.id, {
          message: 'Café reply after this case was resolved.',
          idempotencyKey: randomUUID(),
        }),
      code('ISSUE_STATE_CONFLICT'),
    )
    assert.throws(
      () =>
        f.service.escalateOrderIssueSupport(
          f.cafe,
          order.id,
          escalation('complaint'),
        ),
      code('SUPPORT_STATE_CONFLICT'),
    )
    const reopened = f.service.escalateOrderIssueSupport(
      f.cafe,
      order.id,
      escalation(),
    ).issue!.support!
    assert.equal(reopened.status, 'new')
    assert.equal(reopened.kind, 'help')
    assert.equal(
      reopened.history.filter((e) => e.action === 'resolved').length,
      1,
    )
    let assigned = action(f, reopened, 'claim')
    assigned = action(f, assigned, 'resolve', f.admin, { resolution })
    const adminReopen = action(f, assigned, 'reopen', f.secondAdmin)
    assert.equal(adminReopen.status, 'in_review')
    assert.equal(adminReopen.assignee?.id, f.secondAdmin.id)
    assert.equal(adminReopen.resolution, null)
    const complaint = open(f, 'complaint')
    const complaintClaim = action(f, complaint.current(), 'claim')
    assert.equal(
      action(f, complaintClaim, 'resolve', f.admin, {
        resolution: { ...resolution, code: 'complaint_upheld' },
      }).resolution?.code,
      'complaint_upheld',
    )
  } finally {
    f.repository.close()
  }
})

test('escalation at the 50-message cap keeps context in public history, admin replies stay capped, but a decision is still possible', () => {
  const f = fixture()
  try {
    const order = booking(f)
    f.service.openOrderIssue(f.buyer, order.id, {
      category: 'pickup_problem',
      message: 'Original initial conversation message.',
      idempotencyKey: randomUUID(),
    })
    for (let i = 1; i < 50; i++)
      f.service.addOrderIssueMessage(f.buyer, order.id, {
        message: `Follow-up message number ${i}.`,
        idempotencyKey: randomUUID(),
      })
    const input = escalation(),
      issue = f.service.escalateOrderIssueSupport(
        f.buyer,
        order.id,
        input,
      ).issue!
    assert.equal(issue.messages.length, 50)
    assert.equal(issue.support?.history.at(-1)?.note, input.message)
    const c = action(f, issue.support!, 'claim')
    assert.throws(
      () =>
        f.service.adminSupportMessage(f.admin, c.id, {
          message: 'A response after the message limit.',
          revision: c.revision,
          idempotencyKey: randomUUID(),
        }),
      code('ISSUE_MESSAGE_LIMIT'),
    )
    assert.equal(
      action(f, c, 'resolve', f.admin, { resolution }).status,
      'resolved',
    )
  } finally {
    f.repository.close()
  }
})

test('partial history failures roll back case/issue revisions, messages, decisions and idempotency without changing orders or mail', () => {
  const f = fixture()
  try {
    const { order, current } = open(f)
    const c = action(f, current(), 'claim'),
      before = f.repository.orderIssue(order.id)!
    const jobs = f.repository.db
      .prepare('SELECT COUNT(*) AS count FROM email_outbox')
      .get()?.count
    f.repository.db.exec(
      "CREATE TRIGGER fail_support_history BEFORE INSERT ON support_events BEGIN SELECT RAISE(ABORT,'fixture history failure'); END",
    )
    const reply = {
      message: 'The reply must roll back completely.',
      revision: c.revision,
      idempotencyKey: randomUUID(),
    }
    assert.throws(() => f.service.adminSupportMessage(f.admin, c.id, reply))
    assert.deepEqual(f.repository.orderIssue(order.id), before)
    assert.equal(
      f.repository.idempotent(f.admin.id, reply.idempotencyKey),
      null,
    )
    assert.throws(() => action(f, c, 'resolve', f.admin, { resolution }))
    assert.deepEqual(f.repository.orderIssue(order.id), before)
    f.repository.db.exec('DROP TRIGGER fail_support_history')
    f.service.adminSupportMessage(f.admin, c.id, reply)
    assert.equal(f.repository.order(order.id)?.status, 'confirmed')
    assert.equal(
      f.repository.db
        .prepare('SELECT COUNT(*) AS count FROM email_outbox')
        .get()?.count,
      jobs,
    )
  } finally {
    f.repository.close()
  }
})

test('queue keyset pagination/counts/filter assignment and literal Unicode search remain bounded and admin-bound', () => {
  const f = fixture()
  try {
    const first = open(f),
      second = open(f, 'complaint'),
      third = open(f)
    action(f, first.current(), 'claim')
    action(f, second.current(), 'claim', f.secondAdmin)
    assert.deepEqual(f.service.adminSupportQueue(f.admin, {}).counts, {
      new: 1,
      in_review: 2,
      waiting: 0,
      resolved: 0,
    })
    assert.equal(
      f.service.adminSupportQueue(f.admin, { assignment: 'mine' }).cases[0].id,
      first.current().id,
    )
    assert.equal(
      f.service.adminSupportQueue(f.admin, { assignment: 'unassigned' })
        .cases[0].id,
      third.current().id,
    )
    assert.equal(
      f.service.adminSupportQueue(f.admin, { kind: 'complaint' }).cases.length,
      1,
    )
    assert.equal(
      f.service.adminSupportQueue(f.admin, { status: 'resolved' }).cases.length,
      0,
    )
    assert.equal(
      f.service.adminSupportQueue(f.admin, { search: 'аЛиНа' }).cases.length,
      3,
    )
    for (const search of ['%', "' OR 1=1 --", '_'])
      assert.equal(
        f.service.adminSupportQueue(f.admin, { search }).cases.length,
        0,
      )
    const page = f.service.adminSupportQueue(f.admin, { limit: '1' })
    assert.ok(page.nextCursor)
    const next = f.service.adminSupportQueue(f.admin, {
      limit: '1',
      cursor: page.nextCursor!,
    })
    assert.notEqual(next.cases[0].id, page.cases[0].id)
    assert.throws(
      () =>
        f.service.adminSupportQueue(f.secondAdmin, {
          limit: '1',
          cursor: page.nextCursor!,
        }),
      code('INVALID_INPUT'),
    )
    assert.throws(
      () =>
        f.service.adminSupportQueue(f.admin, {
          kind: 'help',
          cursor: page.nextCursor!,
        }),
      code('INVALID_INPUT'),
    )
    for (const value of [
      { limit: '51' },
      { search: 'x'.repeat(101) },
      { status: 'bogus' },
      { assignment: 'other' },
      { cursor: '..' },
      { ownerId: f.buyer.id },
    ])
      assert.throws(
        () => f.service.adminSupportQueue(f.admin, value),
        code('INVALID_INPUT'),
      )
  } finally {
    f.repository.close()
  }
})

function oldMessageCheck(path: string) {
  const raw = new DatabaseSync(path)
  try {
    raw.exec(
      `PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE; CREATE TABLE old_messages(id TEXT PRIMARY KEY,issue_id TEXT NOT NULL REFERENCES order_issues(id),author_id TEXT NOT NULL REFERENCES users(id),author_role TEXT NOT NULL CHECK(author_role IN ('buyer','cafe')),author_name TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL); INSERT INTO old_messages SELECT * FROM order_issue_messages ORDER BY rowid; DROP TABLE order_issue_messages; ALTER TABLE old_messages RENAME TO order_issue_messages; CREATE INDEX order_issue_messages_issue ON order_issue_messages(issue_id,created_at,id); COMMIT; PRAGMA foreign_keys=ON;`,
    )
  } finally {
    raw.close()
  }
}
test('legacy message CHECK upgrade preserves support history, orders/FKs/indexes and reopened conversations; bad child FK rolls the upgrade back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-support-migration-')),
    path = join(dir, 'isolated.sqlite')
  let repo: Repository | undefined, raw: DatabaseSync | undefined
  try {
    const f = fixture(path)
    repo = f.repository
    const { order, current } = open(f),
      caseId = current().id,
      buyer = f.buyer,
      admin = f.admin
    action(f, current(), 'claim')
    const rows = repo.db.prepare('SELECT * FROM order_issue_messages').all(),
      originalOrder = repo.order(order.id)
    repo.close()
    repo = undefined
    oldMessageCheck(path)
    repo = new Repository(path, NOW, { seedFixtures: true })
    assert.deepEqual(
      repo.db.prepare('SELECT * FROM order_issue_messages').all(),
      rows,
    )
    assert.deepEqual(repo.order(order.id), originalOrder)
    assert.deepEqual(repo.db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(repo.db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    const service = new MarketplaceService(repo, () => NOW),
      detail = service.adminSupportDetail(admin, caseId)
    service.adminSupportMessage(admin, caseId, {
      message: 'Administrator message after a safe schema upgrade.',
      revision: detail.issue.support!.revision,
      idempotencyKey: randomUUID(),
    })
    assert.equal(
      service.getOrderIssue(buyer, order.id).issue?.messages.at(-1)?.authorRole,
      'admin',
    )
    repo.close()
    repo = undefined
    const bad = join(dir, 'bad.sqlite'),
      g = fixture(bad)
    g.service.openOrderIssue(g.buyer, booking(g).id, {
      category: 'other',
      message: 'Legacy original message is preserved.',
      idempotencyKey: randomUUID(),
    })
    g.repository.close()
    oldMessageCheck(bad)
    raw = new DatabaseSync(bad)
    raw.exec('PRAGMA foreign_keys=OFF')
    raw
      .prepare(
        "UPDATE order_issue_messages SET author_id='missing-fixture-user'",
      )
      .run()
    const before = raw
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name='order_issue_messages'",
      )
      .get()?.sql
    raw.close()
    raw = undefined
    assert.throws(
      () => new Repository(bad, NOW, { seedFixtures: true }),
      /foreign-key check/,
    )
    raw = new DatabaseSync(bad)
    assert.equal(
      raw
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name='order_issue_messages'",
        )
        .get()?.sql,
      before,
    )
  } finally {
    repo?.close()
    raw?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

function session(f: Fixture, user: User) {
  const token = randomBytes(32).toString('base64url')
  f.repository.db
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run(
      createHash('sha256').update(token).digest('hex'),
      user.id,
      NOW + 86400000,
    )
  return token
}
test('actual support routes protect Origin, private headers, strict query keys, 32KiB Unicode decisions and revoked sessions during body upload', async () => {
  const f = fixture(),
    runtime = globalThis as typeof globalThis & {
      ostatkiService?: MarketplaceService
    },
    previous = runtime.ostatkiService
  runtime.ostatkiService = f.service
  try {
    const { order, current } = open(f)
    let c = action(f, current(), 'claim')
    const token = session(f, f.admin),
      headers = {
        origin: 'https://food.example',
        'content-type': 'application/json',
        cookie: `ostatki_session=${token}`,
      },
      context = { params: Promise.resolve({ id: c.id }) }
    assert.equal(
      (await queueGET(new Request('https://food.example/api/admin/support')))
        .status,
      401,
    )
    for (const query of ['?status=new&status=resolved', '?userId=anything'])
      assert.equal(
        (
          await queueGET(
            new Request(`https://food.example/api/admin/support${query}`, {
              headers,
            }),
          )
        ).status,
        400,
      )
    const detail = await detailGET(
      new Request(`https://food.example/api/admin/support/${c.id}`, {
        headers,
      }),
      context,
    )
    assert.equal(detail.status, 200)
    assert.equal(detail.headers.get('cache-control'), 'no-store')
    assert.ok(!JSON.stringify(await detail.json()).includes('pickupCode'))
    const body = {
      action: 'resolve',
      revision: c.revision,
      idempotencyKey: randomUUID(),
      resolution: {
        code: 'information_provided',
        texts: {
          ru: '界'.repeat(2000),
          kk: '界'.repeat(2000),
          en: '界'.repeat(2000),
        },
      },
    }
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 16384)
    assert.equal(
      (
        await actionPOST(
          new Request(
            `https://food.example/api/admin/support/${c.id}/actions`,
            {
              method: 'POST',
              headers: { ...headers, origin: 'https://evil.example' },
              body: JSON.stringify(body),
            },
          ),
          context,
        )
      ).status,
      403,
    )
    const decision = await actionPOST(
      new Request(`https://food.example/api/admin/support/${c.id}/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      context,
    )
    assert.equal(decision.status, 200)
    c = (await decision.json()).issue.support
    action(f, c, 'reopen')
    c = current()
    for (const item of [
      {
        handler: actionPOST,
        id: c.id,
        actor: f.admin,
        input: {
          action: 'wait',
          revision: c.revision,
          idempotencyKey: randomUUID(),
        },
      },
      {
        handler: messagePOST,
        id: c.id,
        actor: f.admin,
        input: {
          message: 'The delayed support response body.',
          revision: c.revision,
          idempotencyKey: randomUUID(),
        },
      },
      {
        handler: escalationPOST,
        id: order.id,
        actor: f.buyer,
        input: escalation(),
      },
    ]) {
      const ownToken = session(f, item.actor)
      let release!: () => void, started!: () => void
      const paused = new Promise<void>((resolve) => {
          release = resolve
        }),
        reading = new Promise<void>((resolve) => {
          started = resolve
        })
      const stream = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            started()
            await paused
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(item.input)),
            )
            controller.close()
          },
        },
        { highWaterMark: 0 },
      )
      const pending = item.handler(
        new Request('https://food.example/api/support', {
          method: 'POST',
          headers: { ...headers, cookie: `ostatki_session=${ownToken}` },
          body: stream,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        { params: Promise.resolve({ id: item.id }) },
      )
      await reading
      f.service.deleteSession(ownToken)
      const before = f.repository.db
        .prepare('SELECT total_changes() AS count')
        .get()?.count
      release()
      assert.equal((await pending).status, 401)
      assert.equal(
        f.repository.db.prepare('SELECT total_changes() AS count').get()?.count,
        before,
      )
    }
  } finally {
    if (previous === undefined) delete runtime.ostatkiService
    else runtime.ostatkiService = previous
    f.repository.close()
  }
})
