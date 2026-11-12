# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.11.1

# pnpm version — keep in sync with the `packageManager` field in package.json
ARG PNPM_VERSION=12.11.2

# --- Build stage ---
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app

# corepack is no longer shipped with Node 26
RUN npm install -g pnpm@${PNPM_VERSION}

# No .git in the image — husky (run by the `prepare` script on install) must be disabled
ENV HUSKY=0

# Lockfile first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- Runtime stage ---
FROM node:${NODE_VERSION}-slim AS runtime

ENV NODE_ENV=production \
	NITRO_HOST=0.0.0.0 \
	NITRO_PORT=3000

WORKDIR /app

# nitro bundles all externals into .output/server — no node_modules needed at runtime
COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.NITRO_PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
