import { createHash, randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import type {
  Order,
  OrderIssue,
  OrderIssueResponse,
  User,
} from '../domain/types.ts'
import {
  issueMessageInput,
  openIssueInput,
  resolveIssueInput,
} from '../domain/order-lifecycle-validation.ts'
import type { Repository } from './repository.ts'
import { onSupportParticipantMessage } from './support.ts'

function scope(
  repository: Repository,
  user: User | null,
  id: string,
): { actor: User; order: Order } {
  const actor = user ? repository.user(user.id) : null
  invariant(actor, 'AUTH_REQUIRED', 'Войдите в аккаунт, чтобы продолжить.', 401)
  invariant(
    actor.role === 'buyer' || actor.role === 'cafe',
    'FORBIDDEN',
    'Обращения доступны покупателю и владельцу кафе.',
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
  return { actor, order }
}

function hash(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
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
    existing.action === action && existing.payloadHash === hash(payload),
    'IDEMPOTENCY_CONFLICT',
    'Этот ключ использован для другого запроса.',
    409,
  )
  return true
}
function remember(
  repository: Repository,
  actor: User,
  key: string,
  action: string,
  payload: unknown,
  issue: OrderIssue,
) {
  repository.remember(actor.id, key, action, hash(payload), issue.id)
}
function response(
  repository: Repository,
  id: string,
  now: number,
): OrderIssueResponse {
  return {
    issue: repository.orderIssue(id),
    serverNow: new Date(now).toISOString(),
  }
}
function message(
  repository: Repository,
  issueId: string,
  actor: User,
  body: string,
  at: string,
): void {
  repository.db
    .prepare('INSERT INTO order_issue_messages VALUES (?,?,?,?,?,?,?)')
    .run(randomUUID(), issueId, actor.id, actor.role, actor.name, body, at)
}

/** These helpers run synchronously inside the service's transaction, including its deadline sweep. */
export function getOrderIssue(
  repository: Repository,
  user: User | null,
  id: string,
  now: number,
): OrderIssueResponse {
  scope(repository, user, id)
  return response(repository, id, now)
}

export function openOrderIssue(
  repository: Repository,
  user: User | null,
  id: string,
  value: unknown,
  now: number,
): OrderIssueResponse {
  const { actor, order } = scope(repository, user, id)
  invariant(
    actor.role === 'buyer',
    'FORBIDDEN',
    'Обращение создаёт покупатель заказа.',
    403,
  )
  const input = openIssueInput(value)
  const payload = {
    orderId: id,
    category: input.category,
    message: input.message,
  }
  if (
    replay(repository, actor, input.idempotencyKey, 'open-order-issue', payload)
  )
    return response(repository, id, now)
  invariant(
    ['confirmed', 'collected', 'not_collected'].includes(order.status) ||
      (order.status === 'cancelled' &&
        order.events.some((event) => event.type === 'confirmed')),
    'ORDER_STATE_CONFLICT',
    'Обращение доступно для подтверждённого заказа.',
    409,
  )
  invariant(
    !repository.orderIssue(id),
    'ISSUE_ALREADY_EXISTS',
    'У заказа уже есть обращение.',
    409,
  )
  const issueId = randomUUID(),
    at = new Date(now).toISOString()
  repository.db
    .prepare("INSERT INTO order_issues VALUES (?,?,?,'open',1,?,?)")
    .run(issueId, id, input.category, at, at)
  message(repository, issueId, actor, input.message, at)
  remember(
    repository,
    actor,
    input.idempotencyKey,
    'open-order-issue',
    payload,
    repository.orderIssue(id)!,
  )
  return response(repository, id, now)
}

export function addOrderIssueMessage(
  repository: Repository,
  user: User | null,
  id: string,
  value: unknown,
  now: number,
): OrderIssueResponse {
  const { actor } = scope(repository, user, id)
  const input = issueMessageInput(value)
  const payload = { orderId: id, message: input.message }
  if (
    replay(
      repository,
      actor,
      input.idempotencyKey,
      'reply-order-issue',
      payload,
    )
  )
    return response(repository, id, now)
  const issue = repository.orderIssue(id)
  invariant(issue, 'ISSUE_NOT_FOUND', 'Обращение не найдено.', 404)
  invariant(
    actor.role === 'buyer' || issue.status !== 'resolved',
    'ISSUE_STATE_CONFLICT',
    'Покупатель закрыл обращение.',
    409,
  )
  invariant(
    issue.messages.length < 50,
    'ISSUE_MESSAGE_LIMIT',
    'Достигнут предел сообщений в обращении.',
    409,
  )
  const at = new Date(now).toISOString()
  message(repository, issue.id, actor, input.message, at)
  onSupportParticipantMessage(repository, issue, actor, input.message, now)
  repository.db
    .prepare(
      'UPDATE order_issues SET status=?,revision=revision+1,updated_at=? WHERE id=?',
    )
    .run(actor.role === 'buyer' ? 'open' : 'answered', at, issue.id)
  remember(
    repository,
    actor,
    input.idempotencyKey,
    'reply-order-issue',
    payload,
    issue,
  )
  return response(repository, id, now)
}

export function resolveOrderIssue(
  repository: Repository,
  user: User | null,
  id: string,
  value: unknown,
  now: number,
): OrderIssueResponse {
  const { actor } = scope(repository, user, id)
  invariant(
    actor.role === 'buyer',
    'FORBIDDEN',
    'Закрыть обращение может покупатель заказа.',
    403,
  )
  const input = resolveIssueInput(value)
  const issue = repository.orderIssue(id)
  invariant(issue, 'ISSUE_NOT_FOUND', 'Обращение не найдено.', 404)
  invariant(
    !issue.support || issue.support.status === 'resolved',
    'SUPPORT_ACTIVE',
    'Обращение находится в поддержке. Дождитесь решения.',
    409,
  )
  invariant(
    issue.revision === input.revision,
    'ISSUE_REVISION_CONFLICT',
    'Обращение изменилось. Обновите переписку.',
    409,
  )
  if (issue.status !== 'resolved') {
    const changed = repository.db
      .prepare(
        "UPDATE order_issues SET status='resolved',revision=revision+1,updated_at=? WHERE id=? AND revision=?",
      )
      .run(new Date(now).toISOString(), issue.id, input.revision)
    invariant(
      Number(changed.changes) === 1,
      'ISSUE_REVISION_CONFLICT',
      'Обращение изменилось. Обновите переписку.',
      409,
    )
  }
  return response(repository, id, now)
}
