/**
 * Unit tests for password hashing utilities.
 *
 * Tests are purely behavioural — the implementation details (bcrypt, argon2,
 * etc.) don't matter as long as the contract is satisfied.
 */

import { describe, it, expect } from 'vitest'

// Dynamic import so env vars (if any) can be set first; also makes the import
// pattern consistent with the integration tests.
let hashPassword: (pw: string) => Promise<string>
let verifyPassword: (pw: string, hash: string) => Promise<boolean>

// Top-level await is available inside beforeAll; we use a module-level
// initialiser instead to keep tests at the top level.
const initPromise = import('../utils/password.js').then((m) => {
  hashPassword = m.hashPassword
  verifyPassword = m.verifyPassword
})

// Helper — ensures the module is loaded before any test runs.
async function ready() {
  await initPromise
}

describe('hashPassword', () => {
  it('returns a string', async () => {
    await ready()
    const hash = await hashPassword('mypassword')
    expect(typeof hash).toBe('string')
  })

  it('does not return the raw password', async () => {
    await ready()
    const pw = 'supersecret'
    const hash = await hashPassword(pw)
    expect(hash).not.toBe(pw)
    expect(hash).not.toContain(pw)
  })

  it('produces different hashes for the same password (salted)', async () => {
    await ready()
    const pw = 'samepassword'
    const hash1 = await hashPassword(pw)
    const hash2 = await hashPassword(pw)
    expect(hash1).not.toBe(hash2)
  })

  it('produces a non-empty hash for an 8-character password', async () => {
    await ready()
    const hash = await hashPassword('12345678')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('produces a non-empty hash for a 128-character password', async () => {
    await ready()
    const hash = await hashPassword('a'.repeat(128))
    expect(hash.length).toBeGreaterThan(0)
  })
})

describe('verifyPassword', () => {
  it('returns true when the password matches the hash', async () => {
    await ready()
    const pw = 'correctpassword'
    const hash = await hashPassword(pw)
    const result = await verifyPassword(pw, hash)
    expect(result).toBe(true)
  })

  it('returns false when the password does not match the hash', async () => {
    await ready()
    const pw = 'correctpassword'
    const hash = await hashPassword(pw)
    const result = await verifyPassword('wrongpassword', hash)
    expect(result).toBe(false)
  })

  it('returns false for an empty string against a real hash', async () => {
    await ready()
    const hash = await hashPassword('somepassword')
    const result = await verifyPassword('', hash)
    expect(result).toBe(false)
  })

  it('returns false when given a garbage hash string', async () => {
    await ready()
    const result = await verifyPassword('password', 'not-a-real-hash')
    expect(result).toBe(false)
  })

  it('is consistent across multiple calls', async () => {
    await ready()
    const pw = 'consistentpassword'
    const hash = await hashPassword(pw)
    const [r1, r2, r3] = await Promise.all([
      verifyPassword(pw, hash),
      verifyPassword(pw, hash),
      verifyPassword(pw, hash),
    ])
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(r3).toBe(true)
  })

  it('a hash from one password does not verify a different password', async () => {
    await ready()
    const hash = await hashPassword('password-A')
    const result = await verifyPassword('password-B', hash)
    expect(result).toBe(false)
  })

  it('two different salted hashes of the same password both verify correctly', async () => {
    await ready()
    const pw = 'sharedpassword'
    const hash1 = await hashPassword(pw)
    const hash2 = await hashPassword(pw)
    expect(hash1).not.toBe(hash2) // confirm they differ
    const [r1, r2] = await Promise.all([
      verifyPassword(pw, hash1),
      verifyPassword(pw, hash2),
    ])
    expect(r1).toBe(true)
    expect(r2).toBe(true)
  })
})
