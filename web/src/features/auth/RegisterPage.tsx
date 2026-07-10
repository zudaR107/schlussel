import { useState } from 'react'
import { register, ApiError } from '../../lib/api'
import { readReturnTo, readCodeChallenge, redirectWithCode, redirectToDefaultApp, withReturnTo } from '../../lib/returnTo'
import { ErrorPage } from './ErrorPage'
import { PasswordField } from './PasswordField'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'

export function RegisterPage() {
  const returnTo = readReturnTo()
  const codeChallenge = readCodeChallenge()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // No return_to (or no code_challenge) means this page was reached by
  // typing the URL directly rather than via an external redirect - send
  // the visitor to the platform's home instead of ever rendering the form.
  if (!returnTo.present || !codeChallenge.present) {
    redirectToDefaultApp()
    return null
  }

  if (!returnTo.valid) {
    return <ErrorPage message="Адрес, на который нужно вернуться после регистрации, не входит в список разрешённых." />
  }

  const returnToUrl = returnTo.url
  const challenge = codeChallenge.codeChallenge

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    try {
      const { code } = await register(email, password, name, challenge)
      redirectWithCode(returnToUrl, code)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'Этот email уже зарегистрирован' : 'Не удалось зарегистрироваться')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              Создать аккаунт
            </h1>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <label className="label" htmlFor="register-name">Имя</label>
              <input
                id="register-name"
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                required
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label" htmlFor="register-email">Email</label>
              <input
                id="register-email"
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
              id="register-password"
              label="Пароль"
              value={password}
              onChange={setPassword}
              placeholder="Минимум 8 символов"
              minLength={8}
              autoComplete="new-password"
            />
            <PasswordField
              id="register-password-confirm"
              label="Повторите пароль"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Минимум 8 символов"
              minLength={8}
              autoComplete="new-password"
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
              {loading ? 'Подождите…' : 'Зарегистрироваться'}
            </button>
          </form>

          <p style={{ margin: '1.25rem 0 0', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Уже есть аккаунт?{' '}
            <a href={withReturnTo('/login')} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Войти
            </a>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  )
}
