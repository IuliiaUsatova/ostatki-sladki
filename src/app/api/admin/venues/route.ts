import { endpoint } from '../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET(request: Request) {
  return endpoint(request, false, ({ service, user }) =>
    service.listVenueApplications(user),
  )
}
