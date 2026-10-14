import { PublicVenue } from '@/_pages/venue'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <PublicVenue id={(await params).id} />
}
