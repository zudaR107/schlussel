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
  it('redirects immediately to the hardcoded default app URL when VITE_DEFAULT_APP_URL is not set', async () => {
    const { RegisterPage } = await setLocation('')
    render(<RegisterPage />)
    expect(window.location.href).toBe('http://localhost:3000')
  })

  it('redirects immediately to VITE_DEFAULT_APP_URL when it is stubbed', async () => {
    vi.stubEnv('VITE_DEFAULT_APP_URL', 'https://schloss.example.com')
    const { RegisterPage } = await setLocation('')
    render(<RegisterPage />)
    expect(window.location.href).toBe('https://schloss.example.com')
    vi.unstubAllEnvs()
  })

  it('does not render name, email or password fields', async () => {
    const { RegisterPage } = await setLocation('')
    render(<RegisterPage />)
    expect(screen.queryByPlaceholderText('Ваше имя')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/example/i)).not.toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument()
  })

  it('never calls register', async () => {
    const { RegisterPage } = await setLocation('')
    render(<RegisterPage />)
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

describe('RegisterPage — valid return_to', () => {
  it('calls register with name, email and password', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    mockRegister.mockResolvedValue({ accessToken: 'tok', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelectorAll('input[type="password"]')[0], 'password1')
    await user.type(document.querySelectorAll('input[type="password"]')[1], 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('alice@test.com', 'password1', 'Alice'))
    vi.unstubAllEnvs()
  })

  it('redirects with the token in the URL fragment on successful registration', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    mockRegister.mockResolvedValue({ accessToken: 'reg-token', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelectorAll('input[type="password"]')[0], 'password1')
    await user.type(document.querySelectorAll('input[type="password"]')[1], 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(window.location.href).toBe('https://kuvert.test/callback#token=reg-token'))
    vi.unstubAllEnvs()
  })

  it('shows an error when the email is already registered', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    const ApiError = (await import('../lib/api')).ApiError
    mockRegister.mockRejectedValue(new ApiError(409, 'Email already registered'))
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'dup@test.com')
    await user.type(document.querySelectorAll('input[type="password"]')[0], 'password1')
    await user.type(document.querySelectorAll('input[type="password"]')[1], 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await screen.findByText('Этот email уже зарегистрирован')
    vi.unstubAllEnvs()
  })
})

describe('RegisterPage — password confirmation', () => {
  it('blocks submission and shows an error when the passwords do not match', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelectorAll('input[type="password"]')[0], 'password1')
    await user.type(document.querySelectorAll('input[type="password"]')[1], 'password2')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await screen.findByText('Пароли не совпадают')
    expect(mockRegister).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    vi.unstubAllEnvs()
  })

  it('proceeds with registration when the passwords match', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    mockRegister.mockResolvedValue({ accessToken: 'tok', user: { id: '1', email: 'a@a.com', name: 'A', role: 'user' } })
    const user = userEvent.setup()
    render(<RegisterPage />)

    await user.type(screen.getByPlaceholderText('Ваше имя'), 'Alice')
    await user.type(screen.getByPlaceholderText(/example/i), 'alice@test.com')
    await user.type(document.querySelectorAll('input[type="password"]')[0], 'password1')
    await user.type(document.querySelectorAll('input[type="password"]')[1], 'password1')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('alice@test.com', 'password1', 'Alice'))
    expect(screen.queryByText('Пароли не совпадают')).not.toBeInTheDocument()
    vi.unstubAllEnvs()
  })
})

describe('RegisterPage — password visibility toggle', () => {
  it('shows two toggle buttons, both initially labeled "Показать пароль"', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    render(<RegisterPage />)

    const toggles = screen.getAllByRole('button', { name: 'Показать пароль' })
    expect(toggles).toHaveLength(2)
    vi.unstubAllEnvs()
  })

  it('toggles the main password field independently of the confirm field', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    const user = userEvent.setup()
    render(<RegisterPage />)

    const passwordInput = document.querySelector('#register-password') as HTMLInputElement
    const confirmInput = document.querySelector('#register-password-confirm') as HTMLInputElement
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(confirmInput).toHaveAttribute('type', 'password')

    const [passwordToggle, confirmToggle] = screen.getAllByRole('button', { name: 'Показать пароль' })

    await user.click(passwordToggle)
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Скрыть пароль' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Показать пароль' })).toBeInTheDocument()

    await user.click(confirmToggle)
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'text')
    expect(screen.getAllByRole('button', { name: 'Скрыть пароль' })).toHaveLength(2)

    vi.unstubAllEnvs()
  })

  it('preserves typed values in both fields when toggling visibility', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    const { RegisterPage } = await setLocation('?return_to=https://kuvert.test/callback')
    const user = userEvent.setup()
    render(<RegisterPage />)

    const passwordInput = document.querySelector('#register-password') as HTMLInputElement
    const confirmInput = document.querySelector('#register-password-confirm') as HTMLInputElement

    await user.type(passwordInput, 'password1')
    await user.type(confirmInput, 'password2')

    const [passwordToggle, confirmToggle] = screen.getAllByRole('button', { name: 'Показать пароль' })
    await user.click(passwordToggle)
    await user.click(confirmToggle)

    expect(passwordInput).toHaveValue('password1')
    expect(confirmInput).toHaveValue('password2')
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
    expect(window.location.href).toBe('')
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
