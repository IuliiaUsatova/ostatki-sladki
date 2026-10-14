'use client'

import { useOfferText } from '@/entities/offer'
import type {
  AdminSupportDetailResponse,
  Locale,
  SupportResolutionCode,
} from '@/shared/api'
import { api, ApiError } from '@/shared/api'
import { useFrozenAttempt } from '@/shared/lib/frozen-attempt'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSupportI18n } from './i18n'

export type SupportCaseProps = {
  caseId: string
  adminId: string
  refreshRevision: number
  onBack: () => void
  onChanged: () => void
}

const actions = [
  'claim',
  'release',
  'wait',
  'resume',
  'resolve',
  'reopen',
] as const
type Action = (typeof actions)[number]
export const outcomes: SupportResolutionCode[] = [
  'information_provided',
  'agreement_reached',
  'complaint_upheld',
  'complaint_not_upheld',
]
export const languages: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}
type Decision = { code: SupportResolutionCode; texts: Record<Locale, string> }
type Attempt =
  | {
      endpoint: 'messages'
      payload: { message: string; revision: number; idempotencyKey: string }
    }
  | {
      endpoint: 'actions'
      payload: {
        action: Action
        revision: number
        idempotencyKey: string
        resolution?: Decision
      }
    }
const blankTexts = (): Record<Locale, string> => ({ ru: '', kk: '', en: '' })
const validText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length >= 5 &&
  value.trim().length <= 2000

function isAttempt(value: unknown): value is Attempt {
  if (!value || typeof value !== 'object') return false
  const saved = value as Partial<Attempt>
  const payload = saved.payload
  if (
    !payload ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1 ||
    typeof payload.idempotencyKey !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      payload.idempotencyKey,
    )
  )
    return false
  if (saved.endpoint === 'messages')
    return 'message' in payload && validText(payload.message)
  if (
    saved.endpoint !== 'actions' ||
    !('action' in payload) ||
    !actions.includes(payload.action)
  )
    return false
  if (payload.action !== 'resolve') return payload.resolution === undefined
  const resolution = payload.resolution
  return (
    !!resolution &&
    outcomes.includes(resolution.code) &&
    !!resolution.texts &&
    (['ru', 'kk', 'en'] as Locale[]).every((language) =>
      validText(resolution.texts[language]),
    )
  )
}

const knownConflicts = new Set([
  'SUPPORT_REVISION_CONFLICT',
  'SUPPORT_ASSIGNMENT_CONFLICT',
  'SUPPORT_STATE_CONFLICT',
  'SUPPORT_ALREADY_ACTIVE',
  'ISSUE_MESSAGE_LIMIT',
])

