export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface LoginResponse {
  code: string
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
