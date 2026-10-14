import { endpoint } from '../../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return endpoint(request, true, ({ service, user }) =>
    service.readNotification(user, id),
  )
}
