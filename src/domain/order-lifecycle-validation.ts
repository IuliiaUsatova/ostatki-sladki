import { invariant } from './errors.ts'
import type { CafeCancellationReason, OrderIssueCategory } from './types.ts'
import { idempotencyKey, integer, keys, object, text } from './validation.ts'

export function cafeCancellation(value: unknown) {
  const input = object(value)
  keys(input, ['reason', 'note', 'idempotencyKey'])
  invariant(
    input.reason === 'unavailable' ||
      input.reason === 'closed' ||
      input.reason === 'quality_issue' ||
      input.reason === 'other',
    'INVALID_INPUT',
    'Выберите причину отмены.',
  )
  return {
    reason: input.reason as CafeCancellationReason,
    note: text(
      input.note ?? '',
      'пояснение',
      1000,
      input.reason === 'other' ? 5 : 0,
    ),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
  }
}

export function openIssueInput(value: unknown) {
  const input = object(value)
  keys(input, ['category', 'message', 'idempotencyKey'])
  invariant(
    input.category === 'pickup_problem' ||
      input.category === 'food_problem' ||
      input.category === 'cancellation' ||
      input.category === 'other',
    'INVALID_INPUT',
    'Выберите тему обращения.',
  )
  return {
    category: input.category as OrderIssueCategory,
    message: text(input.message, 'сообщение', 2000, 5),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
  }
}

export function issueMessageInput(value: unknown) {
  const input = object(value)
  keys(input, ['message', 'idempotencyKey'])
  return {
    message: text(input.message, 'сообщение', 2000, 5),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
  }
}

export function resolveIssueInput(value: unknown) {
  const input = object(value)
  keys(input, ['revision'])
  return {
    revision: integer(
      input.revision,
      'версия обращения',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  }
}
