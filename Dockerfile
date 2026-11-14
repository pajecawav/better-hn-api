# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.4

# --- Build stage ---
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app

# No .git in the image — husky (run by the `prepare` script on install) must be disabled
ENV HUSKY=0

# Lockfile first for layer caching
COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

COPY . .
# nitro config uses the experimental bun builder — nitro must run under bun itself
RUN bun run build

# --- Runtime stage ---
FROM oven/bun:${BUN_VERSION}-slim AS runtime

ENV NODE_ENV=production \
	NITRO_HOST=0.0.0.0 \
	NITRO_PORT=3000

WORKDIR /app

# nitro bundles all externals into .output/server — no node_modules needed at runtime
COPY --from=build --chown=bun:bun /app/.output ./.output

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD bun -e "fetch('http://127.0.0.1:'+(process.env.NITRO_PORT||3000)+'/news').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", ".output/server/index.mjs"]
