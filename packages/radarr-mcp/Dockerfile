# syntax=docker/dockerfile:1

# Build context is the repo root: the image needs the workspace lockfile and the
# sibling @trugamr/radarr package, not just packages/radarr-mcp.
#
#   docker build -f packages/radarr-mcp/Dockerfile -t radarr-mcp .

# Both build and runtime use Alpine (musl), so there's no glibc/musl boundary between
# where the artifact is produced and where it runs, and Turbo's and Rolldown's prebuilt
# binaries both ship musl variants. The build stage is pinned to Node 24.16 because the
# floating `24` tag is now >=24.17.0, which has a keep-alive regression that breaks
# build/release tooling (nodejs/node#63989); the runtime stays on the latest secure 24.x.
# Unpin once Node ships the fix.
FROM node:24.16-alpine AS build-base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm version is pinned by the root package.json "packageManager" field.
RUN corepack enable
WORKDIR /app

# Isolate the minimum subset of the monorepo needed to build radarr-mcp. The
# --docker layout splits manifests (out/json) from sources (out/full) so the
# dependency-install layer only busts when a package.json or the lockfile changes.
FROM build-base AS pruner
RUN npm install -g turbo@2.10.0
COPY . .
RUN turbo prune @trugamr/radarr-mcp --docker

FROM build-base AS builder
# Install against manifests alone first for a cache-friendly dependency layer.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
# Then bring in sources and build. Turbo builds @trugamr/radarr first (^build).
# tsconfig.base.json is extended by each package's tsconfig but lives at the repo
# root; turbo prune treats it as a global cache input, not a file to copy, so
# bring it in explicitly or tsdown's .d.ts generation can't resolve it.
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=@trugamr/radarr-mcp
# Produce a self-contained runtime bundle: the deployed package becomes the root,
# so its node_modules has no pnpm workspace self-symlink. That self-symlink
# otherwise sends Node's ESM loader into a realpath spin at startup. --legacy is
# required because the repo doesn't set inject-workspace-packages (which is now
# encoded in the lockfile).
RUN pnpm --filter=@trugamr/radarr-mcp deploy --prod --legacy /app/deploy

# Runtime: Alpine with only the self-contained deploy bundle.
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=builder /app/deploy ./

# Run unprivileged.
RUN addgroup -S app && adduser -S app -G app
USER app

# The HTTP transport binds HOST:PORT; HOST=0.0.0.0 makes it reachable from
# outside the container (the server defaults to loopback). RADARR_BASE_URL and
# RADARR_API_KEY are required at runtime — the server validates them at startup.
EXPOSE 3000
CMD ["node", "dist/index.mjs", "http"]
