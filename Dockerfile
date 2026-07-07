FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

# ---

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations

RUN mkdir -p /data/keys

ENV NODE_ENV=production \
    DATABASE_PATH=/data/schlussel.db \
    KEYS_DIR=/data/keys \
    PORT=4000

EXPOSE 4000

CMD ["node", "dist/index.js"]
