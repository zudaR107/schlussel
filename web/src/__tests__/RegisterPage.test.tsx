import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockRegister = vi.fn()
vi.mock('../lib/api', () => ({
  register: (...args: unknown[]) => mockRegister(...args),
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
  window.location = { ...original, search, href: '', pathname: '/register' }
  const mod = await import('../features/auth/RegisterPage')
  return { RegisterPage: mod.RegisterPage }
}

beforeEach(() => {
  mockRegister.mockReset()
  localStorage.clear()
})

describe('RegisterPage — no return_to', () => {
  it('renders name, email and password fields', async () => {
    const { RegisterPage } = await setLocation('')
    render(<RegisterPage />)
    expect(screen.getByPlaceholderText('Ваше имя')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/example/i)).toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument()
  })

  it('calls register with name, email and password', async () => {
    const { RegisterPage } = await setLocation('')
    mockRegister.mockResolvedValue({ accessToken: 'tok', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('alice@test.com', 'password1', 'Alice'))
  })

  it('shows a success message with no return_to, without redirecting', async () => {
    const { RegisterPage } = await setLocation('')
    mockRegister.mockResolvedValue({ accessToken: 'tok', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await screen.findByText(/регистрация завершена/i)
    expect(window.location.href).toBe('')
  })

  it('shows an error when the email is already registered', async () => {
    const { RegisterPage } = await setLocation('')
    const ApiError = (await import('../lib/api')).ApiError
    mockRegister.mockRejectedValue(new ApiError(409, 'Email already registered'))
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'dup@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await screen.findByText('Этот email уже зарегистрирован')
  })
})

describe('RegisterPage — valid return_to', () => {
  it('redirects with the token in the URL fragment on successful registration', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    mockRegister.mockResolvedValue({ accessToken: 'reg-token', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelector('input[type="password"]') as Element, 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(window.location.href).toBe('https://kuvert.test/callback#token=reg-token'))
    vi.unstubAllEnvs()
  })
})

describe('RegisterPage — invalid return_to', () => {
  it('shows an error page instead of the registration form and never calls register', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://evil.test/steal')
    render(<RegisterPage />)

    expect(screen.getByText(/небезопасный адрес возврата/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Ваше имя')).not.toBeInTheDocument()
    expect(mockRegister).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

describe('RegisterPage — login link', () => {
  it('carries the return_to param over to the login link', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https%3A%2F%2Fkuvert.test%2Fcallback')
    render(<RegisterPage />)
    const link = screen.getByRole('link', { name: /^войти$/i })
    expect(link).toHaveAttribute('href', '/login?return_to=https%3A%2F%2Fkuvert.test%2Fcallback')
    vi.unstubAllEnvs()
  })
})
