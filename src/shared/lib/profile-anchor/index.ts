export function subscribeProfileAnchor(onChange: () => void): () => void {
  const target = window
  target.addEventListener('hashchange', onChange)
  return () => target.removeEventListener('hashchange', onChange)
}

export function emailPreferencesAnchorSnapshot(): boolean {
  return window.location.hash === '#email-updates'
}

export function profileAnchorServerSnapshot(): boolean {
  return false
}
