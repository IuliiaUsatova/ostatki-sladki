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
    const next = await service.register(await readJson(request), token)
    return json(
      { user: next.user, verificationEmailSent: next.verificationEmailSent },
      201,
      {
        'Set-Cookie': sessionCookie(request, next.token),
      },
    )
  })
}
