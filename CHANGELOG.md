# Changelog

Brief log of notable changes, grouped by theme — not a full commit history
(see `git log` for that). New entries get appended under the section they
fit best; add a new section if none fits.

## Auth
- Hosted login/register web UI, JWKS-based token verification, fragment-based
  token handoff to other services via `return_to`.
- Guarded `/login` and `/register` behind a valid `return_to`, so they're no
  longer reachable by typing the URL directly - a successful sign-in now
  always redirects instead of sometimes dead-ending on a static card.
- Added password confirmation and a show/hide toggle to the auth forms.
- Switched the login handoff to OAuth2 Authorization Code + PKCE: the
  token is no longer delivered via URL fragment. `POST /auth/login` now
  optionally issues a short-lived one-time code instead of a token, and a
  new `POST /auth/token` exchanges it (plus the PKCE verifier) for the
  real access token in a JSON response body.
- Added optional `COOKIE_DOMAIN` to scope the refresh-token cookie across
  every subdomain behind the gateway - a session started on one service
  now carries over to the others instead of forcing a re-login.

## UI
- Added a header (brand mark linking back to schloss) and footer to the
  login/register pages and the return_to error page - previously bare
  form cards with no chrome connecting them to the rest of the platform,
  matching schloss's Header/Footer component structure.

## Infrastructure
- CI (tests + lint) on every push/PR.
- Docker Compose networking on a shared `schloss-net`.
- Migrated from nginx to Caddy in the web image.
- Docker images published to GHCR on merge to `main`.
- Dependabot for both npm and GitHub Actions dependencies.
- Dropped published host ports - reached only through the tor gateway now.
- Fixed docker-compose.yml's default `ALLOWED_ORIGINS`/
  `VITE_ALLOWED_RETURN_ORIGINS`/`VITE_DEFAULT_APP_URL` to `https://` - tor's
  gateway auto-upgrades everything to HTTPS, so the old `http://` defaults
  failed the return_to allowlist for anyone running the real stack.
- Renamed docker-compose.yml's outer `ALLOWED_ORIGINS` substitution
  variable to `SCHLUSSEL_ALLOWED_ORIGINS` - it was silently colliding with
  kuvert-api's own `ALLOWED_ORIGINS` default when tor's compose file
  includes both under one shared `.env`. Container-internal env var name
  is unchanged.

## Docs
- README, AGPL-3.0 LICENSE, CONTRIBUTING.md.
- License/CI badges, a link to the Hof meta-repo, fixed gateway repo URL
  casing after its rename to lowercase.
- Wrote the gateway's project name lowercase ("tor") everywhere in prose.
- Added CODE_OF_CONDUCT.md, SECURITY.md, issue templates, and a pull
  request template. Fixed a stale README line still describing the old
  fragment-based token handoff.
