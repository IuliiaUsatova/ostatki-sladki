import { endpoint, readJson } from '../../../../../server/http.ts'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return endpoint(request, true, async ({ service, token }) => {
    const input = await readJson(request)
    return service.patchOffer(service.session(token), id, input)
  })
}