export function useSupportCaseController({
  caseId,
  adminId,
  refreshRevision,
  onChanged,
}: SupportCaseProps) {
  const { t, locale, when, error, formatMoney, formatTime, formatDate } =
    useSupportI18n()
  const offerText = useOfferText()
  const [detail, setDetail] = useState<AdminSupportDetailResponse | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [loadFailure, setLoadFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [reply, setReply] = useState('')
  const [failedDraft, setFailedDraft] = useState<Attempt | null>(null)
  const [showResolution, setShowResolution] = useState(false)
  const [outcome, setOutcome] = useState<SupportResolutionCode>(
    'information_provided',
  )
  const [texts, setTexts] = useState(blankTexts)
  const [checked, setChecked] = useState(false)
  const [validation, setValidation] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const requestController = useRef<AbortController | null>(null)
  const lock = useRef(false)
  const appliedRefresh = useRef(refreshRevision)
  const title = useRef<HTMLHeadingElement>(null)
  const original = useFrozenAttempt(
    `support-admin:${adminId}:${caseId}`,
    isAttempt,
  )
  const url = `/api/admin/support/${encodeURIComponent(caseId)}`
  const support = detail?.issue.support ?? null
  const hasDetail = detail !== null
  const owned = support?.assignee?.id === adminId && support.assignee.available
  const closed = support?.status === 'resolved'
  const atLimit = (detail?.issue.messages.length ?? 0) >= 50
  const editable =
    original.ready &&
    !original.attempt &&
    !needsReload &&
    !busy &&
    support !== null
  const canWork = editable && !!owned && !closed
  const canClaim =
    editable && !closed && (!support?.assignee || !support.assignee.available)
  const pendingResolution =
    original.attempt?.endpoint === 'actions' &&
    original.attempt.payload.action === 'resolve'
      ? original.attempt.payload.resolution
      : null
  useEffect(() => {
    const controller = new AbortController()
    requestController.current = controller
    void api<AdminSupportDetailResponse>(url, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        setDetail(result)
        setLoaded(true)
        setLoadFailure(null)
      })
      .catch((value) => {
        if (!controller.signal.aborted) {
          setLoadFailure(value)
          setLoaded(true)
        }
      })
    return () => {
      controller.abort()
      requestController.current?.abort()
    }
  }, [url])
  useEffect(() => {
    if (loaded && hasDetail) title.current?.focus()
  }, [loaded, hasDetail])
  const reload = useCallback(async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    try {
      const result = await api<AdminSupportDetailResponse>(url, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setDetail(result)
      setLoaded(true)
      setLoadFailure(null)
      setFailure(null)
      setNeedsReload(false)
      setChecked(false)
    } catch (value) {
      if (!controller.signal.aborted) {
        setLoadFailure(value)
        setLoaded(true)
        if (value instanceof ApiError && [401, 403, 404].includes(value.status))
          setDetail(null)
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        lock.current = false
      }
    }
  }, [url])
  useEffect(() => {
    if (appliedRefresh.current === refreshRevision) return
    appliedRefresh.current = refreshRevision
    let active = true
    queueMicrotask(() => {
      if (active) void reload()
    })
    return () => {
      active = false
    }
  }, [refreshRevision, reload])
  async function run(make?: (key: string) => Attempt) {
    if (
      lock.current ||
      !loaded ||
      !original.ready ||
      needsReload ||
      (!original.attempt && !make)
    )
      return
    lock.current = true
    setBusy(true)
    setFailure(null)
    setValidation(null)
    setSaved(false)
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    let submitted: Attempt | null = original.attempt
    let committed = false
    try {
      const frozen = original.freeze((key) => make!(key))
      submitted = frozen
      const result = await api<AdminSupportDetailResponse>(
        `${url}/${frozen.endpoint}`,
        {
          method: 'POST',
          body: JSON.stringify(frozen.payload),
          signal: controller.signal,
        },
      )
      if (controller.signal.aborted) return
      committed = true
      original.clear()
      setDetail((current) =>
        !current ||
        (result.issue.support?.revision ?? 0) >=
          (current.issue.support?.revision ?? 0)
          ? result
          : current,
      )
      setReply('')
      setFailedDraft(null)
      setShowResolution(false)
      setTexts(blankTexts())
      setChecked(false)
      setSaved(true)
      setLoaded(true)
      setLoadFailure(null)
      onChanged()
      try {
        const latest = await api<AdminSupportDetailResponse>(url, {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setDetail(latest)
      } catch (value) {
        if (!controller.signal.aborted) setLoadFailure(value)
      }
    } catch (value) {
      if (controller.signal.aborted) return
      if (committed) {
        setLoadFailure(value)
        return
      }
      setFailure(value)
      if (
        value instanceof ApiError &&
        (knownConflicts.has(value.code) ||
          ([400, 413, 415, 422].includes(value.status) &&
            value.code !== 'STORAGE_UNAVAILABLE'))
      ) {
        if (submitted?.endpoint === 'messages') {
          setReply(submitted.payload.message)
          setFailedDraft(submitted)
        } else if (
          submitted?.endpoint === 'actions' &&
          submitted.payload.action === 'resolve' &&
          submitted.payload.resolution
        ) {
          setOutcome(submitted.payload.resolution.code)
          setTexts(submitted.payload.resolution.texts)
          setShowResolution(true)
          setChecked(false)
          setFailedDraft(submitted)
        }
        original.clear()
        if (knownConflicts.has(value.code)) setNeedsReload(true)
      } else if (
        value instanceof ApiError &&
        value.code === 'IDEMPOTENCY_CONFLICT'
      )
        setNeedsReload(true)
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        lock.current = false
      }
    }
  }
  function act(action: Exclude<Action, 'resolve'>) {
    if (!editable || !support) return
    void run((key) => ({
      endpoint: 'actions',
      payload: { action, revision: support.revision, idempotencyKey: key },
    }))
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWork || !support || atLimit) return
    if (!validText(reply)) {
      setValidation('validationMessage')
      return
    }
    void run((key) => ({
      endpoint: 'messages',
      payload: {
        message: reply.trim(),
        revision: support.revision,
        idempotencyKey: key,
      },
    }))
  }
  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWork || !support || !checked) return
    const validOutcomes =
      support.kind === 'complaint' ? outcomes : outcomes.slice(0, 2)
    if (
      !validOutcomes.includes(outcome) ||
      !Object.values(texts).every(validText)
    ) {
      setValidation('validationResolution')
      return
    }
    void run((key) => ({
      endpoint: 'actions',
      payload: {
        action: 'resolve',
        revision: support.revision,
        idempotencyKey: key,
        resolution: {
          code: outcome,
          texts: Object.fromEntries(
            Object.entries(texts).map(([language, text]) => [
              language,
              text.trim(),
            ]),
          ) as Record<Locale, string>,
        },
      },
    }))
  }
  const authFailed = [failure, loadFailure].some(
    (value) => value instanceof ApiError && value.status === 401,
  )
  const savedPreview =
    original.attempt?.endpoint === 'messages'
      ? original.attempt.payload.message
      : original.attempt
        ? t(`action.${original.attempt.payload.action}`)
        : null
  return {
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
  }
}
