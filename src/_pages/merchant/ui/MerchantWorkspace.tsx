'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { MerchantResponse, Offer, User } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useMerchantI18n } from '@/entities/venue'
import { merchantOrderPath } from '@/shared/lib/auth-routing'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'
import { VerificationNotice } from '@/features/account-security'
import { ApplicationPanel } from '@/features/cafe-application'
import { ProfileEditor } from '@/widgets/venue-profile-editor'
import { PhotoPicker } from '@/features/venue-media'
import { UnreadLink } from '@/entities/notification'
import { OfferEditor } from '@/features/edit-offer'
import { PickupDesk } from '@/features/collect-order'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import { Notice } from './MerchantPrimitives'
import { OffersTable } from './MerchantTables'
import MerchantOrderDetail from './MerchantOrderDetail'

import type { Tab, Filter } from '../model/types'
import MerchantOrdersOverview from './MerchantOrdersOverview'

export default function MerchantWorkspace() {
  const params = useSearchParams()
  const orderParam =
    params.getAll('order').length === 1 ? params.get('order') : null
  const returnPath = merchantOrderPath(orderParam)
  const requestedOrder = returnPath === '/merchant' ? null : orderParam
  const { t, error: errorText, time, date } = useMerchantI18n()
  const sessionResource = useResource<{ user: User | null }>('/api/session')
  const merchantResource = useResource<MerchantResponse>('/api/merchant')
  const session = sessionResource.data?.user ?? null
  const data = merchantResource.data
  const loading =
    sessionResource.loading ||
    (session?.role !== 'buyer' && merchantResource.loading)
  const error =
    sessionResource.error ??
    (session && session.role !== 'buyer' ? merchantResource.error : null)
  const [requestedTab, setTab] = useState<Tab>(
    requestedOrder ? 'orders' : 'today',
  )
  const approved = data?.venue.status === 'approved'
  const tab =
    session?.role === 'pickup'
      ? 'pickup'
      : !approved && requestedTab === 'today'
        ? 'application'
        : requestedTab
  const [filter, setFilter] = useState<Filter>('all')
  const [editor, setEditor] = useState<Offer | 'new' | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    requestedOrder,
  )
  const [success, setSuccess] = useState<string | null>(null)
  const reloadSession = sessionResource.reload
  const reloadMerchant = merchantResource.reload
  const invalidate = useCallback(() => {
    reloadSession()
    reloadMerchant()
  }, [reloadSession, reloadMerchant])
  useEffect(() => {
    const onFocus = () => {
      void invalidate()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [invalidate])

  if (loading)
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <p role="status">{t('loading')}</p>
        </div>
      </div>
    )
  if (!session || !['cafe', 'pickup'].includes(session.role) || !data)
    return (
      <div className={styles.gate}>
        <section className={styles.gateCard}>
          <h1>
            {t(
              !session || !['cafe', 'pickup'].includes(session.role)
                ? 'needRole'
                : 'cabinet',
            )}
          </h1>
          <p>
            {t(
              !session || !['cafe', 'pickup'].includes(session.role)
                ? 'needRoleText'
                : 'error.generic',
            )}
          </p>
          {error !== null && <p role="alert">{errorText(error)}</p>}
          <LanguageSwitcher />
          <Link
            href={
              session
                ? '/profile'
                : `/login?next=${encodeURIComponent(returnPath)}`
            }
            className={styles.button}
          >
            {t(session ? 'profile' : 'login')}
          </Link>
          {error !== null && (
            <button
              className={styles.secondary}
              onClick={() => void invalidate()}
            >
              {t('retry')}
            </button>
          )}
        </section>
      </div>
    )

  const selectedOrder = data.orders.find(
    (order) => order.id === selectedOrderId,
  )
  const title = editor
    ? t(editor === 'new' ? 'newOffer' : 'editOffer')
    : selectedOrder
      ? `${t('number')} ${selectedOrder.number}`
      : t(tab)
  const navigate = (next: Tab) => {
    setTab(next)
    setEditor(null)
    setSelectedOrderId(null)
    setSuccess(null)
  }
  const openEditor = (offer: Offer | 'new') => {
    setTab('offers')
    setSelectedOrderId(null)
    setEditor(offer)
    setSuccess(null)
  }
  const showPickup = () => {
    setEditor(null)
    setSelectedOrderId(null)
    setTab('pickup')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          {t('brand')}
        </Link>
        <p className={styles.eyebrow}>{t('cabinet')}</p>
        <p className={styles.venueName}>{data.venue.name}</p>
        <LanguageSwitcher />
        <nav className={styles.navigation} aria-label={t('cabinet')}>
          {(session.role === 'pickup'
            ? (['pickup'] as const)
            : approved
              ? ([
                  'today',
                  'offers',
                  'orders',
                  'pickup',
                  'application',
                  'cafeProfile',
                ] as const)
              : (['application', 'cafeProfile', 'orders', 'pickup'] as const)
          ).map((item) => (
            <button
              key={item}
              className={styles.navItem}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              {t(item)}
            </button>
          ))}
        </nav>
        <p className={styles.small}>
          {session.name} · {t(session.role === 'pickup' ? 'staff' : 'owner')}
        </p>
        <div className={styles.sidebarBottom}>
          <UnreadLink key={session.id} />
          <Link href="/" className={styles.sideLink}>
            {t('buyerApp')}
          </Link>
          <Link href="/profile" className={styles.sideLink}>
            {t('profile')}
          </Link>
        </div>
      </aside>
      <main className={styles.workspace}>
        <VerificationNotice user={session} />
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1>{title}</h1>
            <p className={styles.subtitle}>
              {tab === 'offers'
                ? t('manage')
                : `${data.venue.name} · ${date(data.serverNow)}, ${time(data.serverNow)}`}
            </p>
          </div>
          {!editor &&
            !selectedOrder &&
            session.role === 'cafe' &&
            tab !== 'application' &&
            tab !== 'cafeProfile' &&
            (tab !== 'offers' || approved) && (
              <div className={styles.headerActions}>
                <button
                  className={styles.button}
                  onClick={
                    tab === 'offers' ? () => openEditor('new') : showPickup
                  }
                >
                  {t(tab === 'offers' ? 'addOffer' : 'checkCode')}
                </button>
              </div>
            )}
        </header>
        {error !== null && (
          <div className={styles.error} role="alert">
            <p>{errorText(error)}</p>
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                onClick={() => void invalidate()}
              >
                {t('retry')}
              </button>
              <Link href="/profile" className={styles.secondary}>
                {t('profile')}
              </Link>
            </div>
          </div>
        )}
        {success && (
          <div className={styles.success} role="status">
            {t(success)}
          </div>
        )}
        {!approved && tab !== 'application' && (
          <Notice title={t('pendingTitle')}>{t('pendingText')}</Notice>
        )}
        {tab === 'cafeProfile' ? (
          <ProfileEditor
            verified={session.emailVerified === true}
            onChanged={() => void invalidate()}
          />
        ) : tab === 'application' ? (
          <ApplicationPanel onChanged={() => void invalidate()} />
        ) : editor ? (
          <OfferEditor
            key={`${session.id}:${typeof editor === 'string' ? 'new' : editor.id}`}
            offer={editor === 'new' ? null : editor}
            userId={session.id}
            serverNow={data.serverNow}
            approved={data.venue.status === 'approved'}
            verified={session.emailVerified === true}
            renderPhotoPicker={(props) => <PhotoPicker {...props} />}
            onClose={() => setEditor(null)}
            onSaved={(created) => {
              setEditor(null)
              setSuccess(created ? 'created' : 'saved')
              invalidate()
            }}
          />
        ) : selectedOrder ? (
          <MerchantOrderDetail
            order={selectedOrder}
            user={session}
            onChanged={() => void invalidate()}
            onBack={() => setSelectedOrderId(null)}
            onPickup={showPickup}
          />
        ) : tab === 'pickup' ? (
          <PickupDesk
            key={session.id}
            actorId={session.id}
            onCollected={invalidate}
          />
        ) : tab === 'offers' ? (
          <OffersTable offers={data.offers} onEdit={openEditor} />
        ) : (
          <MerchantOrdersOverview
            data={data}
            role={session.role}
            filter={filter}
            onFilter={setFilter}
            showSummary={tab === 'today'}
            onOpen={(order) => setSelectedOrderId(order.id)}
            onPickup={showPickup}
            onNewOffer={() => openEditor('new')}
          />
        )}
        <div className={styles.updated}>
          <span>
            {t('updated')} · {time(data.serverNow)}
          </span>
          <button
            className={styles.textButton}
            onClick={() => void invalidate()}
          >
            {t('refresh')}
          </button>
        </div>
      </main>
    </div>
  )
}
