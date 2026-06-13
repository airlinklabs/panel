> [!NOTE]
> Airlink 2.0.0-rc1 is a release candidate. Core features are stable. Production use is at your own risk until the final release.

# Airlink Panel

**Open-source game server management — v2.0.0-rc1**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
[![License](https://img.shields.io/github/license/AirlinkLabs/panel)](https://github.com/AirlinkLabs/panel/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1302020587316707420)](https://discord.gg/ujXyxwwMHc)

---

## Overview

Airlink Panel is an open-source platform for deploying, monitoring, and managing game servers. It provides a full-featured web UI for both admins and users, a daemon-based node system for running containers, and an addon API for extending functionality without modifying core code.

For full documentation, visit **[airlinklabs.xyz/docs/quick-start/](https://airlinklabs.xyz/docs/quick-start/)**.

---

## Project leads

| Handle | Role |
|--------|------|
| [thavanish](https://github.com/thavanish) | Current maintainer |
| [privt00](https://github.com/privt00) | Project lead |
| [achul123](https://github.com/achul123) | Core developer |

---

## Prerequisites

- Node.js v18 or later
- pnpm v8 or later (`npm install -g pnpm`)
- Git

---

## Installation

### Option 1 — Installer script

```bash
sudo su
bash <(curl -s https://raw.githubusercontent.com/airlinklabs/panel/refs/heads/main/installer.sh)
```

Manage with systemd:

```bash
systemctl start airlink-panel
systemctl stop airlink-panel
systemctl restart airlink-panel
journalctl -u airlink-panel -f
```

### Option 2 — Manual

```bash
cd /var/www/
git clone https://github.com/AirlinkLabs/panel.git
cd panel

chown -R www-data:www-data /var/www/panel
chmod -R 755 /var/www/panel

# Install dependencies (pnpm auto-approves Prisma build scripts via package.json)
pnpm install

# Set up environment
cp example.env .env
# Edit .env — set PORT, URL, SESSION_SECRET, and DATABASE_URL at minimum

# Run database migrations and generate Prisma client
pnpm run migrate:deploy

# Compile TypeScript and build CSS
pnpm run build

# Start the panel
pnpm run start
```

`pnpm run start` applies any pending database schema changes automatically before launch.

### Running with pm2

```bash
npm install -g pm2
pm2 start "pnpm run start" --name airlink-panel
pm2 save
pm2 startup
```

### Environment variables

Copy `example.env` to `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NAME` | No | Panel display name (default: Airlink) |
| `NODE_ENV` | Yes | Set to `production` for live deployments |
| `URL` | Yes | Full URL the panel is served from, e.g. `http://192.168.1.10:3000` |
| `PORT` | Yes | Port to listen on |
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:/var/www/panel/prisma/dev.db` |
| `SESSION_SECRET` | Yes | Random secret for session signing — use `openssl rand -hex 32` |

> [!IMPORTANT]
> `DATABASE_URL` must be an **absolute path** (e.g. `file:/var/www/panel/prisma/dev.db`), not a relative one like `file:./dev.db`. Relative paths break when the process is started from a different working directory (e.g. via systemd). Database file lives in `prisma/` directory.

> [!IMPORTANT]
> `URL` should be set to the actual IP or hostname the panel is served from. Setting it to `http://localhost` will prevent the panel from being reachable over the network and causes CSP issues in the browser.

---

## Addon System

Addons extend the panel without modifying core files. They live under `storage/addons/` and are managed from `/admin/addons`.

See [`storage/addons/README.md`](storage/addons/README.md) for structure and API reference.

---

## Star History

<a href="https://www.star-history.com/?repos=airlinklabs%2Fpanel&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=airlinklabs/panel&type=date&legend=top-left" />
 </picture>
</a>

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'feat: describe your change'`
4. Push and open a pull request against `main`

Run `pnpm run lint` before submitting. Follow TypeScript best practices and update documentation alongside code changes.

---

## Links

- Website: [airlinklabs.github.io/home](https://airlinklabs.xyz/)
- Docs: [airlinklabs.github.io/home/docs/quickstart](https://airlinklabs.xyz/docs/quick-start/)
- Discord: [discord.gg/ujXyxwwMHc](https://discord.gg/ujXyxwwMHc)
- GitHub: [github.com/airlinklabs/panel](https://github.com/airlinklabs/panel)

## License

MIT — see [`LICENSE`](LICENSE) for details.
