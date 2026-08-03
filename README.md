> [!WARNING]
> # This project is a work in progress and is highly unstable
> It is not recommended for production use. APIs, features, and data may break, change, or disappear at any time. Use at your own risk.

# Airlink Panel (Katharos)

Open-source game server management panel.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/ujXyxwwMHc)

---

## What is this?

Airlink Panel is a web-based control center for deploying, monitoring, and managing game servers across multiple machines. The panel communicates with daemons running on each node to manage Docker containers, files, and SFTP.

**Features:**
- Web UI for admins and users (EJS templates, Tailwind CSS)
- Node-based architecture: one panel, many daemons
- Addon system for extending functionality
- REST API (v1 + legacy) with scoped API keys
- Real-time console, file manager, backups, SFTP
- HMAC-signed daemon communication
- Server creation, power actions, resource management
- User management with 2FA support
- Analytics and player stats
- Multi-language support (i18n)

Documentation: [airlinklabs.xyz/docs/quick-start/](https://airlinklabs.xyz/docs/quick-start/)

---

## Project Leads

| Handle | Role |
|--------|------|
| [thavanish](https://github.com/bthavanish) | Maintainer |
| [privt00](https://github.com/privt00) | Project lead |
| [achul123](https://github.com/achul123) | Core developer |

---

## Prerequisites

- Node.js v18 or later
- pnpm v8 or later (`npm install -g pnpm`)
- Git
- Docker

---

## Installation

### Option 1: Installer script

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

The installer handles Node.js, Docker, database setup, build, and systemd service creation.

Manage with systemd:

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
journalctl -u airlink-panel -f
```

### Option 2: Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

chown -R www-data:www-data /var/www/panel
chmod -R 755 /var/www/panel

pnpm install

cp example.env .env
# Edit .env: PORT, URL, SESSION_SECRET, DATABASE_URL

pnpm run setup
pnpm run start
```

`pnpm run setup` installs dependencies, generates the Prisma client, pushes the database schema, and builds TypeScript + CSS.

### Running with pm2

```bash
npm install -g pm2
pm2 start "pnpm run start" --name airlink-panel
pm2 save
pm2 startup
```

---

## Configuration

Copy `example.env` to `.env` and set the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NAME` | No | Panel display name (default: Airlink) |
| `NODE_ENV` | Yes | Set to `production` for live deployments |
| `URL` | Yes | Full URL the panel is served from, e.g. `http://192.168.1.10:3000` |
| `PORT` | Yes | Port to listen on |
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./storage/dev.db` |
| `SESSION_SECRET` | Yes | Random secret for session signing. Generate with `openssl rand -hex 32` |

> [!IMPORTANT]
> `DATABASE_URL` must be an **absolute path** in production (e.g. `file:/var/www/panel/storage/dev.db`). Relative paths break when started from a different working directory.

> [!IMPORTANT]
> `URL` should be the actual IP or hostname the panel is accessible from. Setting it to `http://localhost` will prevent network access and cause CSP issues.

---

## API Reference

The panel exposes a REST API. See [`docs/specsheet.md`](docs/specsheet.md) for the complete route catalog with request/response formats, authentication details, and daemon communication.

138 HTTP routes, 4 WebSocket endpoints, HMAC-signed daemon communication, scoped API keys with granular permissions.

---

## Addon System

Addons extend the panel without modifying core files. They live under `storage/addons/` and are managed from `/admin/addons`.

See [`storage/addons/README.md`](storage/addons/README.md) for structure and API reference.

---

## Development

```bash
pnpm install
pnpm run dev        # Start in dev mode (auto-restart on changes)
pnpm run typecheck  # Typecheck
pnpm run lint       # Lint
pnpm run build      # Build for production
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'feat: describe your change'`
4. Push and open a pull request against `main`

Run `pnpm run lint` and `pnpm run typecheck` before submitting.

---

## Links

- Website: [airlinklabs.xyz](https://airlinklabs.xyz/)
- Docs: [airlinklabs.xyz/docs/quick-start](https://airlinklabs.xyz/docs/quick-start/)
- Discord: [discord.gg/ujXyxwwMHc](https://discord.gg/ujXyxwwMHc)
- GitHub: [github.com/airlinklabs/panel](https://github.com/airlinklabs/panel)

## License

MIT. See [`LICENSE`](LICENSE) for details.
