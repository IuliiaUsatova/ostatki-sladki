import { createHash, randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import type {
  AdminSupportDetailResponse,
  AdminSupportQueueResponse,
  Order,
  OrderIssue,
  OrderIssueResponse,
  SupportCase,
  SupportEvent,
  SupportQueueSummary,
  SupportResolution,
  SupportStatus,
  User,
} from '../domain/types.ts'
import {
  supportActionInput,
  supportEscalationInput,
  supportMessageInput,
  supportQueueInput,
} from '../domain/support-validation.ts'
import type { Repository } from './repository.ts'

type Row = Record<string, unknown>
const at = (now: number) => new Date(now).toISOString()
function administrator(repository: Repository, user: User | null): User {
  const actor = user ? repository.user(user.id) : null
  invariant(actor, 'AUTH_REQUIRED', 'Войдите в аккаунт, чтобы продолжить.', 401)
  invariant(
    actor.role === 'admin',
    'FORBIDDEN',
    'Очередь поддержки доступна администратору.',
    403,
  )
  invariant(
    actor.emailVerified === true,
    'EMAIL_NOT_VERIFIED',
    'Подтвердите email, чтобы открыть поддержку.',
    403,
  )
  return actor
}
function party(
  repository: Repository,
  user: User | null,
  id: string,
): { actor: User; order: Order } {
  const actor = user ? repository.user(user.id) : null
  invariant(actor, 'AUTH_REQUIRED', 'Войдите в аккаунт, чтобы продолжить.', 401)
  invariant(
    actor.role === 'buyer' || actor.role === 'cafe',
    'FORBIDDEN',
    'Поддержка заказа доступна покупателю и владельцу кафе.',
    403,
  )
  const order = repository.order(id)
  invariant(
    order &&
      (actor.role === 'buyer'
        ? order.buyerId === actor.id
        : order.venueId === actor.venueId),
    'ORDER_NOT_FOUND',
    'Заказ не найден.',
    404,
  )
  invariant(
    ['confirmed', 'collected', 'not_collected'].includes(order.status) ||
      (order.status === 'cancelled' &&
        order.events.some((event) => event.type === 'confirmed')),
    'ORDER_STATE_CONFLICT',
    'Поддержка доступна для подтверждённого заказа.',
    409,
  )
  return { actor, order }
}
function caseOrder(repository: Repository, id: string): string {
  const row = repository.db
    .prepare(
      'SELECT i.order_id FROM support_cases c JOIN order_issues i ON i.id=c.issue_id WHERE c.id=?',
    )
    .get(id)
  invariant(row, 'SUPPORT_NOT_FOUND', 'Обращение поддержки не найдено.', 404)
  return String(row.order_id)
}
function detail(
  repository: Repository,
  id: string,
  now: number,
): AdminSupportDetailResponse {
  const orderId = caseOrder(repository, id),
    issue = repository.orderIssue(orderId)!,
    order = repository.order(orderId)!
  const { pickupCode: _privateCode, ...safeOrder } = order
  void _privateCode
  return { issue, order: safeOrder, serverNow: at(now) }
}
function replay(
  repository: Repository,
  actor: User,
  key: string,
  action: string,
  payload: unknown,
): boolean {
  const existing = repository.idempotent(actor.id, key)
  if (!existing) return false
  invariant(
    existing.action === action && existing.payloadHash === digest(payload),
    'IDEMPOTENCY_CONFLICT',
    'Этот ключ использован для другого запроса.',
    409,
  )
  return true
}
const digest = (payload: unknown) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex')
function remember(
  repository: Repository,
  actor: User,
  key: string,
  action: string,
  payload: unknown,
  id: string,
) {
  repository.remember(actor.id, key, action, digest(payload), id)
}
function event(
  repository: Repository,
  current: SupportCase,
  actor: User,
  action: SupportEvent['action'],
  from: SupportStatus | null,
  note: string | null,
  now: number,
  reason: SupportEvent['reason'] = null,
): void {
  const item: SupportEvent = {
    id: randomUUID(),
    action,
    actorName: actor.name,
    actorRole: actor.role as SupportEvent['actorRole'],
    createdAt: at(now),
    fromStatus: from,
    toStatus: current.status,
    assigneeName: current.assignee?.name ?? null,
    note,
    resolution: current.resolution,
    reason,
  }
  repository.db
    .prepare('INSERT INTO support_events VALUES (?,?,?)')
    .run(item.id, current.id, JSON.stringify(item))
}
function revise(
  repository: Repository,
  current: SupportCase,
  status: SupportStatus,
  assigneeId: string | null,
  resolution: SupportResolution | null,
  now: number,
): void {
  const changed = repository.db
    .prepare(
      'UPDATE support_cases SET status=?,assignee_id=?,resolution=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
    )
    .run(
      status,
      assigneeId,
      resolution ? JSON.stringify(resolution) : null,
      at(now),
      current.id,
      current.revision,
    )
  invariant(
    Number(changed.changes) === 1,
    'SUPPORT_REVISION_CONFLICT',
    'Обращение изменилось. Обновите данные.',
    409,
  )
}
function revision(current: SupportCase, expected: number) {
  invariant(
    current.revision === expected,
    'SUPPORT_REVISION_CONFLICT',
    'Обращение изменилось. Обновите данные.',
    409,
  )
}
function assignee(current: SupportCase, actor: User) {
  invariant(
    current.assignee?.id === actor.id,
    'SUPPORT_ASSIGNMENT_CONFLICT',
    'Обращение назначено другому администратору или ещё не принято.',
    409,
  )
}
function append(
  repository: Repository,
  issue: OrderIssue,
  actor: User,
  body: string,
  now: number,
): void {
  invariant(
    issue.messages.length < 50,
    'ISSUE_MESSAGE_LIMIT',
    'Достигнут предел сообщений. Решение можно оформить отдельно.',
    409,
  )
  repository.db
    .prepare('INSERT INTO order_issue_messages VALUES (?,?,?,?,?,?,?)')
    .run(
      randomUUID(),
      issue.id,
      actor.id,
      actor.role,
      actor.name,
      body,
      at(now),
    )
}

/** All mutations are synchronous within the service's single marketplace transaction. */
export function escalateOrderIssueSupport(
  repository: Repository,
  user: User | null,
  orderId: string,
  value: unknown,
  now: number,
): OrderIssueResponse {
  const { actor } = party(repository, user, orderId),
    input = supportEscalationInput(value)
  const payload = {
    orderId,
    kind: input.kind,
    category: input.category,
    message: input.message,
  }
  if (
    replay(repository, actor, input.idempotencyKey, 'escalate-support', payload)
  )
    return { issue: repository.orderIssue(orderId), serverNow: at(now) }
  let issue = repository.orderIssue(orderId)
  if (!issue) {
    const id = randomUUID()
    repository.db
      .prepare("INSERT INTO order_issues VALUES (?,?,?,'open',1,?,?)")
      .run(id, orderId, input.category, at(now), at(now))
    issue = repository.orderIssue(orderId)!
    append(repository, issue, actor, input.message, now)
  } else {
    invariant(
      issue.category === input.category,
      'SUPPORT_STATE_CONFLICT',
      'Выберите исходную тему обращения.',
      409,
    )
    invariant(
      !issue.support || issue.support.status === 'resolved',
      'SUPPORT_ALREADY_ACTIVE',
      'Обращение уже находится в поддержке.',
      409,
    )
    if (issue.support)
      invariant(
        issue.support.kind === input.kind,
        'SUPPORT_STATE_CONFLICT',
        'Сохраните исходный тип обращения.',
        409,
      )
    if (issue.messages.length < 50)
      append(repository, issue, actor, input.message, now)
    repository.db
      .prepare(
        "UPDATE order_issues SET status='open',revision=revision+1,updated_at=? WHERE id=?",
      )
      .run(at(now), issue.id)
  }
  const previous = issue.support
  if (previous) revise(repository, previous, 'new', null, null, now)
  else
    repository.db
      .prepare(
        "INSERT INTO support_cases VALUES (?,?,?,'new',1,?,?,NULL,?,?,NULL)",
      )
      .run(
        randomUUID(),
        issue.id,
        input.kind,
        actor.name,
        actor.role,
        at(now),
        at(now),
      )
  const current = repository.supportCase(issue.id)!
  event(
    repository,
    current,
    actor,
    previous ? 'reopened' : 'opened',
    previous?.status ?? null,
    input.message,
    now,
  )
  remember(
    repository,
    actor,
    input.idempotencyKey,
    'escalate-support',
    payload,
    current.id,
  )
  return { issue: repository.orderIssue(orderId), serverNow: at(now) }
}

export function onSupportParticipantMessage(
  repository: Repository,
  issue: OrderIssue,
  actor: User,
  body: string,
  now: number,
): void {
  const current = issue.support
  if (!current) return
  const reopened = current.status === 'resolved'
  const status = reopened
    ? 'new'
    : current.status === 'waiting'
      ? current.assignee
        ? 'in_review'
        : 'new'
      : current.status
  revise(
    repository,
    current,
    status,
    reopened ? null : (current.assignee?.id ?? null),
    reopened ? null : current.resolution,
    now,
  )
  event(
    repository,
    repository.supportCase(issue.id)!,
    actor,
    reopened ? 'reopened' : 'participant_message',
    current.status,
    reopened ? body : null,
    now,
  )
}

export function adminSupportDetail(
  repository: Repository,
  user: User | null,
  id: string,
  now: number,
): AdminSupportDetailResponse {
  administrator(repository, user)
  return detail(repository, id, now)
}

export function adminSupportMessage(
  repository: Repository,
  user: User | null,
  id: string,
  value: unknown,
  now: number,
): AdminSupportDetailResponse {
  const actor = administrator(repository, user),
    orderId = caseOrder(repository, id),
    input = supportMessageInput(value)
  const payload = {
    caseId: id,
    message: input.message,
    revision: input.revision,
  }
  if (
    replay(repository, actor, input.idempotencyKey, 'support-message', payload)
  )
    return detail(repository, id, now)
  const issue = repository.orderIssue(orderId)!,
    current = issue.support!
  revision(current, input.revision)
  assignee(current, actor)
  invariant(
    current.status === 'in_review' || current.status === 'waiting',
    'SUPPORT_STATE_CONFLICT',
    'Сначала примите обращение в работу.',
    409,
  )
  append(repository, issue, actor, input.message, now)
  repository.db
    .prepare(
      "UPDATE order_issues SET status='answered',revision=revision+1,updated_at=? WHERE id=?",
    )
    .run(at(now), issue.id)
  revise(repository, current, 'waiting', actor.id, null, now)
  event(
    repository,
    repository.supportCase(issue.id)!,
    actor,
    'replied',
    current.status,
    null,
    now,
  )
  remember(
    repository,
    actor,
    input.idempotencyKey,
    'support-message',
    payload,
    id,
  )
  return detail(repository, id, now)
}

export function adminSupportAction(
  repository: Repository,
  user: User | null,
  id: string,
  value: unknown,
  now: number,
): AdminSupportDetailResponse {
  const actor = administrator(repository, user),
    orderId = caseOrder(repository, id),
    input = supportActionInput(value)
  const payload = { caseId: id, ...input }
  delete (payload as { idempotencyKey?: string }).idempotencyKey
  if (
    replay(repository, actor, input.idempotencyKey, 'support-action', payload)
  )
    return detail(repository, id, now)
  const issue = repository.orderIssue(orderId)!,
    current = issue.support!
  revision(current, input.revision)
  let status: SupportStatus,
    assigned = current.assignee?.id ?? null,
    resolution: SupportResolution | null = current.resolution,
    action: SupportEvent['action']
  if (input.action === 'claim') {
    invariant(
      current.status !== 'resolved',
      'SUPPORT_STATE_CONFLICT',
      'Закрытое обращение нужно открыть заново.',
      409,
    )
    invariant(
      !current.assignee ||
        current.assignee.id === actor.id ||
        !current.assignee.available,
      'SUPPORT_ASSIGNMENT_CONFLICT',
      'Обращение уже назначено другому администратору.',
      409,
    )
    status = 'in_review'
    assigned = actor.id
    action = 'claimed'
  } else if (input.action === 'reopen') {
    invariant(
      current.status === 'resolved',
      'SUPPORT_STATE_CONFLICT',
      'Обращение ещё не завершено.',
      409,
    )
    status = 'in_review'
    assigned = actor.id
    resolution = null
    action = 'reopened'
    repository.db
      .prepare(
        "UPDATE order_issues SET status='open',revision=revision+1,updated_at=? WHERE id=?",
      )
      .run(at(now), issue.id)
  } else {
    assignee(current, actor)
    invariant(
      current.status === 'in_review' || current.status === 'waiting',
      'SUPPORT_STATE_CONFLICT',
      'Обращение не находится в работе.',
      409,
    )
    if (input.action === 'release') {
      status = 'new'
      assigned = null
      action = 'released'
    } else if (input.action === 'wait') {
      invariant(
        current.status === 'in_review',
        'SUPPORT_STATE_CONFLICT',
        'Обращение уже ожидает ответа.',
        409,
      )
      status = 'waiting'
      action = 'waiting'
    } else if (input.action === 'resume') {
      invariant(
        current.status === 'waiting',
        'SUPPORT_STATE_CONFLICT',
        'Обращение уже в работе.',
        409,
      )
      status = 'in_review'
      action = 'resumed'
    } else {
      invariant(input.resolution, 'INVALID_INPUT', 'Добавьте решение.')
      invariant(
        current.kind === 'complaint' ||
          ['information_provided', 'agreement_reached'].includes(
            input.resolution.code,
          ),
        'INVALID_INPUT',
        'Для помощи выберите информацию или договорённость.',
      )
      status = 'resolved'
      action = 'resolved'
      resolution = {
        ...input.resolution,
        createdAt: at(now),
        actorName: actor.name,
      }
      repository.db
        .prepare(
          "UPDATE order_issues SET status='resolved',revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(at(now), issue.id)
    }
  }
  revise(repository, current, status, assigned, resolution, now)
  event(
    repository,
    repository.supportCase(issue.id)!,
    actor,
    action,
    current.status,
    null,
    now,
    input.action === 'claim' &&
      current.assignee &&
      current.assignee.id !== actor.id &&
      !current.assignee.available
      ? 'assignee_unavailable'
      : null,
  )
  remember(
    repository,
    actor,
    input.idempotencyKey,
    'support-action',
    payload,
    id,
  )
  return detail(repository, id, now)
}

export function adminSupportQueue(
  repository: Repository,
  user: User | null,
  value: unknown,
  now: number,
): AdminSupportQueueResponse {
  const actor = administrator(repository, user),
    query = supportQueueInput(value, actor.id),
    clauses = ['1=1'],
    params: Array<string | number> = []
  if (query.status !== 'all') {
    clauses.push('c.status=?')
    params.push(query.status)
  }
  if (query.kind !== 'all') {
    clauses.push('c.kind=?')
    params.push(query.kind)
  }
  if (query.assignment === 'mine') {
    clauses.push('c.assignee_id=?')
    params.push(actor.id)
  }
  if (query.assignment === 'unassigned') clauses.push('c.assignee_id IS NULL')
  if (query.search) {
    clauses.push(
      "instr(support_fold(o.number||' '||u.name||' '||json_extract(o.snapshot,'$.venueName')||' '||json_extract(o.snapshot,'$.translations.ru.title')||' '||json_extract(o.snapshot,'$.translations.kk.title')||' '||json_extract(o.snapshot,'$.translations.en.title')),support_fold(?))>0",
    )
    params.push(query.search)
  }
  if (query.cursor) {
    clauses.push('(c.updated_at<? OR (c.updated_at=? AND c.id<?))')
    params.push(query.cursor.updatedAt, query.cursor.updatedAt, query.cursor.id)
  }
  params.push(query.limit + 1)
  const rows = repository.db
    .prepare(
      `SELECT c.*,i.order_id,i.category,o.number,o.snapshot,u.name AS buyer_name,a.name AS assignee_name FROM support_cases c JOIN order_issues i ON i.id=c.issue_id JOIN orders o ON o.id=i.order_id JOIN users u ON u.id=o.buyer_id LEFT JOIN users a ON a.id=c.assignee_id WHERE ${clauses.join(' AND ')} ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`,
    )
    .all(...params) as Row[]
  const cases: SupportQueueSummary[] = rows.slice(0, query.limit).map((row) => {
    const snapshot = JSON.parse(String(row.snapshot)) as Order['snapshot']
    return {
      id: String(row.id),
      orderId: String(row.order_id),
      orderNumber: String(row.number),
      venueName: snapshot.venueName,
      buyerName: String(row.buyer_name),
      titles: {
        ru: snapshot.translations.ru.title,
        kk: snapshot.translations.kk.title,
        en: snapshot.translations.en.title,
      },
      category: row.category as SupportQueueSummary['category'],
      kind: row.kind as SupportQueueSummary['kind'],
      status: row.status as SupportStatus,
      revision: Number(row.revision),
      reporterName: String(row.reporter_name),
      reporterRole: row.reporter_role as 'buyer' | 'cafe',
      assignee:
        row.assignee_id === null
          ? null
          : repository.supportAssignee(String(row.assignee_id)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  })
  const counts = { new: 0, in_review: 0, waiting: 0, resolved: 0 }
  for (const row of repository.db
    .prepare(
      'SELECT status,COUNT(*) AS count FROM support_cases GROUP BY status',
    )
    .all())
    counts[row.status as SupportStatus] = Number(row.count)
  const last = cases.at(-1)
  const nextCursor =
    rows.length > query.limit && last
      ? Buffer.from(
          JSON.stringify({
            updatedAt: last.updatedAt,
            id: last.id,
            signature: query.signature,
          }),
        ).toString('base64url')
      : null
  return { cases, counts, nextCursor, serverNow: at(now) }
}
