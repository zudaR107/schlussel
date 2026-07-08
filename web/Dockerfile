FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile --filter web

# Vite bakes import.meta.env.VITE_* into the bundle at build time, so this
# must be declared as an ARG to actually receive the value passed via
# docker-compose's build.args.
ARG VITE_ALLOWED_RETURN_ORIGINS=http://localhost:3000,http://localhost:5174
ENV VITE_ALLOWED_RETURN_ORIGINS=$VITE_ALLOWED_RETURN_ORIGINS

COPY web ./web
RUN cd web && pnpm run build

FROM caddy:2-alpine AS runner
COPY --from=builder /app/web/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
