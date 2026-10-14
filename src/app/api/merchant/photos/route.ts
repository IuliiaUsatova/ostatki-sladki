import { endpoint, json } from '../../../../server/http.ts'
import { listVenuePhotos, uploadVenuePhoto } from '../../../../server/photos.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) => ({
    photos: listVenuePhotos(service.repository, user),
    serverNow: service.now(),
  }))
}

export function POST(request: Request) {
  return endpoint(request, true, async ({ service, user, token }) => {
    const photo = await uploadVenuePhoto(
      service.repository,
      user,
      request,
      service.clock(),
      { currentSession: () => service.session(token) },
    )
    return json({ photo, serverNow: service.now() }, 201)
  })
}
