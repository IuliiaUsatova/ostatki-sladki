import { endpoint, readJson } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) =>
    service.merchantProfile(user),
  )
}
export function PATCH(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request, 32_768)
    return service.updateMerchantProfile(service.session(token), input)
  })
}
