'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeoPoint } from '../../api/index.transport'
import { useI18n } from '@/shared/i18n'
import { mapMessages } from './messages'
import styles from './map.module.css'

export interface MapPoint {
  id: string
  name: string
  location: GeoPoint
}
interface Props {
  points: MapPoint[]
  center?: GeoPoint | null
  selectedId?: string | null
  onSelect?: (id: string) => void
  onCenterChange?: (point: GeoPoint) => void
  onPick?: (point: GeoPoint) => void
  userLocation?: GeoPoint | null
  disabled?: boolean
  height?: number
  ariaLabel: string
}
type Ready = {
  library: typeof Leaflet
  map: Leaflet.Map
  markers: Leaflet.LayerGroup
  user: Leaflet.LayerGroup
  tiles: Leaflet.TileLayer
}
// A map view of Almaty, never a claim about the visitor's position.
const cityCenter: GeoPoint = { latitude: 43.2389, longitude: 76.8897 }
const latLng = (point: GeoPoint): Leaflet.LatLngTuple => [
  point.latitude,
  point.longitude,
]

export default function MapCanvas({
  points,
  center,
  selectedId,
  onSelect,
  onCenterChange,
  onPick,
  userLocation,
  disabled = false,
  height = 320,
  ariaLabel,
}: Props) {
  const { locale } = useI18n()
  const t = (key: string) =>
    mapMessages[locale][key] ?? mapMessages.en[key] ?? key
  const container = useRef<HTMLDivElement>(null)
  const descriptionId = useId()
  const [visible, setVisible] = useState(false)
  const [manualLoad, setManualLoad] = useState(false)
  const [ready, setReady] = useState<Ready | null>(null)
  const [failed, setFailed] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const positioned = useRef(false)
  const markerById = useRef(new Map<string, Leaflet.Marker>())
  const initialView = useRef({ point: cityCenter, known: false })
  useEffect(() => {
    initialView.current = {
      point: center ?? points[0]?.location ?? cityCenter,
      known: !!center || points.length > 0,
    }
  }, [center, points])
  const callbacks = useRef({ onSelect, onCenterChange, onPick, disabled })
  useEffect(() => {
    callbacks.current = { onSelect, onCenterChange, onPick, disabled }
  }, [onSelect, onCenterChange, onPick, disabled])

  useEffect(() => {
    const element = container.current
    if (!element) return
    if (!('IntersectionObserver' in window)) {
      let active = true
      queueMicrotask(() => {
        if (active) setManualLoad(true)
      })
      return () => {
        active = false
      }
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let active = true
    let instance: Leaflet.Map | null = null
    let observer: ResizeObserver | null = null
    void import('leaflet')
      .then((imported) => {
        if (!active || !container.current) return
        const library = imported.default ?? imported
        const map = library.map(container.current, {
          zoomControl: false,
          scrollWheelZoom: false,
          worldCopyJump: true,
          minZoom: 3,
          maxZoom: 18,
        })
        instance = map
        map.setView(latLng(initialView.current.point), 13)
        map.attributionControl.setPrefix(false)
        const tiles = library
          .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
            referrerPolicy: 'strict-origin-when-cross-origin',
          })
          .addTo(map)
        tiles.on('tileerror', () => {
          if (active) setTilesFailed(true)
        })
        const markers = library.layerGroup().addTo(map)
        const user = library.layerGroup().addTo(map)
        map.on('moveend', () => {
          const current = map.getCenter().wrap()
          callbacks.current.onCenterChange?.({
            latitude: Math.max(-85.05112, Math.min(85.05112, current.lat)),
            longitude: current.lng,
          })
        })
        map.on('click', (event: Leaflet.LeafletMouseEvent) => {
          if (callbacks.current.disabled) return
          const point = event.latlng.wrap()
          callbacks.current.onPick?.({
            latitude: Math.max(
              -85.05112,
              Math.min(85.05112, Number(point.lat.toFixed(5))),
            ),
            longitude: Number(point.lng.toFixed(5)),
          })
        })
        observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
        observer.observe(container.current)
        positioned.current = initialView.current.known
        callbacks.current.onCenterChange?.(initialView.current.point)
        setReady({ library, map, markers, user, tiles })
        setFailed(false)
        setTilesFailed(false)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      observer?.disconnect()
      instance?.remove()
    }
  }, [retry, visible])

  useEffect(() => {
    if (!ready) return
    if (center) {
      ready.map.setView(latLng(center), ready.map.getZoom(), { animate: false })
      positioned.current = true
    }
  }, [ready, center])

  useEffect(() => {
    if (!ready) return
    const { library, markers } = ready
    const registry = markerById.current
    markers.clearLayers()
    registry.clear()
    for (const point of points) {
      const marker = library.marker(latLng(point.location), {
        title: point.name,
        alt: point.name,
        keyboard: !!callbacks.current.onSelect,
        bubblingMouseEvents: false,
        icon: library.divIcon({
          className: styles.pin,
          html: '<span aria-hidden="true"></span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
      const label = document.createElement('span')
      label.textContent = point.name
      marker.bindTooltip(label, { direction: 'top', offset: [0, -15] })
      marker.on('click', () => {
        if (!callbacks.current.disabled) callbacks.current.onSelect?.(point.id)
      })
      markers.addLayer(marker)
      registry.set(point.id, marker)
      const element = marker.getElement()
      if (element) {
        element.setAttribute(
          'role',
          callbacks.current.onSelect ? 'button' : 'img',
        )
        element.setAttribute('aria-label', point.name)
        element.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          if (!callbacks.current.disabled)
            callbacks.current.onSelect?.(point.id)
        })
      }
    }
    return () => {
      markers.clearLayers()
      registry.clear()
    }
  }, [ready, points])

  useEffect(() => {
    if (!ready) return
    const { map } = ready
    for (const [id, marker] of markerById.current) {
      marker
        .getElement()
        ?.classList.toggle(styles.pinSelected, id === selectedId)
    }
    if (!center && !positioned.current && points[0]) {
      map.setView(latLng(points[0].location), 13, { animate: false })
      positioned.current = true
    }
    const selected = points.find((point) => point.id === selectedId)
    if (selected && !map.getBounds().contains(latLng(selected.location)))
      map.panTo(latLng(selected.location), { animate: false })
  }, [ready, points, selectedId, center])

  useEffect(() => {
    if (!ready) return
    ready.user.clearLayers()
    if (userLocation)
      ready.library
        .circleMarker(latLng(userLocation), {
          radius: 7,
          weight: 3,
          color: '#fff',
          fillColor: '#3265ae',
          fillOpacity: 1,
        })
        .bindTooltip(mapMessages[locale].userLocation)
        .addTo(ready.user)
    return () => {
      ready.user.clearLayers()
    }
  }, [ready, userLocation, locale])

  return (
    <div className={styles.shell}>
      <div className={styles.frame} style={{ height }}>
        <div
          ref={container}
          className={styles.canvas}
          data-picking={!!onPick && !disabled}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
        />
        {manualLoad && !visible && (
          <div className={styles.loading}>
            <button
              type="button"
              className={styles.manual}
              onClick={() => {
                setVisible(true)
                setManualLoad(false)
              }}
            >
              {t('openMap')}
            </button>
          </div>
        )}
        {!manualLoad && !ready && !failed && (
          <p className={styles.loading} role="status">
            {t('loading')}
          </p>
        )}
        {ready && (
          <div className={styles.controls}>
            <button
              type="button"
              aria-label={t('zoomIn')}
              disabled={disabled}
              onClick={() => ready.map.zoomIn()}
            >
              +
            </button>
            <button
              type="button"
              aria-label={t('zoomOut')}
              disabled={disabled}
              onClick={() => ready.map.zoomOut()}
            >
              −
            </button>
          </div>
        )}
      </div>
      {failed && (
        <div className={styles.notice} role="alert">
          <p>{t('unavailable')}</p>
          <button
            type="button"
            onClick={() => {
              setReady(null)
              setFailed(false)
              setRetry((value) => value + 1)
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {tilesFailed && (
        <div className={styles.notice} role="status">
          <p>{t('tilesUnavailable')}</p>
          <button
            type="button"
            onClick={() => {
              setTilesFailed(false)
              ready?.tiles.redraw()
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {onPick && !disabled && <p className={styles.hint}>{t('pickHint')}</p>}
      <p id={descriptionId} className={styles.hint}>
        {t('keyboard')}
      </p>
      <div className={`${styles.hint} ${styles.footer}`}>
        <span>{t('dataHint')}</span>
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('mapIssue')}
        </a>
      </div>
    </div>
  )
}
