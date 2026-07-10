import { DEFAULT_APP_URL } from '../lib/returnTo'

// Minimal header for the pre-auth login/register pages - just a brand mark
// linking back to the platform's home (schloss), matching the same
// sticky-bar structure as schloss's own Header component (no shared
// package between these separately-deployed repos, so the structure is
// duplicated rather than imported).
export function Header() {
  return (
    <header style={{
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 1.5rem',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      boxShadow: 'var(--shadow-sm)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
    }}>
      <a
        href={DEFAULT_APP_URL}
        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textDecoration: 'none' }}
      >
        <div style={{
          width: 32, height: 32, background: 'var(--accent)', borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="8" cy="15" r="4" />
            <path d="M10.85 12.15 19 4" />
            <path d="M18 5l2 2" />
            <path d="M15 8l2 2" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Schlüssel
        </span>
      </a>
    </header>
  )
}
