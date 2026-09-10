# ── Test image: panel + postgres + redis in one container ─────────────────────
# Used by: test:docker, GitHub Actions CI
# Build:  docker compose -f test/docker-compose.test.yml build
# Run:    docker compose -f test/docker-compose.test.yml up
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# System deps: postgres, redis, git (for prisma), openssl, python3 (native builds)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql \
    postgresql-contrib \
    redis-server \
    git \
    curl \
    openssl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/panel

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# Copy package files first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --store-dir /root/.local/share/pnpm/store/v11 \
    && pnpm approve-builds --all || true

# Copy rest of source
COPY . .

# Build
RUN pnpm run build

# Generate prisma client
RUN pnpm run db:generate

# Entrypoint: start postgres, redis, then run tests
COPY tests/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
