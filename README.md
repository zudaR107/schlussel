# Schlüssel

[![Test](https://github.com/zudaR107/schlussel/actions/workflows/test.yml/badge.svg)](https://github.com/zudaR107/schlussel/actions/workflows/test.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

Part of the [Schloss platform](https://github.com/zudaR107/Hof).

Schlüssel ("key" in German) is the authentication service for **Schloss** — a small
suite of self-hosted personal services. It's a standalone identity provider: it owns
user accounts and passwords, signs access tokens, and publishes a public key so every
other Schloss service can verify those tokens on its own, without calling back to
Schlüssel on every request.

## How it fits into Schloss

Schloss is split into independent, separately-deployed repos, each named after a German
word related to what it does:

- [`schloss`](https://github.com/zudaR107/schloss) — the home page / launcher
- **`schlussel`** (this repo) — auth: accounts, login, tokens
- [`kuvert`](https://github.com/zudaR107/kuvert) — envelope budgeting, the first real
  service

Every other service redirects an unauthenticated visitor's browser here to sign in.
Schlüssel hands back a short-lived RS256-signed JWT via an OAuth2 Authorization Code +
PKCE exchange — the login page redirects with a one-time code, never the token itself,
and the caller trades that code for the real access token in a POST response body, so
the token never travels through a URL at all. A long-lived refresh token is set in an
httpOnly cookie scoped to whichever frontend the visitor signed in from. Other services
verify the JWT themselves against Schlüssel's public key, published at
`/.well-known/jwks.json` — no shared secret, no synchronous call back to Schlüssel on
every request.

This repo has two parts:

- the root package — the Hono API (accounts, login/register, JWT issuance, JWKS)
- `web/` — the hosted login/register pages every other service redirects to

## Local development

```sh
pnpm install
cp .env.example .env
pnpm dev              # API on http://localhost:4000
pnpm --filter web dev # login/register pages on http://localhost:4001
```

Run the test suites and linter before committing:

```sh
pnpm test
pnpm lint
pnpm --filter web test
pnpm --filter web lint
```

### Environment variables

See `.env.example` for the API. The important ones:

| Variable | Purpose |
|---|---|
| `PORT` | API port (default `4000`) |
| `DATABASE_PATH` | SQLite file path |
| `KEYS_DIR` | Where the RS256 signing keypair is generated/stored on first run |
| `JWT_ISSUER` | Must match what every other service expects as the token issuer |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |

`web/` reads two build-time variables (see `web/Dockerfile`): `VITE_ALLOWED_RETURN_ORIGINS`,
a comma-separated allowlist of origins the hosted login page is allowed to redirect back
to after a successful sign-in (a `return_to` pointing anywhere outside this list is
rejected instead of followed - the open-redirect guard), and `VITE_DEFAULT_APP_URL`,
where a visitor who opened `/login` or `/register` directly (no `return_to` at all) gets
sent instead of ever seeing the form - these pages are only reachable via an external
redirect.

## Running with Docker

```sh
docker network create schloss-net   # one-time, shared with the other repos
docker compose up -d
```

Neither service publishes a host port - both are reached through the
[tor](https://github.com/zudaR107/tor) gateway, which fronts the whole platform on one
address (`http://auth.localhost` for this service, in local dev). Other Schloss services
on the same `schloss-net` network reach the API directly at `http://schlussel:4000`.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
