import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, lt } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../db/index.js'
import { users, refreshTokens, authCodes, type User } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt.js'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const COOKIE_NAME = 'schloss_refresh'
const AUTH_CODE_MAX_AGE = 60 // seconds

// Injected only by schlussel/web's own proxy (Caddyfile + vite dev config)
// on its /auth/* passthrough - every consumer app's own /auth/* proxy
// (kuvert, schloss) does NOT add this. Trust boundary: schlussel:4000 is
// never published outside the docker network (see docker-compose.yml), so
// this header can't be forged by anything but code we control.
const TRUSTED_ORIGIN_HEADER = 'x-schlussel-frontend'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// PKCE code_challenge is base64url(SHA256(code_verifier)) - always exactly
// 43 characters. code_verifier itself is 43-128 chars per RFC 7636.
const codeChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
})

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
    codeChallenge: codeChallengeSchema.optional(),
    codeChallengeMethod: z.literal('S256').optional(),
  })
  .refine(
    (v) => (v.codeChallenge === undefined) === (v.codeChallengeMethod === undefined),
    { message: 'codeChallenge and codeChallengeMethod must be given together' },
  )

const tokenSchema = z.object({
  code: z.string(),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
})

// Optional body for POST /refresh - lets schlussel's own login page check
// for an existing session before ever showing the credentials form (see
// the /refresh handler below). Every existing caller sends no body at
// all, so this must stay optional and not break that.
const refreshSchema = z
  .object({
    codeChallenge: codeChallengeSchema.optional(),
    codeChallengeMethod: z.literal('S256').optional(),
  })
  .refine(
    (v) => (v.codeChallenge === undefined) === (v.codeChallengeMethod === undefined),
    { message: 'codeChallenge and codeChallengeMethod must be given together' },
  )

// Creates a new refresh token, stores it, and sets it as the httpOnly
// cookie - the session-establishing side effect shared by every path
// below that authenticates a user.
async function establishSession(c: Parameters<typeof setCookieHeader>[0], userId: string): Promise<void> {
  const refreshToken = await signRefreshToken(userId)
  await db.insert(refreshTokens).values({
    id: createId(),
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000),
    createdAt: new Date(),
  })
  setCookieHeader(c, refreshToken)
}

// Issues a real access token plus, if `trusted`, a fresh session cookie -
// shared by the no-PKCE /login branch (always trusted: like the PKCE
// branch above, only ever reachable same-origin) and the /token exchange
// (trusted only per isTrustedOrigin, since it's the one endpoint genuinely
// called through consumer apps' own proxies). Both hand the access token
// straight back in the response body regardless.
async function issueSession(c: Parameters<typeof setCookieHeader>[0], user: User, trusted: boolean) {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
  if (trusted) await establishSession(c, user.id)

  return {
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }
}

// Issues a short-lived one-time PKCE code for a user - shared by the
// password-verified /login branch and the cookie-verified silent-reauth
// branch of /refresh below, so a token never has to travel through a
// redirect URL in either case.
async function issueAuthCode(userId: string, codeChallenge: string): Promise<string> {
  const code = randomBytes(32).toString('base64url')
  await db.insert(authCodes).values({
    id: createId(),
    userId,
    codeHash: hashToken(code),
    codeChallenge,
    expiresAt: new Date(Date.now() + AUTH_CODE_MAX_AGE * 1000),
    createdAt: new Date(),
  })
  return code
}

export const authRouter = new Hono()

authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json')

  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  // First user becomes admin
  const userCount = await db.select().from(users).all()
  const role = userCount.length === 0 ? 'admin' : 'user'

  const user = {
    id: createId(),
    email,
    passwordHash: await hashPassword(password),
    name,
    role: role as 'admin' | 'user',
    createdAt: new Date(),
  }

  await db.insert(users).values(user)

  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role }, 201)
})

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password, codeChallenge } = c.req.valid('json')

  const user = await db.select().from(users).where(eq(users.email, email)).get()
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // PKCE handoff: issue a short-lived one-time code instead of a real
  // token, so the token itself never has to travel through a URL - the
  // caller redeems it at POST /auth/token with the matching verifier.
  // Also establishes a real session here, gated by isTrustedOrigin: this
  // endpoint should only ever be called from schlussel's own hosted login
  // page (never proxied through another service's origin), so the cookie
  // lands on schlussel's own origin and stays there - no cross-subdomain
  // Domain attribute needed. That's what lets the silent-reauth branch of
  // /refresh below skip the credentials form entirely the next time any
  // app redirects here.
  if (codeChallenge) {
    if (isTrustedOrigin(c)) await establishSession(c, user.id)
    const code = await issueAuthCode(user.id, codeChallenge)
    return c.json({ code })
  }

  // No-PKCE branch: like the PKCE branch above, only ever reachable
  // same-origin - always trusted.
  return c.json(await issueSession(c, user, true))
})

