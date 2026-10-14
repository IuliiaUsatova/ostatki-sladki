import { endpoint } from '../../../server/http.ts'
import { invariant } from '../../../domain/errors.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) => {
    const params = new URL(request.url).searchParams
    invariant(
      Array.from(params.keys()).every((key) =>
        ['limit', 'filter', 'cursor'].includes(key),
      ) &&
        Array.from(new Set(params.keys())).every(
          (key) => params.getAll(key).length === 1,
        ),
      'INVALID_INPUT',
      'Недопустимые параметры списка уведомлений.',
    )
    return service.notifications(user, Object.fromEntries(params))
  })
}
