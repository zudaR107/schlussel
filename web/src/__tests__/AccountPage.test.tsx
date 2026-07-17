import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockRefreshSession = vi.fn()
const mockFetchMe = vi.fn()
const mockExchangeCode = vi.fn()
const mockChangePassword = vi.fn()
const mockDeleteAccount = vi.fn()

vi.mock('../lib/api', () => ({
  refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  exchangeCode: (...args: unknown[]) => mockExchangeCode(...args),
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
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
  window.location = { ...original, search, href: '', pathname: '/account' }
  const mod = await import('../features/account/AccountPage')
  return { AccountPage: mod.AccountPage }
}

const USER = { id: '1', email: 'jane@example.com', name: 'Jane Doe', role: 'user' }

// Common path used by most tests below the bootstrap stage: a valid
// refreshSession + fetchMe round-trip landing on the fixture user, so the
// full form is on screen before the test's own assertions begin.
async function renderLoggedIn(search = '') {
  mockRefreshSession.mockResolvedValue({ accessToken: 'token-abc' })
  mockFetchMe.mockResolvedValue(USER)
  const { AccountPage } = await setLocation(search)
  const user = userEvent.setup()
  render(<AccountPage />)
  await screen.findByText('Настройки аккаунта')
  return { user }
}

beforeEach(() => {
  mockRefreshSession.mockReset()
  mockFetchMe.mockReset()
  mockExchangeCode.mockReset()
  mockChangePassword.mockReset()
  mockDeleteAccount.mockReset()
  sessionStorage.clear()
})

describe('AccountPage — session bootstrap (no code)', () => {
  it('renders a blank loading state with no heading or form fields while refreshSession is pending', async () => {
    mockRefreshSession.mockReturnValue(new Promise(() => {}))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    expect(screen.queryByText('Настройки аккаунта')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Текущий пароль')).not.toBeInTheDocument()
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })

  it('calls refreshSession with no arguments on mount', async () => {
    mockRefreshSession.mockResolvedValue({ accessToken: 'tok' })
    mockFetchMe.mockResolvedValue(USER)
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(mockRefreshSession).toHaveBeenCalledWith())
  })

  it('calls fetchMe with the accessToken once refreshSession resolves', async () => {
    mockRefreshSession.mockResolvedValue({ accessToken: 'tok-xyz' })
    mockFetchMe.mockResolvedValue(USER)
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(mockFetchMe).toHaveBeenCalledWith('tok-xyz'))
  })

  it('renders normally and never touches window.location.href when fetchMe succeeds', async () => {
    await renderLoggedIn()
    expect(window.location.href).toBe('')
  })

  it('redirects to login when fetchMe rejects', async () => {
    mockRefreshSession.mockResolvedValue({ accessToken: 'tok' })
    mockFetchMe.mockRejectedValue(new Error('no user'))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(window.location.href).toMatch(/^\/login\?/))
  })

  it('redirects to login when refreshSession rejects', async () => {
    mockRefreshSession.mockRejectedValue(new Error('no session'))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(window.location.href).toMatch(/^\/login\?/))
  })
})

