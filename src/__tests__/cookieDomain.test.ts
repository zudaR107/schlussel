/**
 * Integration tests for the optional COOKIE_DOMAIN behavior on the
 * schloss_refresh cookie — COOKIE_DOMAIN unset (default) case.
 *
 * Behavioral spec under test:
 *   - When COOKIE_DOMAIN is unset, every Set-Cookie for schloss_refresh
 *     (set on register/login/refresh, cleared on logout) must NOT contain
 *     a `Domain=` attribute (host-only cookie, today's default behavior).
 *
 * The COOKIE_DOMAIN=localhost case lives in cookieDomain.set.test.ts as a
 * *separate file*: probing showed the server reads COOKIE_DOMAIN once at
 * module-load time (like DATABASE_PATH/KEYS_DIR/JWT_ISSUER in the other
 * integration test files), not per-request, so it must be set before the
 * dynamic import of ../routes/auth.js in its own beforeAll — flipping
 * process.env.COOKIE_DOMAIN mid-file/mid-test has no effect once the
 * module has already loaded.
 *
 * Follows the same isolation strategy as auth.integration.test.ts /
 * pkce.integration.test.ts: env vars set before any dynamic imports, a
 * fresh temp SQLite file per test file, tables wiped in beforeEach, and a
 * manually-assembled Hono app in beforeAll.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import type { Hono } from 'hono'

// ── Isolated environment ────────────────────────────────────────────────────
const testId = randomUUID().slice(0, 8)
const DB_PATH = join(tmpdir(), `schlussel-cookiedomain-test-${testId}.db`)
const KEYS_DIR = join(tmpdir(), `schlussel-cookiedomain-keys-${testId}`)
const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations', import.meta.url))

process.env['DATABASE_PATH'] = DB_PATH
process.env['KEYS_DIR'] = KEYS_DIR
process.env['JWT_ISSUER'] = 'schlussel'
// COOKIE_DOMAIN intentionally left unset for this whole file.
delete process.env['COOKIE_DOMAIN']

// ── Module handles populated in beforeAll ───────────────────────────────────
let app: Hono
let sqlite: import('better-sqlite3').Database

// ── Setup / teardown ────────────────────────────────────────────────────────
beforeAll(async () => {
  mkdirSync(KEYS_DIR, { recursive: true })

  const [keysModule, authModule, dbModule, migratorModule, honoModule] =
    await Promise.all([
      import('../utils/keys.js'),
      import('../routes/auth.js'),
      import('../db/index.js'),
      import('drizzle-orm/better-sqlite3/migrator'),
      import('hono'),
    ])

  const { initKeys } = keysModule
  const { authRouter } = authModule
  const { db, sqlite: sqliteInstance } = dbModule
  const { migrate } = migratorModule
  const { Hono } = honoModule

  sqlite = sqliteInstance

  await initKeys()
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  const testApp = new Hono()
  testApp.route('/auth', authRouter)

  app = testApp
})

beforeEach(() => {
  // Delete child rows first to satisfy FK, then parent.
  sqlite.exec('DELETE FROM refresh_tokens')
  sqlite.exec('DELETE FROM users')
})

afterAll(() => {
  delete process.env['COOKIE_DOMAIN']
  try { sqlite?.close() } catch { /* ignore */ }
  try { rmSync(DB_PATH) } catch { /* ignore */ }
  try { rmSync(KEYS_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
})

// ── Helpers ──────────────────────────────────────────────────────────────────
const JSON_HEADERS = { 'Content-Type': 'application/json' }

function post(path: string, body: unknown, extraHeaders?: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  })
}

async function registerUser(
  email = 'alice@example.com',
  password = 'password123',
  name = 'Alice',
) {
  return post('/auth/register', { email, password, name })
}

async function loginUser(email = 'alice@example.com', password = 'password123') {
  return post('/auth/login', { email, password })
}

/** Returns the raw Set-Cookie string for the named cookie, or null. */
function getRawCookie(res: Response, cookieName: string): string | null {
  const cookies = res.headers.getSetCookie()
  return cookies.find((c) => c.startsWith(`${cookieName}=`)) ?? null
}

/** Returns the value of the named cookie from a Response, or null. */
function getCookieValue(res: Response, cookieName: string): string | null {
  const cookies = res.headers.getSetCookie()
  for (const cookie of cookies) {
    const nameValue = cookie.split(';')[0]?.trim() ?? ''
    if (nameValue.startsWith(`${cookieName}=`)) {
      return nameValue.slice(cookieName.length + 1)
    }
  }
  return null
}

// ── COOKIE_DOMAIN unset (default / regression) ──────────────────────────────

describe('schloss_refresh Set-Cookie — COOKIE_DOMAIN unset', () => {
  beforeEach(async () => {
    await registerUser()
  })

  it('login: does NOT include a Domain= attribute', async () => {
    const res = await loginUser()
    expect(res.status).toBe(200)
    const raw = getRawCookie(res, 'schloss_refresh')
    expect(raw).not.toBeNull()
    expect(raw).not.toMatch(/;\s*Domain=/i)
  })

  it('login: still carries the other required attributes (HttpOnly; Path=/; SameSite=Strict; Secure)', async () => {
    const res = await loginUser()
    const raw = getRawCookie(res, 'schloss_refresh') ?? ''
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/Path=\//)
    expect(raw).toMatch(/SameSite=Strict/i)
    expect(raw).toMatch(/Secure/i)
  })

  it('register: schloss_refresh Set-Cookie (if present) does NOT include a Domain= attribute', async () => {
    const res = await post('/auth/register', {
      email: 'carol@example.com',
      password: 'password123',
      name: 'Carol',
    })
    expect(res.status).toBe(201)
    const raw = getRawCookie(res, 'schloss_refresh')
    if (raw !== null) {
      expect(raw).not.toMatch(/;\s*Domain=/i)
    }
  })

  it('refresh: new Set-Cookie does NOT include a Domain= attribute', async () => {
    const loginRes = await loginUser()
    const refreshTokenCookie = getCookieValue(loginRes, 'schloss_refresh') ?? ''
    expect(refreshTokenCookie.length).toBeGreaterThan(0)

    const res = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `schloss_refresh=${refreshTokenCookie}` },
    })
    expect(res.status).toBe(200)
    const raw = getRawCookie(res, 'schloss_refresh')
    expect(raw).not.toBeNull()
    expect(raw).not.toMatch(/;\s*Domain=/i)
  })

  it('logout: the clearing Set-Cookie does NOT include a Domain= attribute', async () => {
    const loginRes = await loginUser()
    const refreshTokenCookie = getCookieValue(loginRes, 'schloss_refresh') ?? ''
    expect(refreshTokenCookie.length).toBeGreaterThan(0)

    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: { Cookie: `schloss_refresh=${refreshTokenCookie}` },
    })
    const raw = getRawCookie(res, 'schloss_refresh')
    expect(raw).not.toBeNull()
    expect(raw).not.toMatch(/;\s*Domain=/i)
    // Sanity: this Set-Cookie is indeed the clearing one.
    expect(raw).toMatch(/Max-Age=0/i)
  })
})
