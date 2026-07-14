import { Header as SharedHeader } from '@zudar107/schloss-ui'
import { DEFAULT_APP_URL } from '../lib/returnTo'

// schlussel's pre-auth pages never show a user/logout - just the home-link
// simplification from the shared Header applies here. The home link
// leads to schloss (schlussel has no home page of its own), so the
// badge shows schloss's own logo mark, not schlussel's - it should look
// like it goes to a different app, not display schlussel's identity in
// a slot meant for "where this link goes".
export function Header() {
  return (
    <SharedHeader
      logo={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      }
      homeHref={DEFAULT_APP_URL}
      homeTitle="На главную"
    />
  )
}
