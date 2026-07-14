import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { LogoutPage } from './features/auth/LogoutPage'
import { applyTheme, getStoredTheme } from './lib/theme'
import './index.css'

applyTheme(getStoredTheme())

function Root() {
  if (window.location.pathname === '/register') return <RegisterPage />
  if (window.location.pathname === '/logout') return <LogoutPage />
  return <LoginPage />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
