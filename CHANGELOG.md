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

## Infrastructure
- CI (tests + lint) on every push/PR.
- Docker Compose networking on a shared `schloss-net`.
- Migrated from nginx to Caddy in the web image.
- Docker images published to GHCR on merge to `main`.
- Dependabot for both npm and GitHub Actions dependencies.
- Dropped published host ports - reached only through the tor gateway now.

## Docs
- README, AGPL-3.0 LICENSE, CONTRIBUTING.md.
- License/CI badges, a link to the Hof meta-repo, fixed gateway repo URL
  casing after its rename to lowercase.
- Wrote the gateway's project name lowercase ("tor") everywhere in prose.
