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

// Unset by default (host-only cookie, today's behavior) - set to the
// platform's apex domain (e.g. "localhost" or "example.com") so the
// refresh cookie is valid across every subdomain behind the gateway
// (schloss/auth/kuvert), not just whichever one happened to proxy the
// /auth/token or /auth/refresh call that set it. Without this, a session
// started on one service doesn't carry over to another.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN

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

// Issues a real access/refresh token pair for a user and sets the refresh
// cookie - shared by the no-PKCE /login branch and the /token exchange.
async function issueSession(c: Parameters<typeof setCookieHeader>[0], user: User) {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
  const refreshToken = await signRefreshToken(user.id)

  await db.insert(refreshTokens).values({
    id: createId(),
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000),
    createdAt: new Date(),
  })

  setCookieHeader(c, refreshToken)

  return {
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }
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
  if (codeChallenge) {
    const code = randomBytes(32).toString('base64url')
    await db.insert(authCodes).values({
      id: createId(),
      userId: user.id,
      codeHash: hashToken(code),
      codeChallenge,
      expiresAt: new Date(Date.now() + AUTH_CODE_MAX_AGE * 1000),
      createdAt: new Date(),
    })
    return c.json({ code })
  }

  return c.json(await issueSession(c, user))
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

  return c.json(await issueSession(c, user))
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

  // Rotate refresh token
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))

  const newAccessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
  const newRefreshToken = await signRefreshToken(user.id)

  await db.insert(refreshTokens).values({
    id: createId(),
    userId: user.id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000),
    createdAt: new Date(),
  })

  setCookieHeader(c, newRefreshToken)

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
  const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : ''
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}; SameSite=Strict; Secure${domain}`,
  )
}

function clearCookie(c: { header: (name: string, value: string) => void }) {
  const domain = COOKIE_DOMAIN ? `; Domain=${COOKIE_DOMAIN}` : ''
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure${domain}`,
  )
}

function getCookie(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const cookieHeader = c.req.header('cookie')
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match?.[1] ?? null
}
