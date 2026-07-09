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
  it('redirects with the token in the URL fragment on successful login', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation('?return_to=https://kuvert.test/callback')
    mockLogin.mockResolvedValue({ accessToken: 'the-token', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByPlaceholderText(/example/i), 'a@a.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(window.location.href).toBe('https://kuvert.test/callback#token=the-token'))
    vi.unstubAllEnvs()
  })

  it('shows an error message when login rejects', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation('?return_to=https://kuvert.test/callback')
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
    const { LoginPage } = await setLocation('?return_to=https://evil.test/steal')
    render(<LoginPage />)

    expect(screen.getByText(/небезопасный адрес возврата/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    vi.unstubAllEnvs()
  })
})

describe('LoginPage — register link', () => {
  it('carries the return_to param over to the register link', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { LoginPage } = await setLocation('?return_to=https%3A%2F%2Fkuvert.test%2Fcallback')
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: /зарегистрироваться/i })
    expect(link).toHaveAttribute('href', '/register?return_to=https%3A%2F%2Fkuvert.test%2Fcallback')
    vi.unstubAllEnvs()
  })
})
