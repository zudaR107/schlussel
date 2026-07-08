# Schlüssel

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
Schlüssel issues a short-lived RS256-signed JWT (returned via a URL fragment, never a
query string, so it doesn't end up in server logs) plus a long-lived refresh token in an
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

`web/` reads `VITE_ALLOWED_RETURN_ORIGINS` at *build* time (see `web/Dockerfile`) — a
comma-separated allowlist of origins the hosted login page is allowed to redirect back
to after a successful sign-in. This is the open-redirect guard: a `return_to` pointing
anywhere outside this list is rejected instead of followed.

## Running with Docker

```sh
docker network create schloss-net   # one-time, shared with the other two repos
docker compose up -d
```

This builds and runs both the API (`:4000`) and the hosted login UI (`:4001`). Other
Schloss services on the same `schloss-net` network reach the API at `http://schlussel:4000`.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
