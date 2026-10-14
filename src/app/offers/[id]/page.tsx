import { OfferDetail } from '@/_pages/offer'
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <OfferDetail id={(await params).id} />
}
