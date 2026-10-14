import {
  endpoint,
  json,
  readJson,
  sessionCookie,
} from '../../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function POST(request: Request) {
  return endpoint(request, true, async ({ service }) => {
    const result = await service.resetPassword(await readJson(request))
    return json(result, 200, { 'Set-Cookie': sessionCookie(request, null) })
  })
}
