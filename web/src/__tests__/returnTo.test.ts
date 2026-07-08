import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readReturnTo, redirectWithToken, withReturnTo } from '../lib/returnTo'

// import.meta.env.VITE_ALLOWED_RETURN_ORIGINS is set in vitest.config.ts's
// define — but simplest here is to rely on Vite's default test env exposing
// whatever is in the shell/CI env. Since none is set for tests, this suite
// documents the "no allowlist configured" behavior (everything rejected)
// separately from a stubbed-allowlist scenario using vi.stubEnv.

describe('readReturnTo — no return_to param', () => {
  it('reports not present', () => {
    const result = readReturnTo('')
    expect(result.present).toBe(false)
  })
})

describe('readReturnTo — malformed return_to', () => {
  it('treats an unparsable URL as invalid', () => {
    const result = readReturnTo('?return_to=not-a-url')
    expect(result).toEqual({ present: true, valid: false, url: 'not-a-url' })
  })
})

describe('readReturnTo — allowlist enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.example.com,https://schloss.example.com')
  })

  it('accepts an origin present in the allowlist', async () => {
    vi.resetModules()
    const { readReturnTo: freshReadReturnTo } = await import('../lib/returnTo')
    const result = freshReadReturnTo('?return_to=https://kuvert.example.com/auth/callback')
    expect(result).toEqual({
      present: true,
      valid: true,
      url: 'https://kuvert.example.com/auth/callback',
    })
  })

  it('rejects an origin not present in the allowlist', async () => {
    vi.resetModules()
    const { readReturnTo: freshReadReturnTo } = await import('../lib/returnTo')
    const result = freshReadReturnTo('?return_to=https://evil.example.com/steal')
    expect(result).toEqual({
      present: true,
      valid: false,
      url: 'https://evil.example.com/steal',
    })
  })

  it('rejects a same-looking origin with a different port', async () => {
    vi.resetModules()
    const { readReturnTo: freshReadReturnTo } = await import('../lib/returnTo')
    const result = freshReadReturnTo('?return_to=https://kuvert.example.com:8443/x')
    expect(result.present).toBe(true)
    if (result.present) expect(result.valid).toBe(false)
  })
})

describe('redirectWithToken', () => {
  it('sets location.href to the return_to URL with the token in the fragment', () => {
    const original = window.location
    // @ts-expect-error -- jsdom allows reassigning location for test purposes
    delete window.location
    // @ts-expect-error -- minimal stub, only `href` is used by the function under test
    window.location = { href: '' }

    redirectWithToken('https://kuvert.example.com/auth/callback', 'abc123')
    expect(window.location.href).toBe('https://kuvert.example.com/auth/callback#token=abc123')

    // @ts-expect-error -- restoring jsdom's original Location object
    window.location = original
  })

  it('never puts the token in the query string portion', () => {
    const original = window.location
    // @ts-expect-error -- jsdom allows reassigning location for test purposes
    delete window.location
    // @ts-expect-error -- minimal stub, only `href` is used by the function under test
    window.location = { href: '' }

    redirectWithToken('https://kuvert.example.com/auth/callback', 'secret-token')
    expect(window.location.href).not.toContain('?token=')
    expect(window.location.href.split('#')[1]).toBe('token=secret-token')

    // @ts-expect-error -- restoring jsdom's original Location object
    window.location = original
  })
})

describe('withReturnTo', () => {
  it('appends return_to when present in the current search string', () => {
    const path = withReturnTo('/register', '?return_to=https%3A%2F%2Fkuvert.example.com')
    expect(path).toBe('/register?return_to=https%3A%2F%2Fkuvert.example.com')
  })

  it('leaves the path untouched when there is no return_to', () => {
    const path = withReturnTo('/register', '')
    expect(path).toBe('/register')
  })
})