authRouter.post('/token', zValidator('json', tokenSchema), async (c) => {
  const { code, codeVerifier } = c.req.valid('json')

  // Lazy cleanup of expired codes - no cron, same as elsewhere on the
  // platform; piggybacks on a request that's already touching this table.
  await db.delete(authCodes).where(lt(authCodes.expiresAt, new Date()))

  const codeHash = hashToken(code)
  const stored = await db.select().from(authCodes).where(eq(authCodes.codeHash, codeHash)).get()
  if (!stored) return c.json({ error: 'Invalid or expired code' }, 400)

  // Single-use: delete before validating further, so a second concurrent
  // redemption attempt with the same code always finds nothing.
  await db.delete(authCodes).where(eq(authCodes.id, stored.id))

  const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const a = Buffer.from(computedChallenge)
  const b = Buffer.from(stored.codeChallenge)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ error: 'Invalid or expired code' }, 400)
  }

  const user = await db.select().from(users).where(eq(users.id, stored.userId)).get()
  if (!user) return c.json({ error: 'Invalid or expired code' }, 400)

  return c.json(await issueSession(c, user, isTrustedOrigin(c)))
})

authRouter.post('/refresh', async (c) => {
  const refreshToken = getCookie(c)
  if (!refreshToken) return c.json({ error: 'No refresh token' }, 401)

  let payload: Awaited<ReturnType<typeof verifyToken>>
  try {
    payload = await verifyToken(refreshToken)
  } catch {
    return c.json({ error: 'Invalid refresh token' }, 401)
  }

  const tokenHash = hashToken(refreshToken)
  const stored = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .get()

  if (!stored || stored.expiresAt < new Date()) {
    return c.json({ error: 'Refresh token expired or not found' }, 401)
  }

  const user = await db.select().from(users).where(eq(users.id, payload.sub)).get()
  if (!user) return c.json({ error: 'User not found' }, 401)

  // Optional silent-reauth: schlussel's own login page calls this with a
  // codeChallenge to check for an existing session (this same cookie,
  // always same-origin there) before ever showing the credentials form.
  // Every other existing caller sends no body, which parses to {} here
  // and falls through to today's plain-refresh behavior unchanged.
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const parsed = refreshSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)

  // Rotate refresh token - deleted unconditionally, re-issued only if
  // trusted (see isTrustedOrigin). An untrusted caller (a consumer app's
  // own proxied /auth/refresh, polling to keep its local state fresh)
  // still gets a valid access token back for whatever cookie it already
  // had, but that cookie is not renewed - it quietly stops working the
  // moment its now-deleted DB row is looked up again, instead of being
  // rotated forever.
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
  const trusted = isTrustedOrigin(c)

  if (parsed.data.codeChallenge) {
    if (trusted) await establishSession(c, user.id)
    const code = await issueAuthCode(user.id, parsed.data.codeChallenge)
    return c.json({ code })
  }

  const newAccessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
  if (trusted) await establishSession(c, user.id)

  return c.json({ accessToken: newAccessToken })
})

authRouter.post('/logout', async (c) => {
  const refreshToken = getCookie(c)
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken)
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
  }
  clearCookie(c)
  return c.json({ ok: true })
})

authRouter.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = await verifyToken(authHeader.slice(7))
    const user = await db.select().from(users).where(eq(users.id, payload.sub)).get()
    if (!user) return c.json({ error: 'User not found' }, 404)
    return c.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// Helpers — cookie management without external deps
function setCookieHeader(c: Parameters<typeof clearCookie>[0], token: string) {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}; SameSite=Strict; Secure`,
  )
}

function clearCookie(c: { header: (name: string, value: string) => void }) {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`,
  )
}

function getCookie(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const cookieHeader = c.req.header('cookie')
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match?.[1] ?? null
}

function isTrustedOrigin(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return c.req.header(TRUSTED_ORIGIN_HEADER) === '1'
}
