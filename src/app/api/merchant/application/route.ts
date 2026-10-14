import { endpoint, readJson } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) =>
    service.merchantApplication(user),
  )
}
export function PATCH(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.updateMerchantApplication(service.session(token), input)
  })
}
