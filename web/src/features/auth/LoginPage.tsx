import { useState } from 'react'
import { login, ApiError } from '../../lib/api'
import { readReturnTo, redirectWithToken, redirectToDefaultApp, withReturnTo } from '../../lib/returnTo'
import { ErrorPage } from './ErrorPage'
import { PasswordField } from './PasswordField'

export function LoginPage() {
  const returnTo = readReturnTo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // No return_to at all means this page was reached by typing the URL
  // directly rather than via an external redirect - send the visitor to
  // the platform's home instead of ever rendering the form.
  if (!returnTo.present) {
    redirectToDefaultApp()
    return null
  }

  if (!returnTo.valid) {
    return <ErrorPage message="Адрес, на который нужно вернуться после входа, не входит в список разрешённых." />
  }

  const returnToUrl = returnTo.url

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { accessToken } = await login(email, password)
      redirectWithToken(returnToUrl, accessToken)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Неверный email или пароль' : 'Не удалось войти')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', padding: '1rem',
    }}>
      <div className="card-elevated" style={{ width: '100%', maxWidth: 380, padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 48, height: 48, background: 'var(--accent)', borderRadius: 12,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="8" cy="15" r="4" />
              <path d="M10.85 12.15 19 4" />
              <path d="M18 5l2 2" />
              <path d="M15 8l2 2" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Schlüssel
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Войти
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
            />
          </div>
          <PasswordField
            id="login-password"
            label="Пароль"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {error && (
            <div style={{ padding: '0.625rem 0.75rem', background: 'var(--danger-muted)', border: '1px solid var(--danger)', borderRadius: 8, fontSize: '0.875rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ justifyContent: 'center', padding: '0.625rem', marginTop: '0.25rem', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Подождите…' : 'Войти'}
          </button>
        </form>

        <p style={{ margin: '1.25rem 0 0', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Нет аккаунта?{' '}
          <a href={withReturnTo('/register')} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Зарегистрироваться
          </a>
        </p>
      </div>
    </div>
  )
}
