// Open-redirect guard: `return_to` drives a client-side redirect carrying an
// access token in the URL fragment, so its origin must be checked against a
// build-time allowlist before it's ever used. There is no server in this
// loop to do the check instead.
const ALLOWED_ORIGINS: string[] = ((import.meta.env.VITE_ALLOWED_RETURN_ORIGINS as string | undefined) ?? '')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean)

export type ReturnToResult =
  | { present: false }
  | { present: true; valid: true; url: string }
  | { present: true; valid: false; url: string }

export function readReturnTo(search: string = window.location.search): ReturnToResult {
  const params = new URLSearchParams(search)
  const returnTo = params.get('return_to')
  if (!returnTo) return { present: false }

  try {
    const parsed = new URL(returnTo)
    if (ALLOWED_ORIGINS.includes(parsed.origin)) {
      return { present: true, valid: true, url: returnTo }
    }
    return { present: true, valid: false, url: returnTo }
  } catch {
    return { present: true, valid: false, url: returnTo }
  }
}

export function redirectWithToken(returnTo: string, accessToken: string) {
  window.location.href = `${returnTo}#token=${accessToken}`
}

export function withReturnTo(path: string, search: string = window.location.search): string {
  const params = new URLSearchParams(search)
  const returnTo = params.get('return_to')
  if (!returnTo) return path
  return `${path}?return_to=${encodeURIComponent(returnTo)}`
}
