import {
  endpoint,
  json,
  readJson,
  sessionCookie,
} from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function POST(request: Request) {
  return endpoint(request, true, async ({ service, token }) => {
    const next = await service.login(await readJson(request), token)
    return json({ user: next.user }, 200, {
      'Set-Cookie': sessionCookie(request, next.token),
    })
  })
}
