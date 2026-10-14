import { createHash } from 'node:crypto'
import { invariant } from './errors.ts'
import type {
  Locale,
  OrderIssueCategory,
  SupportKind,
  SupportResolutionCode,
  SupportStatus,
} from './types.ts'
import {
  idempotencyKey,
  integer,
  keys,
  object,
  PHOTO_ID_PATTERN,
  text,
} from './validation.ts'

export const SUPPORT_STATUSES = [
  'new',
  'in_review',
  'waiting',
  'resolved',
] as const
export function supportEscalationInput(value: unknown) {
  const input = object(value)
  keys(input, ['kind', 'category', 'message', 'idempotencyKey'])
  invariant(
    input.kind === 'help' || input.kind === 'complaint',
    'INVALID_INPUT',
    'Выберите тип обращения.',
  )
  invariant(
    typeof input.category === 'string' &&
      ['pickup_problem', 'food_problem', 'cancellation', 'other'].includes(
        input.category,
      ),
    'INVALID_INPUT',
    'Выберите тему обращения.',
  )
  return {
    kind: input.kind as SupportKind,
    category: input.category as OrderIssueCategory,
    message: text(input.message, 'сообщение', 2000, 5),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
  }
}
export function supportMessageInput(value: unknown) {
  const input = object(value)
  keys(input, ['message', 'revision', 'idempotencyKey'])
  return {
    message: text(input.message, 'сообщение', 2000, 5),
    revision: integer(input.revision, 'версия', 1, Number.MAX_SAFE_INTEGER),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
  }
}
export function supportActionInput(value: unknown) {
  const input = object(value)
  keys(input, ['action', 'revision', 'idempotencyKey', 'resolution'])
  invariant(
    typeof input.action === 'string' &&
      ['claim', 'release', 'wait', 'resume', 'resolve', 'reopen'].includes(
        input.action,
      ),
    'INVALID_INPUT',
    'Выберите действие поддержки.',
  )
  let resolution:
    | { code: SupportResolutionCode; texts: Record<Locale, string> }
    | undefined
  if (input.action === 'resolve') {
    const decision = object(input.resolution)
    keys(decision, ['code', 'texts'])
    invariant(
      typeof decision.code === 'string' &&
        [
          'information_provided',
          'agreement_reached',
          'complaint_upheld',
          'complaint_not_upheld',
        ].includes(decision.code),
      'INVALID_INPUT',
      'Выберите решение.',
    )
    const texts = object(decision.texts)
    keys(texts, ['ru', 'kk', 'en'])
    resolution = {
      code: decision.code as SupportResolutionCode,
      texts: {
        ru: text(texts.ru, 'решение на русском', 2000, 5),
        kk: text(texts.kk, 'решение на казахском', 2000, 5),
        en: text(texts.en, 'решение на английском', 2000, 5),
      },
    }
  } else
    invariant(
      input.resolution === undefined,
      'INVALID_INPUT',
      'Решение доступно только при завершении обращения.',
    )
  return {
    action: input.action as
      | 'claim'
      | 'release'
      | 'wait'
      | 'resume'
      | 'resolve'
      | 'reopen',
    revision: integer(input.revision, 'версия', 1, Number.MAX_SAFE_INTEGER),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    ...(resolution ? { resolution } : {}),
  }
}
export function supportQueueInput(value: unknown, actorId: string) {
  const input = object(value)
  keys(input, ['status', 'kind', 'assignment', 'search', 'limit', 'cursor'])
  const status = input.status ?? 'all',
    kind = input.kind ?? 'all',
    assignment = input.assignment ?? 'all',
    limit = input.limit ?? '20'
  invariant(
    status === 'all' || SUPPORT_STATUSES.includes(status as SupportStatus),
    'INVALID_INPUT',
    'Выберите статус.',
  )
  invariant(
    kind === 'all' || kind === 'help' || kind === 'complaint',
    'INVALID_INPUT',
    'Выберите тип обращения.',
  )
  invariant(
    assignment === 'all' ||
      assignment === 'mine' ||
      assignment === 'unassigned',
    'INVALID_INPUT',
    'Выберите назначение.',
  )
  invariant(
    typeof limit === 'string' && /^(?:[1-9]|[1-4]\d|50)$/.test(limit),
    'INVALID_INPUT',
    'Выберите от 1 до 50 обращений.',
  )
  const search = text(input.search ?? '', 'поиск', 100, 0)
  const signature = createHash('sha256')
    .update(JSON.stringify({ status, kind, assignment, search, actorId }))
    .digest('hex')
  let cursor: { updatedAt: string; id: string } | null = null
  if (input.cursor !== undefined) {
    invariant(
      typeof input.cursor === 'string' &&
        input.cursor.length <= 512 &&
        /^[A-Za-z0-9_-]+$/.test(input.cursor),
      'INVALID_INPUT',
      'Недопустимая следующая страница.',
    )
    let decoded: unknown
    try {
      const bytes = Buffer.from(input.cursor, 'base64url')
      invariant(
        bytes.toString('base64url') === input.cursor,
        'INVALID_INPUT',
        'Недопустимая следующая страница.',
      )
      decoded = JSON.parse(
        new TextDecoder('utf8', { fatal: true }).decode(bytes),
      )
    } catch {
      invariant(false, 'INVALID_INPUT', 'Недопустимая следующая страница.')
    }
    const parsed = object(decoded)
    keys(parsed, ['updatedAt', 'id', 'signature'])
    invariant(
      parsed.signature === signature &&
        typeof parsed.updatedAt === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parsed.updatedAt) &&
        Number.isFinite(Date.parse(parsed.updatedAt)) &&
        new Date(parsed.updatedAt).toISOString() === parsed.updatedAt &&
        typeof parsed.id === 'string' &&
        PHOTO_ID_PATTERN.test(parsed.id),
      'INVALID_INPUT',
      'Недопустимая следующая страница.',
    )
    cursor = { updatedAt: parsed.updatedAt, id: parsed.id }
  }
  return {
    status: status as SupportStatus | 'all',
    kind: kind as SupportKind | 'all',
    assignment: assignment as 'all' | 'mine' | 'unassigned',
    search,
    limit: Number(limit),
    cursor,
    signature,
  }
}
