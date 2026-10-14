export class DomainError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = status
  }
}

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status)
}
