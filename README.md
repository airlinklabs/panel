> [!WARNING]
> **This Project is in BETA and under active development and is not yet stable and is UNUSEABLE.**
> APIs, features, and stored data may change without notice between releases. Not recommended for production use. Proceed with that in mind.

<div align="center">

<img width="1280" height="720" alt="AIRLINK" src="https://github.com/user-attachments/assets/283d1a34-0c8e-4e31-b37b-fbd1be2140aa" />

# Airlink Panel (Katharos) BETA

**Open-source game server management panel**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

[![License](https://img.shields.io/github/license/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420?style=flat-square&logo=discord&label=Discord&color=5865F2)](https://discord.gg/ujXyxwwMHc)
[![GitHub Stars](https://img.shields.io/github/stars/AirlinkLabs/panel?style=flat-square&logo=github)](https://github.com/AirlinkLabs/panel/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/AirlinkLabs/panel?style=flat-square&logo=github)](https://github.com/AirlinkLabs/panel/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/commits/main)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/AirlinkLabs/panel?style=flat-square)](https://github.com/AirlinkLabs/panel/commits/main)

[Website](https://airlinklabs.xyz/) · [Documentation](https://airlinklabs.xyz/docs/quick-start/) · [Discord](https://discord.gg/ujXyxwwMHc) · [Report a Bug](https://github.com/AirlinkLabs/panel/issues/new) · [Request a Feature](https://github.com/AirlinkLabs/panel/issues/new)

</div>

---

## What is Airlink Panel?

Airlink Panel is a web-based control panel for deploying, monitoring, and managing game servers across multiple machines. It communicates with daemons on each node to handle Docker containers, files, and SFTP.

**What it does:**
- Web UI for admins and users (EJS templates, Tailwind CSS)
- Node-based architecture: one panel controlling many daemons
- Addon system so you can extend functionality without touching core files
- REST API (v1 + legacy) with scoped API keys
- Real-time console, file manager, backups, and SFTP
- HMAC-signed daemon communication
- Server creation, power controls, and resource management
- User management with 2FA
- Analytics and player stats
- Multi-language support (i18n)
- Redis-backed sessions with user-index revocation
- Node.js cluster mode (auto-forks per CPU core)
- Unified log stream across all workers
- Redis-cached node health and search results

Documentation: [airlinklabs.xyz/docs/quick-start/](https://airlinklabs.xyz/docs/quick-start/)

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/chart?repos=airlinklabs/panel&type=date&legend=top-left&sealed_token=X3cF3RK-oLzJUf6Q7wzQDSE7UV2pt4s9npE8smFZOUpbNJCruOHijNJU-Qh0V6jlMOdbIRJMo-wLnsMs6SMxiyVQHsXYWFIGWBPVct2QUQtkeJhsTni08w)](https://www.star-history.com/?repos=airlinklabs%2Fpanel&type=date&legend=top-left)

</div>

---

## Project Leads

| Avatar | Handle | Role |
|--------|--------|------|
| <img src="https://github.com/bthavanish.png" width="40" height="40" style="border-radius:50%"> | [thavanish](https://github.com/bthavanish) | Maintainer |
| <img src="https://github.com/privt00.png" width="40" height="40" style="border-radius:50%"> | [privt00](https://github.com/privt00) | Project Lead |
| <img src="https://github.com/achul123.png" width="40" height="40" style="border-radius:50%"> | [achul123](https://github.com/achul123) | Core Developer |

---

## Contributors

Contributions of all sizes are welcome. Take a look at the open issues if you're not sure where to start.

<a href="https://github.com/AirlinkLabs/panel/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AirlinkLabs/panel" alt="Contributors" />
</a>

<sub>Made with [contrib.rocks](https://contrib.rocks)</sub>

---

## Prerequisites

- Node.js v22 or later
- pnpm v11 or later (`npm install -g pnpm`)
- Git
- Docker
- Redis
- MariaDB (or MySQL)

---

## Installation

### Option 1: Installer script

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

The installer takes care of Node.js, Docker, database setup, the build step, and registering a systemd service.

Once installed, manage the panel with systemd:

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
journalctl -u airlink-panel -f
```

### Option 2: Automated setup (recommended)

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel
node public/setup.mjs
pnpm run start
```

The setup script automatically:

1. Verifies Node.js (>=22) and pnpm are installed
2. Checks Redis is installed and running (installs/starts if missing)
3. Checks MariaDB is installed and running (installs/starts if missing)
4. Creates the `airlink` database if it doesn't exist
5. Generates `.env` with a secure random `SESSION_SECRET`
6. Runs `prisma generate` + `prisma db push`
7. Installs dependencies and builds the project

Run non-interactively for CI:

```bash
node public/setup.mjs --yes
```

### Option 3: Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

chown -R www-data:www-data /var/www/panel
chmod -R 755 /var/www/panel

cp example.env .env
# Edit .env: PORT, URL, SESSION_SECRET, DATABASE_URL

pnpm install
npx prisma generate
npx prisma db push
pnpm run build
pnpm run start
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

Copy `example.env` to `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NAME` | No | Panel display name (default: Airlink) |
| `NODE_ENV` | Yes | Set to `production` for live deployments |
| `URL` | Yes | Full URL the panel is served from, e.g. `http://192.168.1.10:3000` |
| `PORT` | Yes | Port to listen on |
| `DATABASE_URL` | Yes | MySQL/MariaDB connection string, e.g. `mysql://root:@127.0.0.1:3306/airlink` |
| `REDIS_URL` | Yes | Redis connection string, e.g. `redis://127.0.0.1:6379` |
| `SESSION_SECRET` | Yes | Random secret for session signing. Generate with `openssl rand -hex 32` |
| `MYSQL_HOST` | No | MySQL host for auto-generate database host (default: 127.0.0.1) |
| `MYSQL_PORT` | No | MySQL port (default: 3306) |
| `MYSQL_USER` | No | MySQL user (default: root) |
| `MYSQL_PASSWORD` | No | MySQL password (default: empty) |

> [!IMPORTANT]
> `DATABASE_URL` must use the `mysql://` scheme. SQLite is no longer supported.

> [!IMPORTANT]
> Set `URL` to the actual IP or hostname the panel is accessible from. Using `http://localhost` will block external access and cause CSP errors.

> [!IMPORTANT]
> `SESSION_SECRET` is auto-generated by the setup script. Only set it manually if skipping setup.

---

## Architecture

### Redis Usage

- **Sessions**: Stored in Redis (`airlink:sess:*`) with a user index (`airlink:usr:{id}`) for admin revocation
- **Node health cache**: `checkNodeStatus` results cached 15s per node to avoid hammering daemons
- **Search cache**: `/api/search` results cached 30s per user+query

---

## API Reference

The panel exposes a REST API with 138 HTTP routes and 4 WebSocket endpoints. See [`docs/specsheet.md`](docs/specsheet.md) for the full route catalog, request/response formats, authentication details, and notes on daemon communication.

---

## Addon System

Addons let you extend the panel without modifying core files. They live under `storage/addons/` and can be managed from the `/admin/addons` page.

See [`storage/addons/README.md`](storage/addons/README.md) for the structure and API reference.

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
