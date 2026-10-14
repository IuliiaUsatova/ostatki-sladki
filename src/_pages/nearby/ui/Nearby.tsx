'use client'

import { useOfferText } from '@/entities/offer'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GeoPoint,
  NearbySearchInput,
  NearbySearchResponse,
  NearbyVenue,
} from '@/shared/api'
import { api } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { MapCanvas } from '@/shared/ui/map'
import { DirectionsLink } from '@/shared/ui/map'
import { requestSearchLocation, searchPoint } from '@/shared/lib/geolocation'
import { useNearbyI18n } from '../model/i18n'
import styles from './nearby.module.css'
import { BuyerShell } from '@/shared/ui/app-shell'

const samePoint = (left: GeoPoint | null, right: GeoPoint | null) =>
  !!left &&
  !!right &&
  Math.abs(left.latitude - right.latitude) < 0.0001 &&
  Math.abs(left.longitude - right.longitude) < 0.0001

export default function Nearby() {
  const { t, errorText } = useNearbyI18n()
  const { formatDistance } = useI18n()
  const [query, setQuery] = useState<NearbySearchInput>({
    center: null,
    radiusKm: null,
    search: '',
    kind: 'all',
  })
  const [search, setSearch] = useState('')
  const [radius, setRadius] = useState(5)
  const [browseCenter, setBrowseCenter] = useState<GeoPoint | null>(null)
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showUnlocated, setShowUnlocated] = useState(false)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{
    key: string
    data: NearbySearchResponse | null
    error: unknown
  } | null>(null)
  const cancelLocationRequest = useRef<() => void>(() => {})
  const cards = useRef(new Map<string, HTMLElement>())
  const mapSection = useRef<HTMLElement>(null)
  const requestKey = JSON.stringify({ query, revision })

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await api<NearbySearchResponse>('/api/nearby/search', {
          method: 'POST',
          body: JSON.stringify(query),
          signal: controller.signal,
        })
        if (!controller.signal.aborted)
          setResult({ key: requestKey, data, error: null })
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, data: null, error })
      }
    }
    void load()
    return () => controller.abort()
  }, [query, requestKey])
  useEffect(
    () => () => {
      cancelLocationRequest.current()
    },
    [],
  )

  const centerChanged = useCallback((point: GeoPoint) => {
    setBrowseCenter(searchPoint(point))
  }, [])
  const selectVenue = useCallback((id: string) => {
    setSelectedId(id)
    cards.current
      .get(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])
  const current = result?.key === requestKey ? result : null
  const loading = current === null
  const data = current?.data ?? null
  const points = useMemo(
    () =>
      (data?.venues ?? []).flatMap((item) =>
        item.venue.location
          ? [
              {
                id: item.venue.id,
                name: item.venue.name,
                location: item.venue.location,
              },
            ]
          : [],
      ),
    [data],
  )
  const activeSelectedId = points.some((point) => point.id === selectedId)
    ? selectedId
    : null

  function useLocation() {
    cancelLocationRequest.current()
    setLocationError(null)
    setLocating(true)
    cancelLocationRequest.current = requestSearchLocation(
      navigator.geolocation,
      (point) => {
        setLocating(false)
        setUserLocation(point)
        setBrowseCenter(point)
        setQuery((value) => ({ ...value, center: point, radiusKm: radius }))
      },
      (key) => {
        setLocating(false)
        setLocationError(key)
      },
    )
  }
  function clearLocation() {
    cancelLocationRequest.current()
    setLocating(false)
    setLocationError(null)
    setUserLocation(null)
    setQuery((value) => ({ ...value, center: null, radiusKm: null }))
  }

  return (
    <BuyerShell title={t('title')}>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        <h2>{t('heading')}</h2>
        <p>{t('intro')}</p>
      </section>
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault()
          setQuery((value) => ({ ...value, search: search.trim() }))
          setRevision((value) => value + 1)
        }}
      >
        <label className={styles.field}>
          <span>{t('searchLabel')}</span>
          <div className={styles.searchRow}>
            <input
              type="search"
              maxLength={100}
              value={search}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className={styles.primary}>
              {t('search')}
            </button>
          </div>
        </label>
        <label className={styles.field}>
          <span>{t('kindLabel')}</span>
          <select
            value={query.kind}
            onChange={(event) =>
              setQuery((value) => ({
                ...value,
                kind: event.target.value as NearbySearchInput['kind'],
              }))
            }
          >
            <option value="all">{t('kindAll')}</option>
            <option value="specific_item">{t('kindDishes')}</option>
            <option value="surprise_bag">{t('kindBags')}</option>
          </select>
        </label>
      </form>
      <section ref={mapSection} className={styles.mapSection}>
        <div className={styles.mapTop}>
          <p>{query.center ? t('selectedArea') : t('allVenues')}</p>
          <button
            type="button"
            className={styles.secondary}
            disabled={locating}
            onClick={useLocation}
          >
            {locating ? t('locating') : t('myLocation')}
          </button>
        </div>
        <MapCanvas
          points={points}
          center={query.center}
          selectedId={activeSelectedId}
          onSelect={selectVenue}
          onCenterChange={centerChanged}
          userLocation={userLocation}
          height={290}
          ariaLabel={t('mapLabel')}
        />
        <div className={styles.areaTools}>
          <label className={styles.radius}>
            <span>{t('radius')}</span>
            <select
              value={radius}
              disabled={locating}
              onChange={(event) => {
                const nextRadius = Number(event.target.value)
                setRadius(nextRadius)
                setQuery((value) =>
                  value.center ? { ...value, radiusKm: nextRadius } : value,
                )
              }}
            >
              {[1, 3, 5, 10, 25, 50].map((value) => (
                <option value={value} key={value}>
                  {t('kilometers', { count: value })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.primary}
            disabled={!browseCenter || samePoint(browseCenter, query.center)}
            onClick={() => {
              if (browseCenter) {
                cancelLocationRequest.current()
                setLocating(false)
                setLocationError(null)
                setQuery((value) => ({
                  ...value,
                  center: browseCenter,
                  radiusKm: radius,
                }))
              }
            }}
          >
            {t('searchArea')}
          </button>
        </div>
        <p className={styles.hint}>
          {query.center ? t('distanceHint') : t('mapHint')}
        </p>
        {(query.center || locating) && (
          <button
            type="button"
            className={styles.textButton}
            onClick={clearLocation}
          >
            {t(locating && !query.center ? 'cancelLocation' : 'clearArea')}
          </button>
        )}
        <details className={styles.privacy}>
          <summary>{t('privacyTitle')}</summary>
          <p>{t('privacyHint')}</p>
        </details>
        {locationError && (
          <div className={styles.warning} role="alert">
            <p>{t(locationError)}</p>
            <p>{t('locationFallback')}</p>
          </div>
        )}
      </section>
      <section className={styles.results} aria-busy={loading}>
        <div className={styles.resultHeading}>
          <h2>{t(query.center ? 'resultsTitle' : 'allVenues')}</h2>
          <span role="status">
            {loading
              ? t('loading')
              : data
                ? t('venueCount', { count: data.venues.length })
                : ''}
          </span>
        </div>
        {loading ? (
          <div className={styles.loading} aria-hidden="true">
            <div />
            <div />
          </div>
        ) : current?.error ? (
          <div className={styles.warning} role="alert">
            <p>{errorText(current.error)}</p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('retry')}
            </button>
          </div>
        ) : data ? (
          <>
            {data.truncated && (
              <p className={styles.warning}>{t('truncated')}</p>
            )}
            {data.venues.length === 0 && (
              <div className={styles.empty}>
                <h3>{t('emptyTitle')}</h3>
                <p>{t(query.center ? 'emptyArea' : 'emptySearch')}</p>
                {(query.search || query.kind !== 'all') && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setSearch('')
                      setQuery((value) => ({
                        ...value,
                        search: '',
                        kind: 'all',
                      }))
                    }}
                  >
                    {t('resetFilters')}
                  </button>
                )}
              </div>
            )}
            {data.venues.map((item) => (
              <VenueCard
                key={item.venue.id}
                item={item}
                selected={item.venue.id === activeSelectedId}
                select={() => {
                  setSelectedId(item.venue.id)
                  mapSection.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }}
                cardRef={(element) => {
                  if (element) cards.current.set(item.venue.id, element)
                  else cards.current.delete(item.venue.id)
                }}
                distance={
                  item.distanceKm === null
                    ? null
                    : formatDistance(item.distanceKm)
                }
              />
            ))}
            {data.unlocated.length > 0 && (
              <section className={styles.unlocated}>
                <button
                  type="button"
                  className={styles.unlocatedToggle}
                  aria-expanded={showUnlocated}
                  aria-controls="nearby-unlocated"
                  onClick={() => setShowUnlocated((value) => !value)}
                >
                  <span>{t('unlocatedTitle')}</span>
                  <span>
                    {data.unlocated.length} ·{' '}
                    {t(showUnlocated ? 'hide' : 'show')}
                  </span>
                </button>
                <p className={styles.hint}>{t('unlocatedHint')}</p>
                <div
                  id="nearby-unlocated"
                  className={styles.results}
                  hidden={!showUnlocated}
                >
                  {showUnlocated &&
                    data.unlocated.map((item) => (
                      <VenueCard
                        key={item.venue.id}
                        item={item}
                        distance={null}
                      />
                    ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </section>
    </BuyerShell>
  )
}

function VenueCard({
  item,
  selected = false,
  distance,
  select,
  cardRef,
}: {
  item: NearbyVenue
  selected?: boolean
  distance: string | null
  select?: () => void
  cardRef?: (element: HTMLElement | null) => void
}) {
  const { t } = useNearbyI18n()
  const { formatMoney, formatTime, formatDate } = useI18n()
  const offerText = useOfferText()
  const { venue, offers } = item
  return (
    <article
      ref={cardRef}
      className={`${styles.venueCard} ${selected ? styles.selected : ''}`}
    >
      <div className={styles.venueHeading}>
        <div>
          <h3>
            <Link href={`/venues/${encodeURIComponent(venue.id)}`}>
              {venue.name}
            </Link>
          </h3>
          <p className={styles.address}>{venue.address}</p>
          {distance && <p className={styles.distance}>{distance}</p>}
        </div>
        {select && venue.location && (
          <button
            type="button"
            className={styles.mapButton}
            onClick={select}
            aria-pressed={selected}
            aria-label={t('showVenueOnMap', { name: venue.name })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 21s7-6.4 7-12A7 7 0 0 0 5 9c0 5.6 7 12 7 12Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <circle
                cx="12"
                cy="9"
                r="2.5"
                fill="none"
                stroke="currentColor"
              />
            </svg>
          </button>
        )}
      </div>
      {offers.length === 0 ? (
        <p className={styles.noOffers}>{t('noOffers')}</p>
      ) : (
        <div className={styles.offerList}>
          {offers.map((offer) => {
            const text = offerText(offer)
            return (
              <Link
                key={offer.id}
                href={`/offers/${encodeURIComponent(offer.id)}`}
                className={styles.offer}
              >
                <img src={offer.image} alt="" width="64" height="72" />
                <div>
                  <span className={styles.kind}>
                    {t(offer.kind === 'surprise_bag' ? 'bag' : 'dish')}
                  </span>
                  <h4>{text.title}</h4>
                  <p>
                    {formatDate(offer.pickupStart)} ·{' '}
                    {formatTime(offer.pickupStart)}–
                    {formatTime(offer.pickupEnd)}
                  </p>
                  <p>{t('available', { count: offer.available })}</p>
                </div>
                <strong>{formatMoney(offer.price)}</strong>
              </Link>
            )
          })}
        </div>
      )}
      <DirectionsLink venue={venue} className={styles.venueLink} />
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className={styles.venueLink}
      >
        {t('venuePage')} <span aria-hidden="true">↗</span>
      </Link>
    </article>
  )
}
