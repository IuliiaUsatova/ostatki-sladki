import { invariant } from '../domain-error/index.ts'

export function object(value: unknown): Record<string, unknown> {
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_INPUT',
    'Ожидается объект с данными.',
  )
  return value as Record<string, unknown>
}

export function keys(value: Record<string, unknown>, allowed: string[]) {
  invariant(
    Object.keys(value).every((key) => allowed.includes(key)),
    'INVALID_INPUT',
    'Передано неизвестное поле.',
  )
}
