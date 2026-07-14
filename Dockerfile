FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# pnpm's frozen-lockfile install fetches every package in the lockfile
# to the content-addressable store to verify it (not just this
# project's own deps, even with --filter) - since web's
# @zudar107/schloss-ui is part of the same workspace lockfile, this
# image needs registry auth too, despite never using the package
# itself. The token is passed as a BuildKit secret (not an ARG, so it
# never ends up baked into an image layer) and written to a
# user-level .npmrc - pnpm refuses to expand env vars in the *project*
# .npmrc's auth line (to stop a malicious committed .npmrc from
# exfiltrating a token to an attacker registry), so it can't just go
# in ./.npmrc.
RUN --mount=type=secret,id=npm_token \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> /root/.npmrc \
    && pnpm install --frozen-lockfile

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

# ---

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=npm_token \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/npm_token)" >> /root/.npmrc \
    && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations

RUN mkdir -p /data/keys

ENV NODE_ENV=production \
    DATABASE_PATH=/data/schlussel.db \
    KEYS_DIR=/data/keys \
    PORT=4000

EXPOSE 4000

CMD ["node", "dist/index.js"]
