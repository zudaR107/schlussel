import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockLogin = vi.fn()
vi.mock('../lib/api', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

async function setLocation(search: string) {
  vi.resetModules()
  const original = window.location
  // @ts-expect-error -- jsdom allows reassigning location for test purposes
  delete window.location
  // @ts-expect-error -- minimal stub covering what the module under test reads
  window.location = { ...original, search, href: '', pathname: '/login' }
  const mod = await import('../features/auth/LoginPage')
  return { LoginPage: mod.LoginPage }
}

// A plausible 43-character base64url code_challenge fixture, valid per the
// readCodeChallenge contract (see returnTo.test.ts): present + code_challenge_method=S256.
const CODE_CHALLENGE = 'A'.repeat(43)
const PKCE_QS = `&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`

beforeEach(() => {
  mockLogin.mockReset()
  localStorage.clear()
})

describe('LoginPage — no return_to', () => {
  it('redirects immediately to the hardcoded default app URL when VITE_DEFAULT_APP_URL is not set', async () => {
    const { LoginPage } = await setLocation('')
    render(<LoginPage />)
    expect(window.location.href).toBe('http://localhost:3000')
  })

  it('redirects immediately to VITE_DEFAULT_APP_URL when it is stubbed', async () => {
    vi.stubEnv('VITE_DEFAULT_APP_URL', 'https://schloss.example.com')
    const { LoginPage } = await setLocation('')
    render(<LoginPage />)
    expect(window.location.href).toBe('https://schloss.example.com')
    vi.unstubAllEnvs()
  })

  it('does not render the login form', async () => {
    const { LoginPage } = await setLocation('')
    render(<LoginPage />)
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument()
  })

  it('never calls login', async () => {
    const { LoginPage } = await setLocation('')
    render(<LoginPage />)
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

describe('LoginPage — valid return_to', () => {
  it('redirects with the code in the URL query string on successful login (no existing query on return_to)', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    mockLogin.mockResolvedValue({ code: 'the-code' })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByPlaceholderText(/example/i), 'a@a.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(window.location.href).toBe('https://kuvert.test/callback?code=the-code'))
    // No accessToken/fragment-based redirect must remain.
    expect(window.location.href).not.toContain('#')
    vi.unstubAllEnvs()
  })

  it('redirects with &code=<value> appended when the return_to URL already has a query string', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(
      `?return_to=${encodeURIComponent('https://kuvert.test/callback?next=%2Fbudget')}${PKCE_QS}`,
    )
    mockLogin.mockResolvedValue({ code: 'the-code' })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByPlaceholderText(/example/i), 'a@a.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() =>
      expect(window.location.href).toBe('https://kuvert.test/callback?next=%2Fbudget&code=the-code'),
    )
    vi.unstubAllEnvs()
  })

  it('calls login with the email, password, and the code_challenge extracted from the URL', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    mockLogin.mockResolvedValue({ code: 'the-code' })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByPlaceholderText(/example/i), 'a@a.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalled())
    const args = mockLogin.mock.calls[0]
    expect(args).toContain('a@a.com')
    expect(args).toContain('password1')
    expect(args).toContain(CODE_CHALLENGE)
    vi.unstubAllEnvs()
  })

  it('shows an error message when login rejects', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    const ApiError = (await import('../lib/api')).ApiError
    mockLogin.mockRejectedValue(new ApiError(401, 'Invalid credentials'))
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByPlaceholderText(/example/i), 'bad@user.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'wrong')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await screen.findByText('Неверный email или пароль')
    vi.unstubAllEnvs()
  })
})

describe('LoginPage — invalid return_to', () => {
  it('shows an error page instead of the login form and never calls login', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://evil.test/steal${PKCE_QS}`)
    render(<LoginPage />)

    expect(screen.getByText(/небезопасный адрес возврата/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    vi.unstubAllEnvs()
  })
})

describe('LoginPage — missing or invalid code_challenge', () => {
  it('redirects to the default app URL (same as missing return_to) when return_to is valid but code_challenge is absent', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation('?return_to=https://kuvert.test/callback')
    render(<LoginPage />)
    expect(window.location.href).toBe('http://localhost:3000')
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('redirects to the default app URL when code_challenge is present but code_challenge_method is not S256', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(
      `?return_to=https://kuvert.test/callback&code_challenge=${CODE_CHALLENGE}&code_challenge_method=plain`,
    )
    render(<LoginPage />)
    expect(window.location.href).toBe('http://localhost:3000')
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('honors VITE_DEFAULT_APP_URL when redirecting due to missing code_challenge', async () => {
    vi.stubEnv('VITE_DEFAULT_APP_URL', 'https://schloss.example.com')
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation('?return_to=https://kuvert.test/callback')
    render(<LoginPage />)
    expect(window.location.href).toBe('https://schloss.example.com')
    vi.unstubAllEnvs()
  })
})

describe('LoginPage — password visibility toggle', () => {
  it('shows a toggle button initially labeled "Показать пароль"', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    render(<LoginPage />)

    expect(screen.getByRole('button', { name: 'Показать пароль' })).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('toggles the password input type and the button label when clicked', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    const user = userEvent.setup()
    render(<LoginPage />)

    const input = document.querySelector('#login-password') as HTMLInputElement
    expect(input).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Показать пароль' })).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('preserves the typed value when toggling visibility', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https://kuvert.test/callback${PKCE_QS}`)
    const user = userEvent.setup()
    render(<LoginPage />)

    const input = document.querySelector('#login-password') as HTMLInputElement
    await user.type(input, 'secret123')
    expect(input).toHaveValue('secret123')

    await user.click(screen.getByRole('button', { name: 'Показать пароль' }))
    expect(input).toHaveValue('secret123')

    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }))
    expect(input).toHaveValue('secret123')
    vi.unstubAllEnvs()
  })
})

describe('LoginPage — register link', () => {
  it('carries the return_to param over to the register link', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation(`?return_to=https%3A%2F%2Fkuvert.test%2Fcallback${PKCE_QS}`)
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: /зарегистрироваться/i })
    expect(link).toHaveAttribute(
      'href',
      `/register?return_to=https%3A%2F%2Fkuvert.test%2Fcallback&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`,
    )
    vi.unstubAllEnvs()
  })
})
