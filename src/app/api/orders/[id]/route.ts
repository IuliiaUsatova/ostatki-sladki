import { endpoint } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return endpoint(request, false, ({ service, user }) =>
    service.getOrder(user, id),
  )
}
