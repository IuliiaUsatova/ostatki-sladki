import { endpoint, readJson } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) =>
    service.lookupPickup(user, new URL(request.url).searchParams.get('code')),
  )
}
export function POST(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.collect(service.session(token), input)
  })
}
