import { Header as SharedHeader } from '@zudar107/schloss-ui'
import { DEFAULT_APP_URL } from '../lib/returnTo'

// schlussel's pre-auth pages never show a user/logout - just the home-link
// simplification from the shared Header applies here.
export function Header() {
  return (
    <SharedHeader
      logo={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
          <circle cx="8" cy="15" r="4" />
          <path d="M10.85 12.15 19 4" />
          <path d="M18 5l2 2" />
          <path d="M15 8l2 2" />
        </svg>
      }
      homeHref={DEFAULT_APP_URL}
      homeTitle="Schlüssel"
    />
  )
}
