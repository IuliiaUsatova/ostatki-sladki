import { endpoint, readJson } from '../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function POST(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.reserve(service.session(token), input)
  })
}
