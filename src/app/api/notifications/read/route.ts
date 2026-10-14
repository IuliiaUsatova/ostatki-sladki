import { endpoint, readJson } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function PATCH(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.readAllNotifications(service.session(token), input)
  })
}
