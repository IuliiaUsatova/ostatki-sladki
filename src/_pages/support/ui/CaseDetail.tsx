'use client'

import {
  languages,
  outcomes,
  useSupportCaseController,
} from '../model/use-support-case-controller'

import { CancellationSummary, OrderTimeline } from '@/entities/order'
import {
  CaseStatus,
  SupportDecision,
  SupportHistory,
} from '@/entities/support-case'
import type { Locale, SupportResolutionCode } from '@/shared/api'
import { supportCasePath } from '@/shared/lib/auth-routing'
import Link from 'next/link'
import styles from './support.module.css'

export default function CaseDetail({
  caseId,
  adminId,
  refreshRevision,
  onBack,
  onChanged,
}: {
  caseId: string
  adminId: string
  refreshRevision: number
  onBack: () => void
  onChanged: () => void
}) {
  const {
    t,
    locale,
    when,
    error,
    formatMoney,
    formatTime,
    formatDate,
    offerText,
    detail,
    loaded,
    failure,
    loadFailure,
    busy,
    needsReload,
    reply,
    setReply,
    failedDraft,
    showResolution,
    setShowResolution,
    outcome,
    setOutcome,
    texts,
    setTexts,
    checked,
    setChecked,
    validation,
    setValidation,
    saved,
    title,
    original,
    support,
    owned,
    closed,
    atLimit,
    editable,
    canWork,
    canClaim,
    pendingResolution,
    reload,
    run,
    act,
    send,
    resolve,
    authFailed,
    savedPreview,
  } = useSupportCaseController({
    caseId,
    adminId,
    refreshRevision,
    onBack,
    onChanged,
  })
  return (
    <div className={styles.caseDetail}>
      <button className={styles.back} onClick={onBack}>
        {t('back')}
      </button>
      {(!loaded || !original.ready) && (
        <p role="status">{t('loadingDetail')}</p>
      )}
      {loadFailure !== null && (
        <div className={styles.error} role="alert">
          <p>{error(loadFailure)}</p>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => void reload()}
          >
            {t('refresh')}
          </button>
        </div>
      )}
      {failure !== null && (
        <div className={styles.error} role="alert">
          <p>{error(failure)}</p>
          {needsReload && (
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => void reload()}
            >
              {t('reloadBeforeRetry')}
            </button>
          )}
        </div>
      )}
      {authFailed && (
        <Link
          className={styles.secondary}
          href={`/login?next=${encodeURIComponent(supportCasePath(caseId))}`}
        >
          {t('signIn')}
        </Link>
      )}
      {saved && (
        <p className={styles.success} role="status">
          {t('saved')}
        </p>
      )}
      {failedDraft && (
        <section className={styles.pending} aria-label={t('unsentDraft')}>
          <h3>{t('unsentDraft')}</h3>
          <p className={styles.messageBody}>
            {failedDraft.endpoint === 'messages'
              ? failedDraft.payload.message
              : failedDraft.payload.resolution?.texts[locale]}
          </p>
        </section>
      )}
      {original.attempt && (
        <section className={styles.pending} aria-label={t('pendingTitle')}>
          <h3>{t('pendingTitle')}</h3>
          <p>{t('pendingHint')}</p>
          <p className={styles.messageBody}>{savedPreview}</p>
          {pendingResolution && (
            <>
              <strong>{t(`resolution.${pendingResolution.code}`)}</strong>
              <p className={styles.messageBody}>
                {pendingResolution.texts[locale]}
              </p>
            </>
          )}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={busy || needsReload || !original.ready || !loaded}
              onClick={() => void run()}
            >
              {t(busy ? 'sending' : 'retryOriginal')}
            </button>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => void reload()}
            >
              {t('refresh')}
            </button>
          </div>
        </section>
      )}
      {loaded && detail && support && (
        <>
          <header className={styles.caseHeader}>
            <div>
              <div className={styles.caseTags}>
                <CaseStatus status={support.status} />
                <span className={styles.kind} data-kind={support.kind}>
                  {t(`kind.${support.kind}`)}
                </span>
              </div>
              <h2 ref={title} tabIndex={-1}>
                {detail.order.number} · {t(`category.${detail.issue.category}`)}
              </h2>
              <p>
                {detail.order.snapshot.venueName} · {detail.order.buyerName}
              </p>
            </div>
            <button
              className={styles.textButton}
              disabled={busy}
              onClick={() => void reload()}
            >
              {t('refresh')}
            </button>
          </header>
          <dl className={styles.caseMeta}>
            <div>
              <dt>{t('reporter')}</dt>
              <dd>
                {support.reporterName} · {t(`role.${support.reporterRole}`)}
              </dd>
            </div>
            <div>
              <dt>{t('assignee')}</dt>
              <dd>{support.assignee?.name ?? t('unassigned')}</dd>
            </div>
            <div>
              <dt>{t('created')}</dt>
              <dd>{when(support.createdAt)}</dd>
            </div>
            <div>
              <dt>{t('updated')}</dt>
              <dd>{when(support.updatedAt)}</dd>
            </div>
          </dl>
          {support.resolution && (
            <SupportDecision resolution={support.resolution} />
          )}
          <div className={styles.caseControls}>
            {canClaim && (
              <button className={styles.primary} onClick={() => act('claim')}>
                {t(support.assignee ? 'takeOver' : 'action.claim')}
              </button>
            )}
            {closed && (
              <>
                <p>{t('resolvedHint')}</p>
                <button
                  className={styles.secondary}
                  disabled={!editable}
                  onClick={() => act('reopen')}
                >
                  {t('action.reopen')}
                </button>
              </>
            )}
            {!closed &&
              support.assignee &&
              !owned &&
              support.assignee.available && <p>{t('assignedElsewhere')}</p>}
            {!closed && !support.assignee && <p>{t('takeFirst')}</p>}
            {owned && !closed && (
              <div className={styles.actions}>
                <button
                  className={styles.secondary}
                  disabled={!editable}
                  onClick={() =>
                    act(support.status === 'waiting' ? 'resume' : 'wait')
                  }
                >
                  {t(
                    support.status === 'waiting'
                      ? 'action.resume'
                      : 'action.wait',
                  )}
                </button>
                <button
                  className={styles.secondary}
                  disabled={!editable}
                  onClick={() => act('release')}
                >
                  {t('action.release')}
                </button>
                <button
                  className={styles.primary}
                  disabled={!editable}
                  onClick={() => {
                    setShowResolution(true)
                    setValidation(null)
                    setChecked(false)
                  }}
                >
                  {t('action.resolve')}
                </button>
              </div>
            )}
          </div>
          <section className={styles.conversation}>
            <h3>{t('discussion')}</h3>
            <ol className={styles.messages}>
              {detail.issue.messages.map((message) => (
                <li
                  key={message.id}
                  className={styles.message}
                  data-role={message.authorRole}
                >
                  <div className={styles.messageMeta}>
                    <strong>
                      {t(`role.${message.authorRole}`)} · {message.authorName}
                    </strong>
                    <time dateTime={message.createdAt}>
                      {when(message.createdAt)}
                    </time>
                  </div>
                  <p className={styles.messageBody}>{message.body}</p>
                </li>
              ))}
            </ol>
            <p className={styles.muted}>{t('originalLanguage')}</p>
          </section>
          {owned && !closed && !showResolution && (
            <>
              {atLimit ? (
                <p className={styles.notice}>{t('messageLimit')}</p>
              ) : (
                <form onSubmit={send} className={styles.replyForm}>
                  <label className={styles.field}>
                    {t('replyLabel')}
                    <textarea
                      value={
                        original.attempt?.endpoint === 'messages'
                          ? original.attempt.payload.message
                          : reply
                      }
                      onChange={(event) => setReply(event.target.value)}
                      minLength={5}
                      maxLength={2000}
                      rows={4}
                      required
                      disabled={!canWork}
                    />
                  </label>
                  <p className={styles.muted}>{t('replyHint')}</p>
                  <p className={styles.muted}>{t('replyWaiting')}</p>
                  <button
                    className={styles.primary}
                    disabled={!canWork}
                    type="submit"
                  >
                    {t(busy ? 'sending' : 'send')}
                  </button>
                </form>
              )}
            </>
          )}
          {showResolution && owned && !closed && (
            <form onSubmit={resolve} className={styles.resolutionForm}>
              <h3>{t('resolutionTitle')}</h3>
              <label className={styles.field}>
                {t('resolutionLabel')}
                <select
                  value={outcome}
                  disabled={!canWork}
                  onChange={(event) =>
                    setOutcome(event.target.value as SupportResolutionCode)
                  }
                >
                  {(support.kind === 'complaint'
                    ? outcomes
                    : outcomes.slice(0, 2)
                  ).map((code) => (
                    <option key={code} value={code}>
                      {t(`resolution.${code}`)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset disabled={!canWork} className={styles.resolutionFields}>
                <legend>{t('resolutionTexts')}</legend>
                <p className={styles.muted}>{t('resolutionHint')}</p>
                {(['ru', 'kk', 'en'] as Locale[]).map((language) => (
                  <label key={language} className={styles.field}>
                    {languages[language]}
                    <textarea
                      lang={language}
                      value={texts[language]}
                      required
                      minLength={5}
                      maxLength={2000}
                      rows={3}
                      onChange={(event) =>
                        setTexts((current) => ({
                          ...current,
                          [language]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </fieldset>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canWork}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                {t('resolutionCheck')}
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={!canWork || !checked}
                >
                  {t(busy ? 'sending' : 'resolutionSubmit')}
                </button>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={busy || !!original.attempt}
                  onClick={() => {
                    setShowResolution(false)
                    setValidation(null)
                  }}
                >
                  {t('cancelResolution')}
                </button>
              </div>
            </form>
          )}
          {validation && (
            <p className={styles.error} role="alert">
              {t(validation)}
            </p>
          )}
          <details className={styles.orderFacts}>
            <summary>{t('order')}</summary>
            <dl className={styles.caseMeta}>
              <div>
                <dt>{t('orderState')}</dt>
                <dd>{t(`order.${detail.order.status}`)}</dd>
              </div>
              <div>
                <dt>{t('total')}</dt>
                <dd>{formatMoney(detail.order.total)}</dd>
              </div>
              <div className={styles.wide}>
                <dt>{t('contents')}</dt>
                <dd>
                  {offerText(detail.order.snapshot).title} ×{' '}
                  {detail.order.quantity}
                </dd>
              </div>
              <div className={styles.wide}>
                <dt>{t('venue')}</dt>
                <dd>
                  {detail.order.snapshot.venueName} ·{' '}
                  {detail.order.snapshot.address}
                </dd>
              </div>
              <div className={styles.wide}>
                <dt>{t('pickupWindow')}</dt>
                <dd>
                  {formatDate(detail.order.snapshot.pickupStart)} ·{' '}
                  {formatTime(detail.order.snapshot.pickupStart)}–
                  {formatDate(detail.order.snapshot.pickupEnd)}{' '}
                  {formatTime(detail.order.snapshot.pickupEnd)}
                </dd>
              </div>
              <div className={styles.wide}>
                <dt>{t('guarantee')}</dt>
                <dd>{offerText(detail.order.snapshot).guarantee}</dd>
              </div>
              <div className={styles.wide}>
                <dt>{t('allergies')}</dt>
                <dd>
                  {offerText(detail.order.snapshot).allergens.join(', ') ||
                    t('unknownAllergens')}
                </dd>
              </div>
            </dl>
          </details>
          <CancellationSummary order={detail.order} />
          <OrderTimeline order={detail.order} />
          <SupportHistory support={support} />
        </>
      )}
    </div>
  )
}
