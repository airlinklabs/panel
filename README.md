> [!CAUTION]
>
> # ⚠️ THIS SOFTWARE IS HIGHLY UNSTABLE — DO NOT USE IN PRODUCTION ⚠️
>
> **Airlink Panel is in early BETA. Expect breaking changes, data loss, security vulnerabilities,
> and incomplete features with every update. APIs, database schemas, configuration formats,
> and stored data may change without notice between releases.**
>
> **This is a development preview only. We are not responsible for any data loss, security
> incidents, or damages resulting from use of this software. If you need a stable game server
> panel today, this is not it.**

<div align="center">

<img width="1280" height="720" alt="AIRLINK" src="https://github.com/user-attachments/assets/283d1a34-0c8e-4e31-b37b-fbd1be2140aa" />

# Airlink Panel (Katharos) BETA v2.5.191

**Open-source game server management panel**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

[![License](https://img.shields.io/github/license/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420?style=flat-square&logo=discord&label=Discord&color=5865F2)](https://discord.gg/ujXyxwwMHc)
[![GitHub Stars](https://img.shields.io/github/stars/AirlinkLabs/panel?style=flat-square&logo=github)](https://github.com/AirlinkLabs/panel/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/AirlinkLabs/panel?style=flat-square&logo=github)](https://github.com/AirlinkLabs/panel/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/commits/main)
[![CI](https://img.shields.io/github/actions/workflow/status/AirlinkLabs/panel/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/AirlinkLabs/panel/actions/workflows/ci.yml)

[Website](https://airlinklabs.xyz/) · [Documentation](https://airlinklabs.xyz/docs/quick-start/) · [Discord](https://discord.gg/ujXyxwwMHc) · [Report a Bug](https://github.com/AirlinkLabs/panel/issues/new) · [Request a Feature](https://github.com/AirlinkLabs/panel/issues/new)

</div>

---

## What is Airlink Panel?

Airlink Panel is a web-based control panel for deploying, monitoring, and managing game servers across multiple machines. It communicates with daemons on each node to handle Docker containers, files, and SFTP.

**Core features:**

- Web UI for admins and users (EJS templates, Tailwind CSS, Alpine.js, HTMX)
- Node-based architecture: one panel controlling many daemons
- Addon system for extending functionality without touching core files
- REST API (v1 + v2 legacy) with scoped API keys and HMAC-signed daemon communication
- Real-time console, file manager, backups, and SFTP
- Server creation, power controls, and resource management
- User management with 2FA and WebAuthn passkey support
- Analytics and player stats
- Multi-language support (i18n) — 10 languages
- Redis-backed sessions with user-index revocation
- Node.js cluster mode (auto-forks per CPU core)
- CSP headers with per-request nonces (configurable)
- TLS direct HTTPS support
- Configurable rate limiting

Documentation: [airlinklabs.xyz/docs/quick-start/](https://airlinklabs.xyz/docs/quick-start/)

---

## Prerequisites

- **Node.js** v22 or later
- **pnpm** v11 or later (`npm install -g pnpm`)
- **Git**
- **Docker**
- **Redis** (default: `127.0.0.1:6379`)
- **PostgreSQL** (default: `127.0.0.1:5432`)

> [!NOTE]
> MariaDB/MySQL is **no longer supported**. The database engine was migrated to PostgreSQL.

---

## Installation

### Option 1: Installer script

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

The installer handles Node.js, Docker, PostgreSQL, Redis, database setup, build, and systemd service registration.

### Option 2: Setup script (recommended)

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel
node public/scripts/setup.mjs
pnpm run start
```

**Setup flags:**

| Flag                     | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `--yes`, `-y`            | Non-interactive mode (accepts all defaults)         |
| `--skip-services`        | Don't install or start Redis / PostgreSQL           |
| `--skip-build`           | Don't run package install, tsc, or tailwindcss      |
| `--db-host HOST`         | PostgreSQL host (default: `127.0.0.1`)              |
| `--db-port PORT`         | PostgreSQL port (default: `5432`)                   |
| `--db-name NAME`         | Database name (default: `airlink`)                  |
| `--db-user USER`         | Database username (default: `airlink`)              |
| `--redis-url URL`        | Redis URL (default: `redis://127.0.0.1:6379`)       |
| `--url URL`              | Panel public URL (default: `http://localhost:3000`) |
| `--trust-proxy`          | Enable `X-Forwarded-*` headers                      |
| `--cookie-domain DOMAIN` | Cookie domain for cross-subdomain sessions          |
| `--asset-base-url URL`   | Base URL for static assets (CDN)                    |
| `--csp-enabled`          | Force Content Security Policy on                    |
| `--rate-limit MAX`       | Request rate limit per IP (default: `500`)          |
| `--log-level LEVEL`      | Log level (default: `info`)                         |
| `--smtp-host HOST`       | SMTP server host                                    |
| `--smtp-port PORT`       | SMTP server port (default: `587`)                   |
| `--smtp-user USER`       | SMTP username                                       |
| `--smtp-pass PASS`       | SMTP password                                       |

Examples:

```bash
node public/scripts/setup.mjs                          # Interactive
node public/scripts/setup.mjs --yes                    # CI / unattended
node public/scripts/setup.mjs --skip-services --db-host=db.internal --yes
```

### Option 3: Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

cp example.env .env
# Edit .env with your values (see Configuration below)

pnpm install
npx prisma generate
npx prisma db push
pnpm run build
pnpm run start
```

### Running with systemd

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
journalctl -u airlink-panel -f
```

### Running with pm2

```bash
npm install -g pm2
pm2 start "pnpm run start" --name airlink-panel
pm2 save
pm2 startup
```

---

## Configuration

Copy `example.env` to `.env` and configure the values for your environment.

### Core

| Variable         | Required | Default                 | Description                                                             |
| ---------------- | -------- | ----------------------- | ----------------------------------------------------------------------- |
| `URL`            | Yes      | `http://localhost:3000` | Full URL the panel is accessible from                                   |
| `PORT`           | No       | `3000`                  | Port to listen on                                                       |
| `NAME`           | No       | `Airlink`               | Panel display name                                                      |
| `NODE_ENV`       | No       | `development`           | Set to `production` for live deployments                                |
| `SESSION_SECRET` | Yes      | —                       | Random secret for session signing. Generate with `openssl rand -hex 32` |
| `STORAGE_DIR`    | No       | `./storage`             | Base directory for all panel data                                       |

### Database (PostgreSQL)

| Variable       | Required | Default     | Description                  |
| -------------- | -------- | ----------- | ---------------------------- |
| `DATABASE_URL` | Yes      | —           | PostgreSQL connection string |
| `PGHOST`       | No       | `127.0.0.1` | PostgreSQL host              |
| `PGPORT`       | No       | `5432`      | PostgreSQL port              |
| `PGUSER`       | No       | `airlink`   | PostgreSQL username          |
| `PGPASSWORD`   | No       | —           | PostgreSQL password          |

> [!IMPORTANT]
> `DATABASE_URL` must use the `postgresql://` scheme. MariaDB/MySQL is no longer supported.

### Redis

| Variable    | Required | Default                  | Description             |
| ----------- | -------- | ------------------------ | ----------------------- |
| `REDIS_URL` | No       | `redis://127.0.0.1:6379` | Redis connection string |

### Proxy & Security

| Variable          | Required | Default | Description                                                      |
| ----------------- | -------- | ------- | ---------------------------------------------------------------- |
| `TRUST_PROXY`     | No       | `false` | Enable `X-Forwarded-*` headers (required behind reverse proxies) |
| `COOKIE_DOMAIN`   | No       | —       | Cookie domain for cross-subdomain sessions                       |
| `ALLOWED_ORIGINS` | No       | —       | Comma-separated list of allowed CORS origins                     |
| `CSP_ENABLED`     | No       | `false` | Force Content Security Policy headers on                         |

### TLS (Direct HTTPS)

| Variable        | Required | Default | Description                  |
| --------------- | -------- | ------- | ---------------------------- |
| `TLS_CERT_PATH` | No       | —       | Path to TLS certificate file |
| `TLS_KEY_PATH`  | No       | —       | Path to TLS private key file |

When both are set, the panel starts an HTTPS server directly (with HTTP fallback). Otherwise, use a reverse proxy.

### Rate Limiting

| Variable               | Required | Default | Description                       |
| ---------------------- | -------- | ------- | --------------------------------- |
| `RATE_LIMIT_MAX`       | No       | `500`   | Max requests per window per IP    |
| `RATE_LIMIT_WINDOW_MS` | No       | `60000` | Rate limit window in milliseconds |

### SMTP (Email)

| Variable    | Required | Default | Description          |
| ----------- | -------- | ------- | -------------------- |
| `SMTP_HOST` | No       | —       | SMTP server hostname |
| `SMTP_PORT` | No       | `587`   | SMTP server port     |
| `SMTP_USER` | No       | —       | SMTP username        |
| `SMTP_PASS` | No       | —       | SMTP password        |

### Logging

| Variable    | Required | Default | Description                                  |
| ----------- | -------- | ------- | -------------------------------------------- |
| `LOG_LEVEL` | No       | `info`  | Log level (`debug`, `info`, `warn`, `error`) |

> [!IMPORTANT]
> Set `URL` to the actual IP or hostname the panel is accessible from. Using `http://localhost` will block external access and cause CSP errors.

---

## Architecture

### Stack

| Layer             | Technology                   |
| ----------------- | ---------------------------- |
| Runtime           | Node.js 22+ (cluster mode)   |
| Language          | TypeScript (CommonJS output) |
| Framework         | Express 5                    |
| Templating        | EJS + Alpine.js + HTMX       |
| Styling           | Tailwind CSS v4              |
| ORM               | Prisma 7                     |
| Database          | PostgreSQL                   |
| Cache / Sessions  | Redis                        |
| Container runtime | Docker (via node-docker-api) |

### Redis Usage

- **Sessions**: Stored in Redis (`airlink:sess:*`) with a user index (`airlink:usr:{id}`) for admin revocation
- **Node health cache**: `checkNodeStatus` results cached 15s per node
- **Search cache**: `/api/search` results cached 30s per user+query
- **Realtime events**: Pub/sub for live console output and server status updates

### Directory Structure

```
panel/
├── src/                  # TypeScript source
│   ├── config/           # Configuration (mime, auth, limits, etc.)
│   ├── handlers/         # Middleware, utilities, realtime
│   ├── modules/          # Route handlers (admin, api, auth, user)
│   ├── services/         # Business logic (backup, daemon, file, i18n)
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Shared utilities
├── views/                # EJS templates
│   ├── admin/            # Admin panel views
│   ├── auth/             # Login, register, 2FA
│   ├── components/       # Shared UI components
│   └── user/             # User dashboard, server management
├── public/               # Static assets
│   ├── javascript/       # Client-side JS + vendor bundles
│   ├── styles/           # CSS (Tailwind input)
│   └── scripts/          # Setup / install scripts
├── storage/              # Runtime data
│   ├── prisma/           # Schema + migrations
│   ├── lang/             # i18n translation files (10 languages)
│   └── addons/           # Addon storage
├── tests/                # Vitest unit tests + Docker test infra
│   └── docker/           # Dockerfile, entrypoint.sh, docker-compose.test.yml
├── docs/                 # API spec and documentation
└── .github/workflows/    # CI pipeline (10 jobs)
```

---

## Scripts

| Command                      | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `pnpm run dev`               | Start with auto-restart on file changes              |
| `pnpm run build`             | Production build (tsc + tailwindcss)                 |
| `pnpm run start`             | Start the panel (`node --env-file=.env dist/app.js`) |
| `pnpm run typecheck`         | Type checking                                        |
| `pnpm run lint`              | ESLint                                               |
| `pnpm run test`              | Run unit tests (Vitest)                              |
| `pnpm run test:watch`        | Run tests in watch mode                              |
| `pnpm run test:coverage`     | Run tests with coverage                              |
| `pnpm run test:e2e`          | Run Playwright e2e tests                             |
| `pnpm run test:docker`       | Run tests in Docker (PostgreSQL + Redis)             |
| `pnpm run test:all`          | Run unit + e2e tests                                 |
| `pnpm run db:generate`       | Generate Prisma client                               |
| `pnpm run db:push`           | Push schema to database                              |
| `pnpm run db:migrate`        | Create and apply a migration                         |
| `pnpm run db:migrate:deploy` | Apply pending migrations                             |
| `pnpm run db:reset`          | Reset database and reapply migrations                |
| `pnpm run db:studio`         | Open Prisma Studio                                   |
| `pnpm run db:status`         | Show migration status                                |
| `pnpm run db:seed`           | Seed initial data                                    |

---

## API Reference

The panel exposes a REST API with 138 HTTP routes and 4 WebSocket endpoints. See [`docs/specsheet.md`](docs/specsheet.md) for the full route catalog, request/response formats, authentication details, and notes on daemon communication.

---

## Addon System

Addons let you extend the panel without modifying core files. They live under `storage/addons/` and can be managed from the `/admin/addons` page.

See [`storage/addons/README.md`](storage/addons/README.md) for the structure and API reference.

---

## Testing

Unit tests use [Vitest](https://vitest.dev/). E2e tests use [Playwright](https://playwright.dev/).

```bash
pnpm run test              # Run all unit tests
pnpm run test:e2e          # Run e2e tests (requires Chromium)
pnpm run test:docker       # Run full test suite in Docker
```

Tests mock Redis and database connections where needed. The CI pipeline runs all checks across 10 jobs: SAST, Dependency Review, Audit, Lint, Typecheck, Unit Tests, Build, and more.

---

## Development

```bash
pnpm install
pnpm run dev        # Start with auto-restart on file changes
pnpm run typecheck  # Type checking
pnpm run lint       # Linting
pnpm run build      # Production build
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: describe your change'`
4. Push and open a pull request against `main`

Please run `pnpm run lint` and `pnpm run typecheck` before submitting.

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/chart?repos=airlinklabs/panel&type=date&legend=top-left&sealed_token=X3cF3RK-oLzJUf6Q7wzQDSE7UV2pt4s9npE8smFZOUpbNJCruOHijNJU-Qh0V6jlMOdbIRJMo-wLnsMs6SMxiyVQHsXYWFIGWBPVct2QUQtkeJhsTni08w)](https://www.star-history.com/?repos=airlinklabs%2Fpanel&type=date&legend=top-left)

</div>

---

## Project Leads

| Avatar                                                                                         | Handle                                     | Role           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| <img src="https://github.com/bthavanish.png" width="40" height="40" style="border-radius:50%"> | [thavanish](https://github.com/bthavanish) | Maintainer     |
| <img src="https://github.com/privt00.png" width="40" height="40" style="border-radius:50%">    | [privt00](https://github.com/privt00)      | Project Lead   |
| <img src="https://github.com/achul123.png" width="40" height="40" style="border-radius:50%">   | [achul123](https://github.com/achul123)    | Core Developer |

---

## Contributors

Contributions of all sizes are welcome. Take a look at the open issues if you're not sure where to start.

<a href="https://github.com/AirlinkLabs/panel/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AirlinkLabs/panel" alt="Contributors" />
</a>

<sub>Made with [contrib.rocks](https://contrib.rocks)</sub>

---

## Links

- Website: [airlinklabs.xyz](https://airlinklabs.xyz/)
- Docs: [airlinklabs.xyz/docs/quick-start](https://airlinklabs.xyz/docs/quick-start/)
- Discord: [discord.gg/ujXyxwwMHc](https://discord.gg/ujXyxwwMHc)
- GitHub: [github.com/airlinklabs/panel](https://github.com/airlinklabs/panel)

---

## License

MIT. See [`LICENSE`](LICENSE) for details.

<div align="center">
<sub>Made by the Airlink community</sub>
</div>
