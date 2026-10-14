'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type {
  VenueApplication,
  VenueApplicationResponse,
  VenueDetails,
} from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { ApplicationHistory, ApplicationStatus } from '@/entities/venue'
import { applicationMessages } from '../model/applicationMessages'
import { applicationStyles as styles } from '@/shared/ui/application-layout'

type VenueCoreDetails = Pick<
  VenueDetails,
  'name' | 'address' | 'description' | 'contactPhone'
>

function useApplicationI18n() {
  const { locale, formatDate, formatTime } = useI18n()
  const t = (key: string) =>
    applicationMessages[locale][key] ?? applicationMessages.en[key] ?? key
  return {
    locale,
    t,
    when: (at: string) => `${formatDate(at)}, ${formatTime(at)}`,
    error: (value: unknown) =>
      value instanceof ApiError && value.code === 'MODERATION_CONFLICT'
        ? t('conflict')
        : value instanceof ApiError &&
            (value.status === 0 || value.status >= 500)
          ? t('unknown')
          : value instanceof ApiError && value.status === 400
            ? t('invalid')
            : t('generic'),
  }
}

export default function ApplicationPanel({
  onChanged,
}: {
  onChanged: () => void
}) {
  const { t, error } = useApplicationI18n()
  const resource = useResource<VenueApplicationResponse>(
    '/api/merchant/application',
  )
  const reloadResource = resource.reload
  useEffect(() => {
    window.addEventListener('focus', reloadResource)
    return () => window.removeEventListener('focus', reloadResource)
  }, [reloadResource])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const reload = () => {
    resource.reload()
    setRefreshVersion((value) => value + 1)
    setSubmitted(false)
    onChanged()
  }
  const saved = () => {
    resource.reload()
    setSubmitted(true)
    onChanged()
  }
  if (resource.loading) return <p role="status">{t('loading')}</p>
  if (!resource.data)
    return (
      <section className={styles.error} role="alert">
        <p>{error(resource.error)}</p>
        <button className={styles.secondary} onClick={reload}>
          {t('retry')}
        </button>
      </section>
    )
  const application = resource.data.application
  return (
    <>
      {submitted && (
        <div className={styles.success} role="status">
          {t('saved')}
        </div>
      )}
      <ApplicationForm
        key={`${application.id}:${application.revision}:${refreshVersion}`}
        application={application}
        onReload={reload}
        onSaved={saved}
      />
    </>
  )
}

function ApplicationForm({
  application,
  onReload,
  onSaved,
}: {
  application: VenueApplication
  onReload: () => void
  onSaved: () => void
}) {
  const { t, locale, when, error } = useApplicationI18n()
  const [fields, setFields] = useState<VenueCoreDetails>({
    name: application.name,
    address: application.address,
    description: application.description,
    contactPhone: application.contactPhone,
  })
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [current, setCurrent] = useState(application)
  const needsReload =
    failure instanceof ApiError &&
    (failure.code === 'MODERATION_CONFLICT' ||
      failure.status === 0 ||
      failure.status >= 500)
  const changed = Object.keys(fields).some(
    (key) =>
      fields[key as keyof VenueCoreDetails].trim() !==
      current[key as keyof VenueCoreDetails],
  )
  const editable = !busy && !needsReload
  function update(key: keyof VenueCoreDetails, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      busy ||
      !checked ||
      needsReload ||
      (!changed && current.status === 'approved')
    )
      return
    setBusy(true)
    setFailure(null)
    try {
      const result = await api<VenueApplicationResponse>(
        '/api/merchant/application',
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...fields,
            expectedRevision: current.revision,
          }),
        },
      )
      setCurrent(result.application)
      setChecked(false)
      setFields({
        name: result.application.name,
        address: result.application.address,
        description: result.application.description,
        contactPhone: result.application.contactPhone,
      })
      onSaved()
    } catch (value) {
      setFailure(value)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.panel}>
      <section className={styles.statusPanel}>
        <ApplicationStatus status={current.status} />
        <h2>{t(current.status)}</h2>
        <p>{t(`${current.status}Text`)}</p>
        {current.reasons && (
          <div className={styles.reviewMessage}>
            <strong>{t('reviewMessage')}</strong>
            <p>{current.reasons[locale]}</p>
          </div>
        )}
      </section>
      <div className={styles.formLayout}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHeading}>
            <h2>{t('details')}</h2>
            <p>{t('intro')}</p>
          </div>
          <fieldset disabled={!editable} className={styles.fields}>
            <label className={styles.field}>
              {t('name')}
              <input
                value={fields.name}
                onChange={(event) => update('name', event.target.value)}
                required
                minLength={2}
                maxLength={120}
                autoComplete="organization"
              />
            </label>
            <label className={styles.field}>
              {t('address')}
              <input
                value={fields.address}
                onChange={(event) => update('address', event.target.value)}
                required
                minLength={5}
                maxLength={300}
                autoComplete="street-address"
              />
            </label>
            <label className={styles.field}>
              {t('description')}
              <textarea
                value={fields.description}
                onChange={(event) => update('description', event.target.value)}
                required
                minLength={20}
                maxLength={1500}
                rows={5}
              />
            </label>
            <label className={styles.field}>
              {t('phone')}
              <input
                type="tel"
                value={fields.contactPhone}
                onChange={(event) => update('contactPhone', event.target.value)}
                required
                minLength={8}
                maxLength={30}
                autoComplete="tel"
              />
              <span>{t('phoneHint')}</span>
            </label>
          </fieldset>
          <aside className={styles.reviewWarning}>
            <p>{t('reviewWarning')}</p>
          </aside>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!editable}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {t('reviewConfirm')}
          </label>
          {failure !== null && (
            <div className={styles.error} role="alert">
              {error(failure)}
            </div>
          )}
          <div className={styles.actions}>
            {needsReload ? (
              <button
                className={styles.primary}
                type="button"
                onClick={onReload}
              >
                {t('refresh')}
              </button>
            ) : (
              <button
                className={styles.primary}
                disabled={
                  busy ||
                  !checked ||
                  (!changed && current.status === 'approved')
                }
                type="submit"
              >
                {t(busy ? 'saving' : 'submit')}
              </button>
            )}
          </div>
        </form>
        <aside className={styles.context}>
          <h3>{t('owner')}</h3>
          <p>{current.owner.name}</p>
          <dl>
            <div>
              <dt>{t('email')}</dt>
              <dd>{current.owner.email ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('revision')}</dt>
              <dd>{current.revision}</dd>
            </div>
            <div>
              <dt>{t('updated')}</dt>
              <dd>{when(current.updatedAt)}</dd>
            </div>
          </dl>
          <button className={styles.secondary} type="button" onClick={onReload}>
            {t('refresh')}
          </button>
        </aside>
      </div>
      <ApplicationHistory application={current} />
    </div>
  )
}
