import { endpoint, readJson } from '../../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  const { id } = await context.params
  return endpoint(request, false, ({ service, user }) =>
    service.getOrderIssue(user, id),
  )
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.openOrderIssue(service.session(token), id, input)
  })
}
