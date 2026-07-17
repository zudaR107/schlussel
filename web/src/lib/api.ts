export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface LoginResponse {
  code: string
}

interface TokenResponse {
  accessToken: string
  user: AuthUser
}

interface RefreshResponse {
  accessToken: string
}

export interface Session {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  current: boolean
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null
    throw new ApiError(res.status, data?.error ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

// Shared by every /auth call the account page makes once it holds a real
// access token (GET /me, PATCH /password, DELETE /account) - unlike
// login/register, these carry a Bearer header instead of (or alongside)
// the session cookie.
async function authed<T>(method: string, path: string, accessToken: string, body?: unknown): Promise<T> {
  const res = await fetch(`/auth${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null
    throw new ApiError(res.status, data?.error ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

// Plain silent-session check, no PKCE involved - used by the account page
// to detect an existing schlussel cookie session on mount, exactly like
// every consumer app's own background refresh (see e.g. kuvert's
// useAuthProvider), just without the codeChallenge branch since this
// never has to hand a token across an origin boundary.
export function refreshSession(): Promise<RefreshResponse> {
  return post<RefreshResponse>('/refresh', {})
}

export function fetchMe(accessToken: string): Promise<AuthUser> {
  return authed<AuthUser>('GET', '/me', accessToken)
}

// Redeems the one-time code from schlussel's own login page (see
// AccountPage's bootstrap) the same way every other consumer app's own
// callback page does - returns the user directly, no separate /me
// round-trip needed.
export function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  return post<TokenResponse>('/token', { code, codeVerifier })
}

export function changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return authed('PATCH', '/password', accessToken, { currentPassword, newPassword })
}

export function deleteAccount(accessToken: string, password: string): Promise<{ ok: true }> {
  return authed('DELETE', '/account', accessToken, { password })
}

export function updateName(accessToken: string, name: string): Promise<AuthUser> {
  return authed<AuthUser>('PATCH', '/name', accessToken, { name })
}

export function listSessions(accessToken: string): Promise<Session[]> {
  return authed<Session[]>('GET', '/sessions', accessToken)
}

export function revokeSession(accessToken: string, id: string): Promise<{ ok: true }> {
  return authed('DELETE', `/sessions/${id}`, accessToken)
}

// "Выйти на всех устройствах" - unlike changePassword, this does not
// leave the calling browser's own session intact.
export function logoutEverywhere(accessToken: string): Promise<{ ok: true }> {
  return authed('DELETE', '/sessions', accessToken)
}

// PKCE handoff: the server issues a short-lived one-time code instead of
// a real token, so the token itself never has to travel through a URL.
export function login(email: string, password: string, codeChallenge: string): Promise<LoginResponse> {
  return post<LoginResponse>('/login', { email, password, codeChallenge, codeChallengeMethod: 'S256' })
}

// The register endpoint only returns the created user, not a session — log
// in right after so the caller gets the same { code } shape login()
// produces, letting both pages share one success/redirect path.
export async function register(email: string, password: string, name: string, codeChallenge: string): Promise<LoginResponse> {
  await post<AuthUser>('/register', { email, password, name })
  return login(email, password, codeChallenge)
}