describe('AccountPage — code exchange (?code=...)', () => {
  it('calls exchangeCode with the code param and stored verifier, and renders using its user without a separate fetchMe call', async () => {
    sessionStorage.setItem('account_pkce_code_verifier', 'the-verifier')
    mockExchangeCode.mockResolvedValue({ accessToken: 'tok', user: USER })
    const { AccountPage } = await setLocation('?code=the-code')
    render(<AccountPage />)
    await screen.findByText('Настройки аккаунта')
    expect(mockExchangeCode).toHaveBeenCalledWith('the-code', 'the-verifier')
    expect(mockFetchMe).not.toHaveBeenCalled()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('removes the stored verifier from sessionStorage after reading it', async () => {
    sessionStorage.setItem('account_pkce_code_verifier', 'the-verifier')
    mockExchangeCode.mockResolvedValue({ accessToken: 'tok', user: USER })
    const { AccountPage } = await setLocation('?code=the-code')
    render(<AccountPage />)
    await screen.findByText('Настройки аккаунта')
    expect(sessionStorage.getItem('account_pkce_code_verifier')).toBeNull()
  })

  it('strips the code param from the visible URL via history.replaceState', async () => {
    sessionStorage.setItem('account_pkce_code_verifier', 'the-verifier')
    mockExchangeCode.mockResolvedValue({ accessToken: 'tok', user: USER })
    const { AccountPage } = await setLocation('?code=the-code')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    render(<AccountPage />)
    await waitFor(() => expect(replaceStateSpy).toHaveBeenCalled())
    replaceStateSpy.mockRestore()
  })

  it('falls back to refreshSession + fetchMe when exchangeCode rejects, without redirecting to login solely because of that failure', async () => {
    sessionStorage.setItem('account_pkce_code_verifier', 'the-verifier')
    mockExchangeCode.mockRejectedValue(new Error('bad code'))
    mockRefreshSession.mockResolvedValue({ accessToken: 'tok2' })
    mockFetchMe.mockResolvedValue(USER)
    const { AccountPage } = await setLocation('?code=the-code')
    render(<AccountPage />)
    await screen.findByText('Настройки аккаунта')
    expect(mockRefreshSession).toHaveBeenCalled()
    expect(mockFetchMe).toHaveBeenCalledWith('tok2')
  })
})

describe('AccountPage — redirect to login (no valid session)', () => {
  it('redirects to /login? with return_to=<origin>/account, a non-empty code_challenge, and code_challenge_method=S256', async () => {
    mockRefreshSession.mockRejectedValue(new Error('no session'))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(window.location.href).toMatch(/^\/login\?/))

    const params = new URL(window.location.href, window.location.origin).searchParams
    expect(params.get('return_to')).toBe(`${window.location.origin}/account`)
    expect(params.get('code_challenge')).toBeTruthy()
    expect(params.get('code_challenge_method')).toBe('S256')
  })

  it('saves a non-empty PKCE verifier to sessionStorage before redirecting', async () => {
    mockRefreshSession.mockRejectedValue(new Error('no session'))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(window.location.href).toMatch(/^\/login\?/))
    expect(sessionStorage.getItem('account_pkce_code_verifier')).toBeTruthy()
  })

  it('never renders form or user content before the redirect fires', async () => {
    mockRefreshSession.mockRejectedValue(new Error('no session'))
    const { AccountPage } = await setLocation('')
    render(<AccountPage />)
    await waitFor(() => expect(window.location.href).toMatch(/^\/login\?/))
    expect(screen.queryByText('Настройки аккаунта')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Текущий пароль')).not.toBeInTheDocument()
  })
})

describe('AccountPage — rendered content', () => {
  it('shows the heading and the user name and email', async () => {
    await renderLoggedIn()
    expect(screen.getByText('Настройки аккаунта')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
  })

  it('shows the password-change form fields and submit button', async () => {
    await renderLoggedIn()
    expect(screen.getByLabelText('Текущий пароль')).toBeInTheDocument()
    expect(screen.getByLabelText('Новый пароль')).toBeInTheDocument()
    expect(screen.getByLabelText('Повторите новый пароль')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить пароль' })).toBeInTheDocument()
  })

  it('each password field independently toggles type via its own Показать/Скрыть пароль button', async () => {
    const { user } = await renderLoggedIn()

    const current = screen.getByLabelText('Текущий пароль') as HTMLInputElement
    const next = screen.getByLabelText('Новый пароль') as HTMLInputElement
    expect(current).toHaveAttribute('type', 'password')
    expect(next).toHaveAttribute('type', 'password')

    const currentToggle = within(current.parentElement as HTMLElement).getByRole('button', {
      name: 'Показать пароль',
    })
    await user.click(currentToggle)
    expect(current).toHaveAttribute('type', 'text')
    // Sibling field is unaffected.
    expect(next).toHaveAttribute('type', 'password')

    expect(
      within(current.parentElement as HTMLElement).getByRole('button', { name: 'Скрыть пароль' }),
    ).toBeInTheDocument()
  })

  it('shows the danger-zone password field and a submit button disabled until text is typed', async () => {
    const { user } = await renderLoggedIn()
    const deleteButton = screen.getByRole('button', { name: 'Удалить аккаунт навсегда' })
    expect(deleteButton).toBeDisabled()

    await user.type(screen.getByLabelText('Пароль'), 'x')
    expect(deleteButton).toBeEnabled()
  })

  it('mentions both "аккаунт" and "удалить" somewhere in the danger zone', async () => {
    await renderLoggedIn()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/аккаунт/i)
    expect(text).toMatch(/удалить/i)
  })
})

describe('AccountPage — back link', () => {
  it('renders a link to the return_to URL when it is present and allowed', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    await renderLoggedIn('?return_to=' + encodeURIComponent('https://kuvert.test/budget'))
    const link = document.querySelector('a[href="https://kuvert.test/budget"]')
    expect(link).toBeTruthy()
    vi.unstubAllEnvs()
  })

  // The page chrome always renders its own external links regardless of
  // return_to - the header's home logo (href === window.location.origin)
  // and the footer's GitHub icon - neither is the "back" link under test
  // here, so both are excluded from this count.
  function externalNonChromeLinks(): Element[] {
    return Array.from(document.querySelectorAll('a[href^="http"]')).filter((a) => {
      if (a.getAttribute('href') === window.location.origin) return false
      if (a.getAttribute('aria-label') === 'GitHub') return false
      return true
    })
  }

  it('renders no back link when return_to is absent', async () => {
    await renderLoggedIn('')
    expect(externalNonChromeLinks().length).toBe(0)
  })

  it('renders no back link when return_to is present but not an allowed origin', async () => {
    vi.stubEnv('VITE_ALLOWED_RETURN_ORIGINS', 'https://kuvert.test')
    await renderLoggedIn('?return_to=' + encodeURIComponent('https://evil.test/steal'))
    expect(externalNonChromeLinks().length).toBe(0)
    vi.unstubAllEnvs()
  })
})

describe('AccountPage — change password', () => {
  it('calls changePassword with the current and new password as the last two arguments', async () => {
    const { user } = await renderLoggedIn()
    mockChangePassword.mockResolvedValue(undefined)

    await user.type(screen.getByLabelText('Текущий пароль'), 'oldpass123')
    await user.type(screen.getByLabelText('Новый пароль'), 'newpass456')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalled())
    const args = mockChangePassword.mock.calls[0]
    expect(args[args.length - 2]).toBe('oldpass123')
    expect(args[args.length - 1]).toBe('newpass456')
  })

  it('does not call changePassword and shows a mismatch message when the new password fields differ', async () => {
    const { user } = await renderLoggedIn()

    await user.type(screen.getByLabelText('Текущий пароль'), 'oldpass123')
    await user.type(screen.getByLabelText('Новый пароль'), 'newpass456')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'different789')
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    expect(await screen.findByText(/не совпадают/i)).toBeInTheDocument()
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('shows a success message and clears the fields when changePassword resolves', async () => {
    const { user } = await renderLoggedIn()
    mockChangePassword.mockResolvedValue(undefined)

    const current = screen.getByLabelText('Текущий пароль') as HTMLInputElement
    const next = screen.getByLabelText('Новый пароль') as HTMLInputElement
    const confirm = screen.getByLabelText('Повторите новый пароль') as HTMLInputElement

    await user.type(current, 'oldpass123')
    await user.type(next, 'newpass456')
    await user.type(confirm, 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    // Ordered regex ("пароль" before "измен...") to avoid also matching the
    // "Изменить пароль" submit button label, which contains both words in
    // the opposite order.
    await screen.findByText(/пароль\s+измен/i)
    expect(current).toHaveValue('')
    expect(next).toHaveValue('')
    expect(confirm).toHaveValue('')
  })

  it('shows an "invalid current password" error when changePassword rejects with 401', async () => {
    const { user } = await renderLoggedIn()
    const ApiError = (await import('../lib/api')).ApiError
    mockChangePassword.mockRejectedValue(new ApiError(401, 'Invalid current password'))

    await user.type(screen.getByLabelText('Текущий пароль'), 'oldpass123')
    await user.type(screen.getByLabelText('Новый пароль'), 'newpass456')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toMatch(/неверный/i)
      expect(text).toMatch(/пароль/i)
    })
  })

  it('shows a visible error and does not crash when changePassword rejects with an unrelated error', async () => {
    const { user } = await renderLoggedIn()
    const ApiError = (await import('../lib/api')).ApiError
    mockChangePassword.mockRejectedValue(new ApiError(500, 'boom'))

    await user.type(screen.getByLabelText('Текущий пароль'), 'oldpass123')
    await user.type(screen.getByLabelText('Новый пароль'), 'newpass456')
    await user.type(screen.getByLabelText('Повторите новый пароль'), 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Изменить пароль' }))

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalled())
    // Page is still alive and showing some error text - loose assertion by design.
    expect(screen.getByText('Настройки аккаунта')).toBeInTheDocument()
  })
})

