import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from '../db/index.js'
import { users, refreshTokens } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt.js'
import { createHash } from 'node:crypto'

const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const COOKIE_NAME = 'schloss_refresh'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

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
  const { email, password } = c.req.valid('json')

  const user = await db.select().from(users).where(eq(users.email, email)).get()
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

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

  return c.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
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
