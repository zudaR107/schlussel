/**
 * Unit tests for RSA key management utilities (src/utils/keys.ts).
 *
 * Isolation: a dedicated temp directory is used for every run so these tests
 * never touch the real ./data/keys directory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const testId = randomUUID().slice(0, 8)
const KEYS_DIR = join(tmpdir(), `schlussel-keys-unit-${testId}`)

// Set env before any project module loads
process.env['KEYS_DIR'] = KEYS_DIR
process.env['JWT_ISSUER'] = 'schlussel'

let initKeys: () => Promise<void>
let getJwks: () => { keys: Record<string, unknown>[] }

beforeAll(async () => {
  mkdirSync(KEYS_DIR, { recursive: true })
  const m = await import('../utils/keys.js')
  initKeys = m.initKeys
  getJwks = m.getJwks
  await initKeys()
})

afterAll(() => {
  try { rmSync(KEYS_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('initKeys', () => {
  it('creates key files in KEYS_DIR', () => {
    const files = readdirSync(KEYS_DIR)
    expect(files.length).toBeGreaterThan(0)
  })

  it('creates a private key file', () => {
    const files = readdirSync(KEYS_DIR)
    const hasPrivate = files.some(
      (f) => f.toLowerCase().includes('private') || f.endsWith('.pem') || f.endsWith('.key'),
    )
    expect(hasPrivate).toBe(true)
  })

  it('is idempotent — calling it again does not throw', async () => {
    await expect(initKeys()).resolves.not.toThrow()
  })

  it('does not regenerate different keys on second call (same kid)', async () => {
    const jwksBefore = getJwks()
    await initKeys() // second call
    const jwksAfter = getJwks()

    const kidBefore = (jwksBefore.keys[0] as Record<string, unknown>)['kid']
    const kidAfter = (jwksAfter.keys[0] as Record<string, unknown>)['kid']
    expect(kidBefore).toBe(kidAfter)
  })
})

describe('getJwks', () => {
  it('returns an object with a keys array', () => {
    const jwks = getJwks()
    expect(jwks).toHaveProperty('keys')
    expect(Array.isArray(jwks.keys)).toBe(true)
    expect(jwks.keys.length).toBeGreaterThan(0)
  })

  it('each key has kty: "RSA"', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      expect(key['kty']).toBe('RSA')
    }
  })

  it('each key has use: "sig"', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      expect(key['use']).toBe('sig')
    }
  })

  it('each key has alg: "RS256"', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      expect(key['alg']).toBe('RS256')
    }
  })

  it('each key has a non-empty kid string', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      expect(typeof key['kid']).toBe('string')
      expect((key['kid'] as string).length).toBeGreaterThan(0)
    }
  })

  it('each key contains RSA public key components n and e', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      expect(typeof key['n']).toBe('string')
      expect(typeof key['e']).toBe('string')
    }
  })

  it('does not expose the private key exponent d', () => {
    const jwks = getJwks()
    for (const key of jwks.keys) {
      // d is the RSA private exponent — must not appear in JWKS
      expect(key['d']).toBeUndefined()
    }
  })

  it('returns the same object on repeated calls (stable reference or equivalent value)', () => {
    const jwks1 = getJwks()
    const jwks2 = getJwks()
    expect(jwks1.keys[0]!['kid']).toBe(jwks2.keys[0]!['kid'])
    expect(jwks1.keys[0]!['n']).toBe(jwks2.keys[0]!['n'])
  })
})