describe('AccountPage — delete account', () => {
  it('calls deleteAccount with the password as the last argument', async () => {
    const { user } = await renderLoggedIn()
    mockDeleteAccount.mockResolvedValue(undefined)

    await user.type(screen.getByLabelText('Пароль'), 'mypassword')
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт навсегда' }))

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled())
    const args = mockDeleteAccount.mock.calls[0]
    expect(args[args.length - 1]).toBe('mypassword')
  })

  it('navigates away by setting window.location.href when deleteAccount resolves', async () => {
    const { user } = await renderLoggedIn()
    mockDeleteAccount.mockResolvedValue(undefined)
    expect(window.location.href).toBe('')

    await user.type(screen.getByLabelText('Пароль'), 'mypassword')
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт навсегда' }))

    await waitFor(() => expect(window.location.href).not.toBe(''))
  })

  it('shows an "invalid password" error and does not navigate when deleteAccount rejects with 401', async () => {
    const { user } = await renderLoggedIn()
    const ApiError = (await import('../lib/api')).ApiError
    mockDeleteAccount.mockRejectedValue(new ApiError(401, 'Invalid password'))

    await user.type(screen.getByLabelText('Пароль'), 'mypassword')
    await user.click(screen.getByRole('button', { name: 'Удалить аккаунт навсегда' }))

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toMatch(/неверный/i)
      expect(text).toMatch(/пароль/i)
    })
    expect(window.location.href).toBe('')
  })
})

describe('AccountPage — logout', () => {
  it('sets window.location.href to a string starting with /logout when the Выйти control is clicked', async () => {
    const { user } = await renderLoggedIn()
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(window.location.href).toMatch(/^\/logout/)
  })
})
