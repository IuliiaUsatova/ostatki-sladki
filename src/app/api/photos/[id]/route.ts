import { endpoint } from '../../../../server/http.ts'
import { photoResponse, readPhoto } from '../../../../server/photos.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return endpoint(request, false, async ({ service, user, token }) =>
    photoResponse(
      await readPhoto(service.repository, user, id, service.clock(), {
        currentSession: () => service.session(token),
      }),
    ),
  )
}
