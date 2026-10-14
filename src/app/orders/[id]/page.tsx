import { OrderDetail } from '@/_pages/order'
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <OrderDetail id={(await params).id} />
}
