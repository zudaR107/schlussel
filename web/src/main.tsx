import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { applyTheme, getStoredTheme } from './lib/theme'
import './index.css'

applyTheme(getStoredTheme())

function Root() {
  return window.location.pathname === '/register' ? <RegisterPage /> : <LoginPage />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
