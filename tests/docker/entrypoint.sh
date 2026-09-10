#!/bin/bash
set -e

# ── Start PostgreSQL ─────────────────────────────────────────────────────────
echo "[test] Starting PostgreSQL..."
pg_lsclusters
service postgresql start || pg_ctlcluster 16 main start

# Wait for postgres to be ready
for i in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done

# Create user + database
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='airlink'\" | grep -q 1" \
  || su - postgres -c "psql -c \"CREATE USER airlink WITH PASSWORD 'airlink' SUPERUSER;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='airlink'\" | grep -q 1" \
  || su - postgres -c "psql -c \"CREATE DATABASE airlink OWNER airlink;\""
echo "[test] PostgreSQL ready — database 'airlink' created."

# ── Start Redis ──────────────────────────────────────────────────────────────
echo "[test] Starting Redis..."
redis-server --daemonize yes --loglevel warning
sleep 1
redis-cli ping | grep -q PONG || { echo "Redis failed to start"; exit 1; }
echo "[test] Redis ready."

# ── Write .env for tests ─────────────────────────────────────────────────────
cat > /opt/panel/.env <<'EOF'
NODE_ENV=development
URL=http://localhost:3000
PORT=3000
NAME="Airlink Test"
SESSION_SECRET=0000000000000000000000000000000000000000000000000000000000000000
DATABASE_URL=postgresql://airlink:airlink@127.0.0.1:5432/airlink
REDIS_URL=redis://127.0.0.1:6379
DB_POOL_MAX=5
EOF

# ── Run database migrations ──────────────────────────────────────────────────
echo "[test] Running Prisma migrations..."
npx prisma db push --skip-generate 2>&1 || true

# ── Run unit tests ───────────────────────────────────────────────────────────
echo "[test] Running vitest..."
pnpm run test 2>&1
UNIT_EXIT=$?

# ── Run e2e tests if requested ──────────────────────────────────────────────
if [ "${RUN_E2E:-0}" = "1" ]; then
  echo "[test] Starting panel server for e2e..."
  node --env-file=.env dist/app.js &
  SERVER_PID=$!
  sleep 3

  echo "[test] Running Playwright e2e..."
  npx playwright test 2>&1
  E2E_EXIT=$?
  kill $SERVER_PID 2>/dev/null || true
else
  E2E_EXIT=0
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  Unit tests:  $([ $UNIT_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
[ "${RUN_E2E:-0}" = "1" ] && echo "  E2E tests:   $([ $E2E_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo "========================================="

exit $((UNIT_EXIT + E2E_EXIT))
